import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runCohostSkipTrace } from '@/lib/services/cohostSkipTraceQueue';
import { runHomesageCandidateLookups, runHomesageLookups } from '@/lib/services/homesageSkipTrace';

export const maxDuration = 300;

/**
 * GET /api/cron/cohost-skiptrace  Traces the next co-host owners in the queue, ELITE first, then looks up ELITE and business or trust owners on Homesage.
 * Query: max (default 6, up to 30) for the main skip-trace, homesage (default 2, up to 10) for Homesage lookups.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  const max = Math.min(30, Math.max(1, Number(q.get('max')) || 6));
  const hsMax = Math.min(10, Math.max(0, q.get('homesage') == null ? 2 : Number(q.get('homesage')) || 0));
  const db = getSupabaseAdmin();
  const skipTrace = await runCohostSkipTrace(db, { max, deadlineMs: 200_000 });
  const homesage = hsMax > 0 ? await runHomesageLookups(db, { max: hsMax }) : null;
  const candidates = hsMax > 0 ? await runHomesageCandidateLookups(db, { max: hsMax }) : null;
  return NextResponse.json({ ok: true, ...skipTrace, homesage, candidates });
}
