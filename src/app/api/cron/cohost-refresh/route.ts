import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runCohostRefresh } from '@/lib/services/cohostRefresh';

export const maxDuration = 300;

/**
 * GET /api/cron/cohost-refresh  (CRON_SECRET)
 * Refreshes co-host listings for every state except California. Runs every 12 hours (see vercel.json); the AirDNA spend per run is capped
 * by COHOST_REFRESH_CALLS_PER_RUN and a monthly reserve by COHOST_REFRESH_MIN_REMAINING.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runCohostRefresh(getSupabaseAdmin(), { trigger: 'cron' });
  return NextResponse.json({ ok: result.status !== 'error', ...result });
}
