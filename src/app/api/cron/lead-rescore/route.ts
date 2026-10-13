import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SCORING_LEAD_COLUMNS, SCORE_MODEL_VERSION } from '@/lib/scoring/prospectScoring';
import { scoreLeadRows, writeScores } from '@/lib/services/leadScoringService';
import { loadScoreSignals } from '@/lib/services/leadScoreSignals';

export const maxDuration = 300;

const MIN = 60_000;
const COLUMNS = `id,prospect_score,score_model_version,${SCORING_LEAD_COLUMNS}`;
const notSynthetic = 'is_synthetic.is.null,is_synthetic.eq.false';
const staleOr = (olderMs: number) => `score_refreshed_at.is.null,score_refreshed_at.lt.${new Date(Date.now() - olderMs).toISOString()},score_model_version.is.null,score_model_version.neq.${SCORE_MODEL_VERSION}`;

/**
 * GET /api/cron/lead-rescore  (CRON_SECRET, every 15 minutes)
 * Keeps prospect scores current at a rate that fits how fast each lead changes:
 *   live      leads with a text, reply, link open, call or open task in the last 30 days: at least every 45 minutes
 *   pipeline  skip-traced or verified leads: daily
 *   rest      everything else: weekly, and immediately when the scoring model version changes
 * Replies, link opens and answered calls come from their own tables, so engagement moves the score as it happens.
 * ?dryRun=true measures without writing.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
  const db = getSupabaseAdmin();
  const deadline = Date.now() + 230_000;
  const stats = { live: 0, pipeline: 0, rest: 0, changed: 0, written: 0, model: SCORE_MODEL_VERSION };

  async function run(tier: 'live' | 'pipeline' | 'rest', rows: Array<Record<string, unknown>>, withSignals: boolean) {
    if (!rows.length) return;
    const signals = withSignals ? await loadScoreSignals(db, rows.map(r => String(r.id))).catch(() => undefined) : undefined;
    const scored = scoreLeadRows(rows, signals);
    stats[tier] += scored.length; stats.changed += scored.filter(s => s.before !== s.after).length;
    if (!dryRun) stats.written += await writeScores(db, scored);
  }

  // Live: leads that had any recent contact or activity.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [h, l, t] = await Promise.all([
    db.from('outreach_history').select('lead_id').gte('sent_at', since).not('lead_id', 'is', null).order('sent_at', { ascending: false }).limit(4000),
    db.from('sms_link_events').select('lead_id').gte('occurred_at', since).eq('is_bot', false).limit(2000),
    db.from('lead_tasks').select('lead_id').in('status', ['pending', 'in_progress']).limit(2000),
  ]);
  const liveIds = [...new Set([...(h.data ?? []), ...(l.data ?? []), ...(t.data ?? [])].map(r => String(r.lead_id)).filter(Boolean))];
  for (let i = 0; i < liveIds.length && Date.now() < deadline; i += 200) {
    const { data } = await db.from('leads').select(COLUMNS).in('id', liveIds.slice(i, i + 200)).or(notSynthetic).or(staleOr(45 * MIN));
    await run('live', (data ?? []) as Array<Record<string, unknown>>, true);
  }

  // Each page is the oldest-refreshed rows; writing them moves them out of the stale set, so the next page is fresh work. A dry run stops after one page.
  async function drain(tier: 'pipeline' | 'rest', page: () => PromiseLike<{ data: unknown[] | null }>, withSignals: boolean, cap: number) {
    for (let done = 0; done < cap && Date.now() < deadline; done += 1000) {
      const { data } = await page();
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      for (let i = 0; i < rows.length && Date.now() < deadline; i += 500) await run(tier, rows.slice(i, i + 500), withSignals);
      if (rows.length < 1000 || dryRun) break;
    }
  }
  // Pipeline: leads with an owner match or a verified number.
  await drain('pipeline', () => db.from('leads').select(COLUMNS).or('skip_trace_status.eq.FOUND,verified_owner.eq.true,verified_number.eq.true').or(notSynthetic).or(staleOr(24 * 60 * MIN)).order('score_refreshed_at', { ascending: true, nullsFirst: true }).limit(1000), true, 3000);
  // Rest: weekly sweep, oldest first.
  await drain('rest', () => db.from('leads').select(COLUMNS).or(notSynthetic).or(staleOr(7 * 24 * 60 * MIN)).order('score_refreshed_at', { ascending: true, nullsFirst: true }).limit(1000), false, 6000);

  return NextResponse.json({ ok: true, dryRun, ...stats });
}
