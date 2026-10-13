import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateProspectScore, leadRowToScoringInput, SCORING_LEAD_COLUMNS, SCORE_MODEL_VERSION, type LeadScoreSignals } from '@/lib/scoring/prospectScoring';
import { loadScoreSignals } from '@/lib/services/leadScoreSignals';

export interface ScoredLead { id: string; before: number; after: number }

const WRITE_BATCH = 500;

/** Scores rows with the shared model. Pure; no database access. */
export function scoreLeadRows(rows: Array<Record<string, unknown>>, signals?: Map<string, LeadScoreSignals>): ScoredLead[] {
  return rows.map(r => ({
    id: String(r.id),
    before: Number(r.prospect_score || 0),
    after: calculateProspectScore(leadRowToScoringInput(r, signals?.get(String(r.id)))).score,
  }));
}

/** Writes scores through the set-based RPC, keeping the previous value in prospect_score_prev. */
export async function writeScores(db: SupabaseClient, scored: ScoredLead[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < scored.length; i += WRITE_BATCH) {
    const batch = scored.slice(i, i + WRITE_BATCH).map(s => ({ id: s.id, score: s.after }));
    const { data, error } = await db.rpc('bulk_update_prospect_scores', { p_updates: batch, p_model: SCORE_MODEL_VERSION });
    if (error) throw new Error(`bulk_update_prospect_scores failed: ${error.message}`);
    written += Number(data || 0);
  }
  return written;
}

/** Re-scores specific leads from their current database rows (used after imports and merges). */
export async function rescoreLeadsByIds(db: SupabaseClient, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  let written = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db.from('leads').select(`id,prospect_score,${SCORING_LEAD_COLUMNS}`).in('id', unique.slice(i, i + 200));
    if (error || !data) continue;
    const rows = data as Array<Record<string, unknown>>;
    const signals = await loadScoreSignals(db, rows.map(r => String(r.id))).catch(() => undefined);
    written += await writeScores(db, scoreLeadRows(rows, signals));
  }
  return written;
}

export const SCORE_SIGNAL_FILTER =
  'luxury.eq.true,is_furnished.eq.true,is_fsbo.eq.true,is_apartment_community.eq.true,estimated_monthly_rent_ai.not.is.null,skip_trace_status.eq.FOUND';
