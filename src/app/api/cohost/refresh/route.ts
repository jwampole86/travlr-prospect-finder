import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runCohostRefresh } from '@/lib/services/cohostRefresh';

export const maxDuration = 300;

/** POST /api/cohost/refresh  (admin). Refreshes the markets that are furthest behind now, with a small call cap, instead of waiting for the schedule. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await runCohostRefresh(getSupabaseAdmin(), { trigger: 'manual', maxCalls: 10, deadlineMs: 200_000 });
  return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 });
}
