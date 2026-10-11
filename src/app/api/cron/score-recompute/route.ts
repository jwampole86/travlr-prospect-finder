import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SCORING_LEAD_COLUMNS, SCORE_MODEL_VERSION } from '@/lib/scoring/prospectScoring';
import { SCORE_SIGNAL_FILTER, scoreLeadRows, writeScores } from '@/lib/services/leadScoringService';

export const maxDuration = 300;
const PAGE = 1000;
const NON_PRIORITY_STAGES = new Set(['Not a Fit', 'Live']);

interface Snapshot { n: number; sum: number; highPriority: number; hot: number; warm: number; nurture: number; cold: number }
const blank = (): Snapshot => ({ n: 0, sum: 0, highPriority: 0, hot: 0, warm: 0, nurture: 0, cold: 0 });
function tally(s: Snapshot, score: number, stage: string) {
  if (score > 0) { s.n++; s.sum += score; }
  if (score >= 75 && !NON_PRIORITY_STAGES.has(stage)) s.highPriority++;
  if (score >= 80) s.hot++; else if (score >= 60) s.warm++; else if (score >= 40) s.nurture++; else s.cold++;
}
const report = (s: Snapshot) => ({ avgScore: s.n ? Math.round(s.sum / s.n) : 0, highPriority: s.highPriority, hot: s.hot, warm: s.warm, nurture: s.nurture, cold: s.cold });

/**
 * GET /api/cron/score-recompute
 * Recomputes stored prospect_score with the shared model (src/lib/scoring/prospectScoring.ts).
 *
 *   scope=signals (default)  only leads carrying a listing signal: luxury, furnished, owner-listed,
 *                            apartment community, a rent estimate, or a found skip-trace contact
 *   scope=all                every non-synthetic lead (changes dashboard KPIs; run dryRun first)
 *   dryRun=true              report before/after KPIs and the biggest movers without writing
 *   excludeGenerated=true    skip leads with sync-* ids (old generator output, see migration 20260901060000)
 *
 * Previous values are kept in leads.prospect_score_prev. Leads already on the current model version
 * are skipped when writing, so an interrupted run can simply be repeated.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') === 'all' ? 'all' : 'signals';
  const dryRun = params.get('dryRun') === 'true';
  const excludeGenerated = params.get('excludeGenerated') === 'true';
  const db = getSupabaseAdmin();

  const before = blank(), after = blank();
  // Leads with sync-* ids come from the old generator (see migration 20260901060000); reported apart so the effect on real leads is visible.
  const realBefore = blank(), realAfter = blank();
  const generatedBefore = blank(), generatedAfter = blank();
  let evaluated = 0, changed = 0, written = 0;
  const movers: Array<{ id: string; address: unknown; state: unknown; before: number; after: number }> = [];

  for (let from = 0; ; from += PAGE) {
    let query = db.from('leads')
      .select(`id,address,state,is_synthetic,score_model_version,prospect_score,${SCORING_LEAD_COLUMNS}`)
      .order('id').range(from, from + PAGE - 1);
    if (scope === 'signals') query = query.or(SCORE_SIGNAL_FILTER);
    if (excludeGenerated) query = query.not('id', 'like', 'sync-%');

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message, evaluated }, { status: 500 });
    if (!data || data.length === 0) break;

    const rows = (data as Array<Record<string, unknown>>).filter(r => !r.is_synthetic);
    const scored = scoreLeadRows(rows);
    scored.forEach((s, i) => {
      const stage = String(rows[i].stage || '');
      tally(before, s.before, stage);
      tally(after, s.after, stage);
      const generated = s.id.startsWith('sync-');
      tally(generated ? generatedBefore : realBefore, s.before, stage);
      tally(generated ? generatedAfter : realAfter, s.after, stage);
      if (s.before !== s.after) {
        changed++;
        movers.push({ id: s.id, address: rows[i].address, state: rows[i].state, before: s.before, after: s.after });
        if (movers.length > 400) movers.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)).length = 200;
      }
    });
    evaluated += rows.length;

    if (!dryRun) {
      const pending = scored.filter((s, i) => s.before !== s.after || rows[i].score_model_version !== SCORE_MODEL_VERSION);
      written += await writeScores(db, pending);
    }
    if (data.length < PAGE) break;
  }

  movers.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  return NextResponse.json({
    ok: true, scope, dryRun, model: SCORE_MODEL_VERSION, evaluated, changed, written,
    before: report(before), after: report(after),
    realLeadsOnly: { before: report(realBefore), after: report(realAfter) },
    syncGeneratedLeads: { before: report(generatedBefore), after: report(generatedAfter) },
    biggestMovers: movers.slice(0, 12),
  });
}
