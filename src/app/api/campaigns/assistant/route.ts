import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { askAssistant } from '@/lib/services/campaignAssistant';

export const maxDuration = 120;

/** POST /api/campaigns/assistant { goal }  (admin only). Returns campaign options for the goal. Sends nothing. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const goal = String(body?.goal ?? '').trim().slice(0, 1200);
  if (goal.length < 8) return NextResponse.json({ error: 'Describe what you want to achieve in a sentence or two.' }, { status: 400 });
  try {
    const out = await askAssistant(getSupabaseAdmin(), goal);
    return 'error' in out ? NextResponse.json(out, { status: 422 }) : NextResponse.json(out);
  } catch (e) {
    console.error('campaign assistant failed', e);
    return NextResponse.json({ error: 'The helper could not finish. Try again in a moment.' }, { status: 500 });
  }
}
