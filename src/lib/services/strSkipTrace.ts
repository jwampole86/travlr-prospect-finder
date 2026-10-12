import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerEligibility, personalNames } from '@/lib/services/ownerVerification';
import { SKIPTRACE_RESERVE, readSkipTraceRemaining, recordSkipTraceRemaining } from '@/lib/services/skipTraceQuota';

const HOST = 'skip-tracing-working-api.p.rapidapi.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const keys = () => [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));

interface Counter { calls: number; quotaStopped: boolean }
const known = new Map<string, number>();

/** One request. A key at or below the reserve is skipped, so a run stops instead of running into overage charges. */
async function api(path: string, counter: Counter, reserve = SKIPTRACE_RESERVE): Promise<any | null> {
  let usable = false;
  for (const key of keys()) {
    if (!known.has(key) || (known.get(key) ?? Infinity) < reserve) { const fresh = await readSkipTraceRemaining(key); if (fresh == null) known.delete(key); else known.set(key, fresh); }
    if ((known.get(key) ?? Infinity) < reserve) continue;
    usable = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(1500); counter.calls++;
      const res = await fetch(`https://${HOST}${path}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, signal: AbortSignal.timeout(45_000) });
      if ([401, 403, 429].includes(res.status)) break;
      const left = res.headers.get('x-ratelimit-requests-remaining'); const reset = Number(res.headers.get('x-ratelimit-requests-reset'));
      if (left !== null && Number.isFinite(Number(left))) { known.set(key, Number(left)); void recordSkipTraceRemaining(key, Number(left), Number.isFinite(reset) && reset > 0 ? reset : null); }
      const d = await res.json().catch(() => null);
      if (d && typeof d === 'object' && /rate limit/i.test(String((d as any).message))) { await sleep(4000); continue; }
      return res.ok ? d : null;
    }
  }
  if (!usable) counter.quotaStopped = true;
  return null;
}

const streetKey = (s: string) => s.toUpperCase().replace(/[.,#]/g, ' ').replace(/\b(PO|P O) BOX\b/, 'POBOX').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
const normPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : null; };

/** A named person with a street mailing address (or, failing that, the property address) can be traced; businesses with no named person and PO boxes cannot. */
export const skipTraceEligibility = ownerEligibility;

/** "Adney, Brian" becomes "Brian Adney"; anything else is searched as written. */
const searchName = (n: string) => { const t = n.replace(/\s+/g, ' ').trim(); const m = t.match(/^([^,]+),\s*([^,]+)$/); return m ? `${m[2]} ${m[1]}`.trim() : t; };

interface Target { street: string; city: string; state: string; zip?: string; via: 'mailing' | 'property' }

/** Where to confirm a person: the county mailing address, else the permitted property itself (an owner who lives there). */
function traceTarget(row: { market?: string | null; matched_address?: string | null; matched_owner: Record<string, any> }): Target | null {
  const mailing = String(row.matched_owner?.mailing ?? '');
  const m = mailing.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (m && !/^PO BOX/i.test(mailing)) return { street: m[1], city: m[2], state: m[3], zip: m[4], via: 'mailing' };
  const parts = String(row.matched_address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const [marketCity, marketState] = String(row.market ?? '').split(',').map(s => s.trim());
  if (!parts[0] || !/^\d/.test(parts[0]) || !marketState) return null;
  const city = parts[1] && !/^[A-Za-z]{2}(\s+\d+)?$/.test(parts[1]) ? parts[1] : marketCity;
  return city ? { street: parts[0], city, state: marketState.toUpperCase(), via: 'property' } : null;
}

/**
 * Searches each named person by name and city, then accepts someone only if their address history contains the confirming street
 * (see traceTarget). The result is stored on the listing; nothing is contacted. When the allowance is at its reserve nothing is
 * stored and quotaStopped is returned, so the listing is tried again later.
 */
export async function skipTraceListing(
  db: SupabaseClient,
  row: { property_id: string; market?: string | null; matched_address?: string | null; matched_owner: Record<string, any> },
  opts: { reserve?: number } = {},
): Promise<{ found: boolean; apiCalls: number; skipTrace?: Record<string, any>; error?: string; quotaStopped?: boolean }> {
  const counter: Counter = { calls: 0, quotaStopped: false };
  const owner = row.matched_owner; const target = traceTarget(row);
  if (!target) return { found: false, apiCalls: 0, error: 'No address to confirm a person against' };
  const results: Array<Record<string, any>> = [];
  for (const full of personalNames(owner).slice(0, 2)) {
    const name = searchName(full);
    const found = await api(`/search/bynameaddress?${new URLSearchParams({ name, citystatezip: `${target.city}, ${target.state} ${target.zip ?? ''}`.trim(), page: '1' })}`, counter, opts.reserve);
    if (counter.quotaStopped) return { found: false, apiCalls: counter.calls, quotaStopped: true };
    const people: any[] = (found?.PeopleDetails ?? []).filter((p: any) => p['Person ID']).slice(0, 3);
    let hit: Record<string, any> | null = null;
    for (const p of people) {
      const d = await api(`/search/detailsbyID?${new URLSearchParams({ peo_id: p['Person ID'] })}`, counter, opts.reserve); if (!d) continue;
      const addrs = [...(d['Current Address Details List'] ?? []), ...(d['Previous Address Details'] ?? [])];
      if (!addrs.some((a: any) => streetKey(String(a.street_address ?? '')) === streetKey(target.street))) continue;
      const phones = (d['All Phone Details'] ?? []).flatMap((ph: any) => { const e = normPhone(String(ph.phone_number ?? '')); return e ? [{ e164: e, type: String(ph.phone_type ?? '').toLowerCase().includes('wireless') ? 'mobile' : String(ph.phone_type ?? '').toLowerCase().includes('landline') ? 'landline' : 'other', lastReported: ph.last_reported ?? null }] : []; }).slice(0, 4);
      hit = { name: p.Name ?? name, age: p.Age ?? null, personId: p['Person ID'], addressConfirmed: true, confirmedBy: target.via, phones, emails: (d['Email Addresses'] ?? []).slice(0, 3) };
      break;
    }
    results.push({ searched: name, found: hit });
  }
  const attempts = Number(owner.skipTrace?.attempts ?? 0) + 1;
  const skipTrace = { at: new Date().toISOString(), via: target.via, attempts, results };
  await db.from('str_listings').update({ matched_owner: { ...owner, skipTrace } }).eq('property_id', row.property_id);
  return { found: results.some(x => x.found), apiCalls: counter.calls, skipTrace };
}
