import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/services/pagedRows';
import { skipTraceEligibility, skipTraceListing } from '@/lib/services/strSkipTrace';

const RETRY_AFTER_DAYS = 30;
const MAX_ATTEMPTS = 3;

export interface QueueItem { property_id: string; market: string | null; matched_address: string | null; matched_owner: Record<string, any>; is_elite: boolean | null; is_luxury: boolean | null; revenue_potential_ltm: number | null }

/**
 * Owners of uniquely matched homes who can be traced and have not been (or not found, a month ago), most valuable first:
 * ELITE, then LUXURY, then by potential earnings. Left out: properties matched to several listings, declined or not-a-fit prospects,
 * and anyone who opted out of the offer page.
 */
export async function cohostTraceQueue(db: SupabaseClient): Promise<QueueItem[]> {
  const rows = await fetchAllRows<Record<string, any>>(() => db.from('str_listings').select('property_id,market,matched_address,matched_owner,is_elite,is_luxury,revenue_potential_ltm,pipeline_stage')
    .eq('match_status', 'unique').not('matched_owner', 'is', null).not('pipeline_stage', 'in', '(declined,not_a_fit)').order('property_id'));
  const shared = new Map<string, number>(); for (const r of rows) shared.set(r.matched_address, (shared.get(r.matched_address) ?? 0) + 1);
  const optedOut = await fetchAllRows(() => db.from('cohost_offer_links').select('property_id').not('opted_out_at', 'is', null).order('property_id'));
  const out = new Set(optedOut.map(o => o.property_id as string));
  const now = Date.now();
  return rows.filter(r => {
    const o = r.matched_owner as Record<string, any>;
    if ((shared.get(r.matched_address) ?? 1) > 1 || out.has(r.property_id) || !skipTraceEligibility(o, r).eligible) return false;
    const st = o.skipTrace; if (!st) return true;
    if ((st.results ?? []).some((x: any) => x.found)) return false;
    return Number(st.attempts ?? 1) < MAX_ATTEMPTS && now - Date.parse(st.at) > RETRY_AFTER_DAYS * 86_400_000;
  }).sort((a, b) => Number(!!b.is_elite) - Number(!!a.is_elite) || Number(!!b.is_luxury) - Number(!!a.is_luxury) || Number(b.revenue_potential_ltm ?? 0) - Number(a.revenue_potential_ltm ?? 0)) as QueueItem[];
}

/** Traces up to `max` listings from the queue, stopping when the allowance reaches its reserve or time runs out. */
export async function runCohostSkipTrace(db: SupabaseClient, opts: { max: number; deadlineMs: number }): Promise<{ queued: number; traced: number; found: number; apiCalls: number; stopped?: 'quota' | 'deadline' }> {
  const queue = await cohostTraceQueue(db);
  const started = Date.now(); const res = { queued: queue.length, traced: 0, found: 0, apiCalls: 0, stopped: undefined as 'quota' | 'deadline' | undefined };
  for (const item of queue.slice(0, opts.max)) {
    if (Date.now() - started > opts.deadlineMs) { res.stopped = 'deadline'; break; }
    const t = await skipTraceListing(db, item);
    res.apiCalls += t.apiCalls;
    if (t.quotaStopped) { res.stopped = 'quota'; break; }
    if (t.error) continue;
    res.traced++; if (t.found) res.found++;
  }
  return res;
}
