import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SCORING_LEAD_COLUMNS } from '@/lib/scoring/prospectScoring';
import { scoreLeadRows, writeScores } from '@/lib/services/leadScoringService';

const MAX_IDS = 200;

/**
 * POST /api/leads/rescore  { ids: string[] }
 * Recomputes prospect_score for the given leads from their stored rows with the shared model.
 * Idempotent: the result depends only on the lead's data, never on its previous score.
 */
export async function POST(request: NextRequest) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? [...new Set<string>(body.ids.filter((i: unknown): i is string => typeof i === 'string'))].slice(0, MAX_IDS) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from('leads').select(`id,prospect_score,${SCORING_LEAD_COLUMNS}`).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const scored = scoreLeadRows((data || []) as Array<Record<string, unknown>>);
  try {
    await writeScores(db, scored);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save scores' }, { status: 500 });
  }
  return NextResponse.json({ results: scored });
}
