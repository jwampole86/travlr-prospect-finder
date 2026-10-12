import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildOverview, generateInsights, saveSnapshot } from '@/lib/services/campaignInsights';

export const maxDuration = 120;

/** POST /api/campaigns/insights { batch?: string | 'all' }  (admin only). Writes fresh AI takeaways for the selected campaign(s). */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { batch?: string };
  const key = body.batch || 'all';
  const db = getSupabaseAdmin();
  const overview = await buildOverview(db, key === 'all' ? 'all' : [key]);
  const ai = await generateInsights(overview);
  if ('error' in ai) return NextResponse.json({ error: ai.error }, { status: 422 });
  await saveSnapshot(db, key, overview, ai);
  return NextResponse.json({ ok: true, insights: ai.insights, model: ai.model });
}
