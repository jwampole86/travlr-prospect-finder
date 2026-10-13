import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { taskPlanFor } from '@/lib/services/aiTaskPlan';

export const maxDuration = 60;

/** POST /api/leads/ai-tasks {leadId, refresh?}  Suggested next tasks for the lead, from its whole profile. */
export async function POST(req: NextRequest) {
  const { leadId, refresh } = (await req.json().catch(() => ({}))) as { leadId?: string; refresh?: boolean };
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const plan = await taskPlanFor(getSupabaseAdmin(), leadId, refresh === true);
    return NextResponse.json({ plan });
  } catch (err) {
    console.error('[ai-tasks]', err);
    return NextResponse.json({ plan: null, error: 'Could not build a plan right now' }, { status: 502 });
  }
}
