import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isEntityName } from '@/lib/services/ownerVerification';
import { toE164 } from '@/lib/services/smsConsent';

const ENDPOINT = 'https://developers.homesage.ai/api/properties/skip-tracing/property-owner-information/';
/** Lookups per billing cycle across the whole app; each costs 4 Homesage credits. */
const MONTHLY_LOOKUPS = Number(process.env.HOMESAGE_MONTHLY_LOOKUPS ?? 60);

export interface HomesagePhone { e164: string; type: 'mobile' | 'landline' | 'other'; reachable: boolean; onDncList: boolean; lastReported: string | null; score: number | null }
export interface HomesagePerson {
  name: string; phones: HomesagePhone[]; emails: Array<{ email: string; tested: boolean }>; mailing: string | null;
  deceased: boolean; litigator: boolean; tcpaRisk: boolean;
  /** Never text or call: a known litigator, a TCPA risk, or deceased. */
  doNotContact: boolean;
}
export interface HomesageRecord { at: string; address: string; found: boolean; persons: HomesagePerson[]; error?: string }

/** The people on the record whose numbers and emails may be used. */
export const contactablePersons = (owner: Record<string, any> | null | undefined): HomesagePerson[] => ((owner?.homesage?.persons ?? []) as HomesagePerson[]).filter(p => !p.doNotContact);
/** Reachable mobiles first, then other mobiles, then the rest, newest report first. */
export function homesagePhones(owner: Record<string, any> | null | undefined): Array<HomesagePhone & { person: string }> {
  return contactablePersons(owner).flatMap(p => p.phones.map(x => ({ ...x, person: p.name })))
    .sort((a, b) => Number(b.reachable && b.type === 'mobile') - Number(a.reachable && a.type === 'mobile') || Number(b.type === 'mobile') - Number(a.type === 'mobile') || String(b.lastReported ?? '').localeCompare(String(a.lastReported ?? '')));
}

