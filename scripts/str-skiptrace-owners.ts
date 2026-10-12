/**
 * Skip-traces ONLY the owners of record for listings with a unique, human-reviewable registry match.
 * Searches by owner name + the mailing address on the county property record (STR homes are rarely owner-occupied, so the
 * property address itself would find the wrong people), then accepts a person only if their address history contains that mailing street.
 * Results are stored on the listing; nothing is contacted.
 *
 *   npx tsx scripts/str-skiptrace-owners.ts            (dry run: lists who would be searched)
 *   npx tsx scripts/str-skiptrace-owners.ts --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const GO = process.argv.includes('--go');
const HOST = 'skip-tracing-working-api.p.rapidapi.com';
const KEYS = [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let calls = 0;

async function api(path: string): Promise<any | null> {
  for (const key of KEYS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(1500); calls++;
      const res = await fetch(`https://${HOST}${path}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, signal: AbortSignal.timeout(45_000) });
      if ([401, 403, 429].includes(res.status)) break;
      const d = await res.json().catch(() => null);
      if (d && typeof d === 'object' && /rate limit/i.test(String((d as any).message))) { await sleep(4000); continue; }
      return res.ok ? d : null;
    }
  }
  return null;
}

const streetKey = (s: string) => s.toUpperCase().replace(/[.,#]/g, ' ').replace(/\b(PO|P O) BOX\b/, 'POBOX').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
const normPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : null; };

(async () => {
  const db = getSupabaseAdmin();
  const { data } = await db.from('str_listings').select('property_id,title,matched_address,matched_owner,match_candidates').eq('match_status', 'unique');
  // A property claimed by two listings cannot be trusted for either one.
  const addrCount = new Map<string, number>(); for (const r of data ?? []) addrCount.set(r.matched_address, (addrCount.get(r.matched_address) ?? 0) + 1);
  const todo = (data ?? []).filter(r => (addrCount.get(r.matched_address) ?? 0) === 1 && r.matched_owner?.type === 'Individual' && r.matched_owner?.names?.length && r.matched_owner?.mailing && !/^PO BOX/i.test(String(r.matched_owner.mailing)));
  console.log(`unique matches ${data?.length} | eligible for skip-trace ${todo.length}:`);
  todo.forEach(r => console.log(`  ${r.matched_address.split(',')[0]} -> ${r.matched_owner.names.join(' & ')} | mailing ${r.matched_owner.mailing}`));
  if (!GO) { console.log('DRY RUN: no searches made. Re-run with --go.'); return; }

  for (const r of todo) {
    const mailing = String(r.matched_owner.mailing); const m = mailing.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/);
    if (!m) { console.log('skip (cannot parse mailing):', mailing); continue; }
    const [, street, city, state, zip] = m;
    const results: Array<Record<string, any>> = [];
    for (const full of (r.matched_owner.names as string[]).slice(0, 2)) {
      const name = full.replace(/\s+/g, ' ').trim();
      const found = await api(`/search/bynameaddress?${new URLSearchParams({ name, citystatezip: `${city}, ${state} ${zip ?? ''}`.trim(), page: '1' })}`);
      const people: any[] = (found?.PeopleDetails ?? []).filter((p: any) => p['Person ID']).slice(0, 3);
      let hit: Record<string, any> | null = null;
      for (const p of people) {
        const d = await api(`/search/detailsbyID?${new URLSearchParams({ peo_id: p['Person ID'] })}`); if (!d) continue;
        const addrs = [...(d['Current Address Details List'] ?? []), ...(d['Previous Address Details'] ?? [])];
        const confirmed = addrs.some((a: any) => streetKey(String(a.street_address ?? '')) === streetKey(street));
        if (!confirmed) continue;
        const phones = (d['All Phone Details'] ?? []).flatMap((ph: any) => { const e = normPhone(String(ph.phone_number ?? '')); return e ? [{ e164: e, type: String(ph.phone_type ?? '').toLowerCase().includes('wireless') ? 'mobile' : String(ph.phone_type ?? '').toLowerCase().includes('landline') ? 'landline' : 'other', lastReported: ph.last_reported ?? null }] : []; }).slice(0, 4);
        hit = { name: p.Name ?? name, age: p.Age ?? null, personId: p['Person ID'], addressConfirmed: true, phones, emails: (d['Email Addresses'] ?? []).slice(0, 3) };
        break;
      }
      results.push({ searched: name, found: hit });
    }
    const ok = results.some(x => x.found);
    console.log(`${r.matched_address.split(',')[0]}: ${ok ? results.filter(x => x.found).map(x => `${x.found.name} (${x.found.phones.length} phones, ${x.found.emails.length} emails)`).join('; ') : 'no address-confirmed person found'}`);
    await db.from('str_listings').update({ matched_owner: { ...r.matched_owner, skipTrace: { at: new Date().toISOString(), results } } }).eq('property_id', r.property_id);
  }
  console.log('skip-trace API calls:', calls);
})().catch(e => { console.error(e); process.exit(1); });
