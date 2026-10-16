import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/services/pagedRows';
import { UNDISCLOSED_ADDRESS_PREFIX } from '@/lib/services/fsboSkipTraceService';
import { skipTraceEligibility, skipTraceListing } from '@/lib/services/strSkipTrace';

const RETRY_AFTER_DAYS = 30;
const MAX_ATTEMPTS = 3;

export interface QueueItem { property_id: string; market: string | null; matched_address: string | null; matched_owner: Record<string, any>; is_elite: boolean | null; is_luxury: boolean | null; revenue_potential_ltm: number | null;
  /** Other listings of the same home with the same owner of record (for example the Airbnb and Vrbo pages); they get this item's result without another search. */
  siblings?: Array<{ property_id: string; matched_owner: Record<string, any> }> }

const ownerKey = (r: Record<string, any>) => `${String(r.matched_address).toLowerCase()}|${((r.matched_owner?.names ?? []) as string[]).map(n => n.toLowerCase().trim()).sort().join('&')}`;
const rank = (a: Record<string, any>, b: Record<string, any>) => Number(!!b.is_elite) - Number(!!a.is_elite) || Number(!!b.is_luxury) - Number(!!a.is_luxury) || Number(b.revenue_potential_ltm ?? 0) - Number(a.revenue_potential_ltm ?? 0);
const foundIn = (r: Record<string, any>) => (r.matched_owner?.skipTrace?.results ?? []).some((x: any) => x.found);

interface Plan { queue: QueueItem[]; copies: Array<{ property_id: string; matched_owner: Record<string, any>; skipTrace: Record<string, any> }> }

/**
 * Owners of matched homes who can be traced and have not been (or not found, a month ago), most valuable first:
 * ELITE, then LUXURY, then by potential earnings. Left out: declined or not-a-fit prospects, anyone who opted out of the offer page, and
 * addresses matched to different owners (the match is not clear enough to spend a search on).
 * One home often has several listings (Airbnb, Vrbo) under the same owner of record. Those are traced once and the result is shared.
 */
async function planCohostTrace(db: SupabaseClient): Promise<Plan> {
  const rows = await fetchAllRows<Record<string, any>>(() => db.from('str_listings').select('property_id,market,matched_address,matched_owner,is_elite,is_luxury,revenue_potential_ltm,pipeline_stage')
    .eq('match_status', 'unique').not('matched_owner', 'is', null).not('pipeline_stage', 'in', '(declined,not_a_fit)').order('property_id'));
  const owners = new Map<string, Set<string>>(); for (const r of rows) { const set = owners.get(r.matched_address) ?? new Set<string>(); set.add(ownerKey(r)); owners.set(r.matched_address, set); }
  const optedOut = await fetchAllRows(() => db.from('cohost_offer_links').select('property_id').not('opted_out_at', 'is', null).order('property_id'));
  const out = new Set(optedOut.map(o => o.property_id as string));
  const now = Date.now();
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const r of rows) {
    if ((owners.get(r.matched_address)?.size ?? 1) > 1 || out.has(r.property_id) || !skipTraceEligibility(r.matched_owner, r).eligible) continue;
    const g = groups.get(ownerKey(r)) ?? []; g.push(r); groups.set(ownerKey(r), g);
  }
  const queue: QueueItem[] = []; const copies: Plan['copies'] = [];
  for (const g of groups.values()) {
    g.sort(rank);
    const donor = g.find(foundIn);
    if (donor) { for (const r of g) if (!r.matched_owner.skipTrace) copies.push({ property_id: r.property_id, matched_owner: r.matched_owner, skipTrace: donor.matched_owner.skipTrace }); continue; }
    const due = g.find(r => { const st = r.matched_owner.skipTrace; return !st || (Number(st.attempts ?? 1) < MAX_ATTEMPTS && now - Date.parse(st.at) > RETRY_AFTER_DAYS * 86_400_000); });
    if (!due) continue;
    queue.push({ ...(due as QueueItem), siblings: g.filter(r => r !== due).map(r => ({ property_id: r.property_id, matched_owner: r.matched_owner })) });
  }
  return { queue: queue.sort(rank), copies };
}

export async function cohostTraceQueue(db: SupabaseClient): Promise<QueueItem[]> { return (await planCohostTrace(db)).queue; }

const share = (db: SupabaseClient, to: { property_id: string; matched_owner: Record<string, any> }, skipTrace: Record<string, any>) =>
  db.from('str_listings').update({ matched_owner: { ...to.matched_owner, skipTrace } }).eq('property_id', to.property_id);

/** Traces up to `max` homes from the queue, stopping when the allowance reaches its reserve or time runs out. */
export async function runCohostSkipTrace(db: SupabaseClient, opts: { max: number; deadlineMs: number }): Promise<{ queued: number; traced: number; found: number; shared: number; apiCalls: number; stopped?: 'quota' | 'deadline' }> {
  const { queue, copies } = await planCohostTrace(db);
  const started = Date.now(); const res = { queued: queue.length, traced: 0, found: 0, shared: 0, apiCalls: 0, stopped: undefined as 'quota' | 'deadline' | undefined };
  for (const c of copies) { await share(db, c, c.skipTrace); res.shared++; }
  for (const item of queue.slice(0, opts.max)) {
    if (Date.now() - started > opts.deadlineMs) { res.stopped = 'deadline'; break; }
    const t = await skipTraceListing(db, item);
    res.apiCalls += t.apiCalls;
    if (t.quotaStopped) { res.stopped = 'quota'; break; }
    if (t.error) continue;
    res.traced++; if (t.found) res.found++;
    if (t.skipTrace) for (const sib of item.siblings ?? []) { await share(db, sib, t.skipTrace); res.shared++; }
  }
  return res;
}

/**
 * Queues CRM leads moved to the co-host program that have no contact yet. The fsbo-skip-trace job (every 10 minutes) works the queue,
 * paced against the monthly allowance. Units and undisclosed addresses are left out, as they are for every other lead.
 */
export async function enqueueCohostCrmLeads(db: SupabaseClient, limit = 50): Promise<number> {
  const { data } = await db.from('leads').select('id').eq('program', 'co_host').eq('is_synthetic', false)
    .or('is_apartment_community.is.null,is_apartment_community.eq.false').is('contact_name', null).is('skip_trace_status', null)
    .not('zip', 'is', null).not('address', 'ilike', `${UNDISCLOSED_ADDRESS_PREFIX}%`).not('address', 'like', '%#%').limit(limit);
  const ids = (data ?? []).map(l => l.id as string);
  if (ids.length) await db.from('leads').update({ skip_trace_status: 'PENDING' }).in('id', ids);
  return ids.length;
}
