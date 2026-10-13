import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SCORING_LEAD_COLUMNS, calculateProspectScore, leadRowToScoringInput } from '@/lib/scoring/prospectScoring';
import { loadScoreSignals } from '@/lib/services/leadScoreSignals';
import { writeScores } from '@/lib/services/leadScoringService';

const FRESH_MS = 10 * 60_000;

/** POST /api/leads/score-refresh {leadId}  The lead's prospect score from everything on file right now, with its factors. Scores under ten minutes old are returned as stored. */
export async function POST(req: NextRequest) {
  const { leadId } = (await req.json().catch(() => ({}))) as { leadId?: string };
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: row } = await db.from('leads').select(`id,prospect_score,score_refreshed_at,score_model_version,${SCORING_LEAD_COLUMNS}`).eq('id', leadId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const r = row as unknown as Record<string, unknown>;
  const signals = await loadScoreSignals(db, [leadId]).catch(() => undefined);
  const result = calculateProspectScore(leadRowToScoringInput(r, signals?.get(leadId)));
  let refreshedAt = typeof r.score_refreshed_at === 'string' ? r.score_refreshed_at : null;
  const fresh = refreshedAt && Date.now() - Date.parse(refreshedAt) < FRESH_MS && Number(r.prospect_score) === result.score;
  if (!fresh) {
    await writeScores(db, [{ id: leadId, before: Number(r.prospect_score || 0), after: result.score }]).catch(() => 0);
    refreshedAt = new Date().toISOString();
  }
  return NextResponse.json({ score: result.score, band: result.band, refreshedAt, blockers: result.blockers, factors: result.factors.map(f => ({ label: f.label, score: f.score, weight: f.weight, explanation: f.explanation })) });
}
