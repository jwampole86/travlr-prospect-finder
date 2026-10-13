import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { lookupAirdna } from '@/lib/services/airdnaEstimate';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface EnrichResult { looked: number; found: number; noData: number; failed: number; quotaRemaining: number | null; stopped: string; sample: string[] }

const SKIP_DAYS = 30;

/** Lead ids in the order a lookup helps most: queued texts, then replies and clicks, then everyone already texted, then the best-scoring homes. */
async function priorityIds(db: Db, want: number): Promise<string[]> {
  const ids: string[] = [];
  const add = (xs: Array<string | null | undefined>) => { for (const x of xs) if (x && !ids.includes(x)) ids.push(x); };
  const { data: queued } = await db.from('outreach_history').select('lead_id').eq('channel', 'sms').eq('metadata->>twilio_status', 'scheduled').limit(1000);
  add((queued ?? []).map(r => r.lead_id));
  const { data: warm } = await db.from('sms_lead_engagement').select('lead_id').in('temperature', ['hot', 'warm']).limit(1000);
  add((warm ?? []).map(r => r.lead_id));
  const { data: texted } = await db.from('sms_lead_engagement').select('lead_id').limit(2000);
  add((texted ?? []).map(r => r.lead_id));
  if (ids.length < want * 3) {
    const { data: top } = await db.from('leads').select('id').is('airdna_checked_at', null).gte('beds', 3).not('address', 'is', null).or('is_synthetic.is.null,is_synthetic.eq.false').order('prospect_score', { ascending: false }).limit(want * 2);
    add((top ?? []).map(r => r.id));
  }
  return ids;
}

/** Looks up the highest-value leads that have no recent AirDNA figures, stopping at the budget, the quota reserve or the deadline. */
export async function enrichPriorityLeads(db: Db, opts: { max: number; reserve: number; deadlineMs?: number }): Promise<EnrichResult> {
  const res: EnrichResult = { looked: 0, found: 0, noData: 0, failed: 0, quotaRemaining: null, stopped: 'budget reached', sample: [] };
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  const ids = await priorityIds(db, opts.max);
  const cutoff = Date.now() - SKIP_DAYS * 86_400_000;
  let strikes = 0;

  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('leads').select('id,address,city,state,zip,beds,baths,airdna_adr,airdna_checked_at').in('id', ids.slice(i, i + 100));
    const byId = new Map((data ?? []).map(l => [l.id as string, l]));
    for (const id of ids.slice(i, i + 100)) {
      const l = byId.get(id);
      if (!l || !l.address || !l.state) continue;
      if (l.airdna_checked_at && Date.parse(l.airdna_checked_at) > cutoff) continue;
      if (res.looked >= opts.max) return res;
      if (Date.now() > deadline) { res.stopped = 'time limit'; return res; }
      if (res.quotaRemaining != null && res.quotaRemaining <= opts.reserve) { res.stopped = `kept ${opts.reserve} requests in reserve`; return res; }

      const r = await lookupAirdna(db, { id: l.id, address: l.address, city: l.city, state: l.state, zip: l.zip, beds: l.beds, baths: l.baths });
      res.looked++;
      if (r.quotaRemaining != null) res.quotaRemaining = r.quotaRemaining;
      if (r.transient) { res.failed++; if (++strikes >= 4) { res.stopped = 'AirDNA kept failing'; return res; } continue; }
      strikes = 0;
      if (r.figures) { res.found++; if (res.sample.length < 5) res.sample.push(`${l.address}, ${l.city}: $${r.figures.adr}/night, ${r.figures.occupancy}% booked`); } else res.noData++;
    }
  }
  res.stopped = 'no more leads to look up';
  return res;
}