/** Homesage needs a ZIP. The US Census geocoder (free) supplies it when the registry address has none. */
async function zipFor(street: string, city: string, state: string): Promise<string | null> {
  const res = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(`${street}, ${city}, ${state}`)}&benchmark=Public_AR_Current&format=json`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const d = await res?.json().catch(() => null) as { result?: { addressMatches?: Array<{ addressComponents?: { zip?: string } }> } } | null;
  return d?.result?.addressMatches?.[0]?.addressComponents?.zip ?? null;
}

async function fullAddress(matched: string, market: string | null): Promise<string | null> {
  const a = matched.replace(/,?\s*US$/i, '').trim();
  if (/,\s*[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(a)) return a;
  const parts = a.split(',').map(s => s.trim()).filter(Boolean); const [marketCity, marketState] = String(market ?? '').split(',').map(s => s.trim());
  if (!parts[0] || !/^\d/.test(parts[0]) || !marketState) return null;
  const city = parts[1] && !/^[A-Za-z]{2}(\s+\d+)?$/.test(parts[1]) ? parts[1] : marketCity;
  const zip = await zipFor(parts[0], city, marketState.toUpperCase());
  return zip ? `${parts[0]}, ${city}, ${marketState.toUpperCase()} ${zip}` : null;
}

function toPerson(p: any): HomesagePerson {
  const ma = p.mailingAddress ?? {};
  const mailing = ma.formattedAddress ?? ([ma.street, ma.city, ma.state, ma.zip].filter(Boolean).join(', ') || null);
  const deceased = p.death?.deceased === true, litigator = p.litigator === true, tcpaRisk = p.dnc?.tcpa === true;
  return {
    name: String(p.name?.full ?? [p.name?.first, p.name?.last].filter(Boolean).join(' ')),
    phones: ((p.phoneNumbers ?? []) as any[]).flatMap(x => { const e = toE164(x.number); return e ? [{ e164: e, type: (x.type === 'Mobile' ? 'mobile' : /land/i.test(String(x.type)) ? 'landline' : 'other') as HomesagePhone['type'], reachable: x.reachable === true, onDncList: x.dnc === true, lastReported: x.lastReportedDate ? String(x.lastReportedDate).slice(0, 10) : null, score: typeof x.score === 'number' ? x.score : null }] : []; }),
    emails: ((p.emails ?? []) as any[]).filter(e => e?.email).map(e => ({ email: String(e.email).toLowerCase(), tested: e.tested === true })),
    mailing, deceased, litigator, tcpaRisk, doNotContact: deceased || litigator || tcpaRisk,
  };
}

/** Owner lookup by property address (4 Homesage credits). `stop` means the key is rejected or out of credits, so the run should end. */
export async function homesageOwnerLookup(address: string): Promise<{ record: HomesageRecord; stop?: boolean }> {
  const key = process.env.HOMESAGE_API_KEY;
  const at = new Date().toISOString();
  if (!key) return { record: { at, address, found: false, persons: [], error: 'HOMESAGE_API_KEY is not set' }, stop: true };
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ property_address: address }), signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (!res) return { record: { at, address, found: false, persons: [], error: 'No response' } };
  if ([401, 402, 403, 429].includes(res.status)) return { record: { at, address, found: false, persons: [], error: `HTTP ${res.status}` }, stop: true };
  const j = await res.json().catch(() => null) as { persons?: any[]; error?: string } | null;
  if (!res.ok || !j?.persons) return { record: { at, address, found: false, persons: [], error: res.status === 404 ? undefined : String(j?.error ?? `HTTP ${res.status}`).slice(0, 160) } };
  const persons = j.persons.map(toPerson).filter(p => p.name);
  return { record: { at, address, found: persons.length > 0, persons } };
}

export interface HomesageQueueItem { property_id: string; market: string | null; matched_address: string | null; matched_owner: Record<string, any>; is_elite: boolean | null; is_luxury: boolean | null; revenue_potential_ltm: number | null }

/**
 * Who gets a Homesage lookup: every ELITE home, and any home whose owner is a business or trust with no named person (the case the other
 * skip-trace cannot trace). Each at most once. ELITE first, then LUXURY, then by potential earnings.
 */
export async function homesageQueue(db: SupabaseClient): Promise<HomesageQueueItem[]> {
  const { data } = await db.from('str_listings').select('property_id,market,matched_address,matched_owner,is_elite,is_luxury,revenue_potential_ltm,pipeline_stage')
    .eq('match_status', 'unique').not('matched_owner', 'is', null).not('pipeline_stage', 'in', '(declined,not_a_fit)').limit(5000);
  const rows = data ?? [];
  const shared = new Map<string, number>(); for (const r of rows) shared.set(r.matched_address, (shared.get(r.matched_address) ?? 0) + 1);
  const { data: optedOut } = await db.from('cohost_offer_links').select('property_id').not('opted_out_at', 'is', null).limit(5000);
  const out = new Set((optedOut ?? []).map(o => o.property_id as string));
  return rows.filter(r => {
    const o = r.matched_owner as Record<string, any>;
    if (o.homesage || (shared.get(r.matched_address) ?? 1) > 1 || out.has(r.property_id) || !r.matched_address) return false;
    const names: string[] = o.names ?? [];
    return !!r.is_elite || (names.length > 0 && names.every(isEntityName));
  }).sort((a, b) => Number(!!b.is_elite) - Number(!!a.is_elite) || Number(!!b.is_luxury) - Number(!!a.is_luxury) || Number(b.revenue_potential_ltm ?? 0) - Number(a.revenue_potential_ltm ?? 0)) as HomesageQueueItem[];
}

/** Looks up the next owners in the queue, within the monthly cap. People flagged litigator, TCPA risk or deceased have their numbers added to the text suppression list. */
export async function runHomesageLookups(db: SupabaseClient, opts: { max: number }): Promise<{ queued: number; looked: number; found: number; flagged: number; stopped?: string }> {
  const res = { queued: 0, looked: 0, found: 0, flagged: 0, stopped: undefined as string | undefined };
  if (!process.env.HOMESAGE_API_KEY) { res.stopped = 'no key'; return res; }
  const used = await usedThisMonth(db);
  const queue = await homesageQueue(db); res.queued = queue.length;
  let budget = Math.min(opts.max, Math.max(0, MONTHLY_LOOKUPS - used));
  if (budget === 0 && queue.length) res.stopped = 'monthly cap';
  for (const item of queue) {
    if (budget <= 0) break;
    const address = await fullAddress(item.matched_address!, item.market);
    const { record, stop } = address ? await homesageOwnerLookup(address) : { record: { at: new Date().toISOString(), address: item.matched_address!, found: false, persons: [], error: 'no ZIP for this address' } as HomesageRecord, stop: false };
    if (stop) { res.stopped = record.error ?? 'stopped'; break; }
    if (address) { budget--; res.looked++; }
    if (record.error === 'No response') continue;
    if (record.found) res.found++;
    await db.from('str_listings').update({ matched_owner: { ...item.matched_owner, homesage: record } }).eq('property_id', item.property_id);
    for (const p of record.persons.filter(x => x.doNotContact)) {
      res.flagged++;
      if (p.phones.length) await db.from('sms_suppressions').upsert(p.phones.map(x => ({ phone_e164: x.e164, reason: 'do_not_contact', last_message: `Homesage flag: ${p.litigator ? 'litigator ' : ''}${p.tcpaRisk ? 'TCPA risk ' : ''}${p.deceased ? 'deceased' : ''}`.trim() })), { onConflict: 'phone_e164' });
    }
  }
  return res;
}

/** Lookups made in the current billing cycle, for owners and for candidate homes; a lookup that failed to parse the address was not charged. */
async function usedThisMonth(db: SupabaseClient): Promise<number> {
  // Credits renew on the billing day (the 12th), so lookups are counted from the most recent one.
  const cycleStart = new Date(); cycleStart.setUTCHours(0, 0, 0, 0);
  const cycleDay = Number(process.env.HOMESAGE_CYCLE_DAY ?? 12);
  if (cycleStart.getUTCDate() < cycleDay) cycleStart.setUTCMonth(cycleStart.getUTCMonth() - 1);
  cycleStart.setUTCDate(cycleDay);
  const monthStart = cycleStart;
  const inMonth = (r: HomesageRecord | undefined) => !!r && !r.error?.startsWith('no ZIP') && Date.parse(r.at) >= monthStart.getTime();
  const { data: owners } = await db.from('str_listings').select('matched_owner').not('matched_owner->homesage', 'is', null).limit(5000);
  const { data: amb } = await db.from('str_listings').select('match_candidates').eq('match_status', 'ambiguous').or('is_elite.eq.true,is_luxury.eq.true').limit(500);
  return (owners ?? []).filter(r => inMonth((r.matched_owner as any).homesage)).length
    + (amb ?? []).reduce((n, r) => n + ((r.match_candidates as any[] | null) ?? []).filter(c => inMonth(c.homesage)).length, 0);
}

/**
 * ELITE homes that could be one of up to three candidate homes get each candidate's owner looked up, biggest potential first, so a person can
 * pick the right home and already have the owner's contacts. Nothing here is treated as the owner until someone confirms the home.
 */
export async function runHomesageCandidateLookups(db: SupabaseClient, opts: { max: number }): Promise<{ looked: number; found: number; stopped?: string }> {
  const res = { looked: 0, found: 0, stopped: undefined as string | undefined };
  if (!process.env.HOMESAGE_API_KEY) { res.stopped = 'no key'; return res; }
  let budget = Math.min(opts.max, Math.max(0, MONTHLY_LOOKUPS - await usedThisMonth(db)));
  if (budget === 0) { res.stopped = 'monthly cap'; return res; }
  const { data: rows } = await db.from('str_listings').select('property_id,match_candidates,revenue_potential_ltm,is_elite').eq('match_status', 'ambiguous').or('is_elite.eq.true,is_luxury.eq.true').order('revenue_potential_ltm', { ascending: false, nullsFirst: false }).limit(300);
  const data = (rows ?? []).sort((a, b) => Number(!!b.is_elite) - Number(!!a.is_elite));
  for (const l of data) {
    const cands = [...((l.match_candidates as any[] | null) ?? [])]; if (cands.length > 3) continue;
    let changed = false;
    for (const c of cands) {
      if (budget <= 0 || c.homesage || !c.address) continue;
      const { record, stop } = await homesageOwnerLookup(String(c.address).replace(/,?\s*US$/i, ''));
      if (stop) { res.stopped = record.error ?? 'stopped'; budget = 0; break; }
      if (record.error === 'No response') continue;
      budget--; res.looked++; if (record.found) res.found++; c.homesage = record; changed = true;
      for (const p of record.persons.filter(x => x.doNotContact)) if (p.phones.length) await db.from('sms_suppressions').upsert(p.phones.map(x => ({ phone_e164: x.e164, reason: 'do_not_contact', last_message: 'Homesage flag' })), { onConflict: 'phone_e164' });
    }
    if (changed) await db.from('str_listings').update({ match_candidates: cands }).eq('property_id', l.property_id);
    if (budget <= 0) break;
  }
  return res;
}
