import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerEligibility } from '@/lib/services/ownerVerification';

const HOST = 'skip-tracing-working-api.p.rapidapi.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const keys = () => [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));

async function api(path: string, counter: { calls: number }): Promise<any | null> {
  for (const key of keys()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(1500); counter.calls++;
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

/** Only individuals with a street mailing address on the property record can be traced; LLCs, trusts and PO boxes cannot. */
export const skipTraceEligibility = ownerEligibility;

/**
 * Searches by owner name and the mailing address on the county property record (STR homes are rarely owner-occupied, so the property
 * address itself would find the wrong people), then accepts a person only if their address history contains that mailing street.
 * The result is stored on the listing; nothing is contacted.
 */
export async function skipTraceListing(db: SupabaseClient, row: { property_id: string; matched_owner: Record<string, any> }): Promise<{ found: boolean; apiCalls: number; skipTrace?: Record<string, any>; error?: string }> {
  const counter = { calls: 0 };
  const owner = row.matched_owner; const mailing = String(owner?.mailing ?? '');
  const m = mailing.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (!m) return { found: false, apiCalls: 0, error: 'Cannot parse the mailing address' };
  const [, street, city, state, zip] = m;
  const results: Array<Record<string, any>> = [];
  for (const full of (owner.names as string[]).slice(0, 2)) {
    const name = full.replace(/\s+/g, ' ').trim();
    const found = await api(`/search/bynameaddress?${new URLSearchParams({ name, citystatezip: `${city}, ${state} ${zip ?? ''}`.trim(), page: '1' })}`, counter);
    const people: any[] = (found?.PeopleDetails ?? []).filter((p: any) => p['Person ID']).slice(0, 3);
    let hit: Record<string, any> | null = null;
    for (const p of people) {
      const d = await api(`/search/detailsbyID?${new URLSearchParams({ peo_id: p['Person ID'] })}`, counter); if (!d) continue;
      const addrs = [...(d['Current Address Details List'] ?? []), ...(d['Previous Address Details'] ?? [])];
      if (!addrs.some((a: any) => streetKey(String(a.street_address ?? '')) === streetKey(street))) continue;
      const phones = (d['All Phone Details'] ?? []).flatMap((ph: any) => { const e = normPhone(String(ph.phone_number ?? '')); return e ? [{ e164: e, type: String(ph.phone_type ?? '').toLowerCase().includes('wireless') ? 'mobile' : String(ph.phone_type ?? '').toLowerCase().includes('landline') ? 'landline' : 'other', lastReported: ph.last_reported ?? null }] : []; }).slice(0, 4);
      hit = { name: p.Name ?? name, age: p.Age ?? null, personId: p['Person ID'], addressConfirmed: true, phones, emails: (d['Email Addresses'] ?? []).slice(0, 3) };
      break;
    }
    results.push({ searched: name, found: hit });
  }
  const skipTrace = { at: new Date().toISOString(), results };
  await db.from('str_listings').update({ matched_owner: { ...owner, skipTrace } }).eq('property_id', row.property_id);
  return { found: results.some(x => x.found), apiCalls: counter.calls, skipTrace };
}
