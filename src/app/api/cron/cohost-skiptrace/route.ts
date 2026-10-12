import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runCohostSkipTrace } from '@/lib/services/cohostSkipTraceQueue';

export const maxDuration = 300;

/** GET /api/cron/cohost-skiptrace  Traces the next co-host owners in the queue, ELITE first. Query: max (default 6, up to 30). */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const max = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get('max')) || 6));
  return NextResponse.json({ ok: true, ...(await runCohostSkipTrace(getSupabaseAdmin(), { max, deadlineMs: 240_000 })) });
}
