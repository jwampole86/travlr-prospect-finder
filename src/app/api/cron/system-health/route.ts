import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runAndRecord } from '@/lib/services/systemHealth';

export const maxDuration = 60;

/** GET /api/cron/system-health  (CRON_SECRET, every 5 minutes)  Runs every service check and stores the result for the status page. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { at, results } = await runAndRecord(getSupabaseAdmin());
  return NextResponse.json({ ok: true, at, statuses: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status])) });
}
