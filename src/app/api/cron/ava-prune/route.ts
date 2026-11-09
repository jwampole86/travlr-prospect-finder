import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 60;

/** Monthly: removes AVA's shared usage signals and unanswered-topic counts older than 13 months (the retention promised in her privacy screen). */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason ?? 'Unauthorized' }, { status: 401 });
  const run = await startCronRun('ava-prune');
  const { error } = await getSupabaseAdmin().rpc('ava_prune_learning');
  await finishCronRun(run, { status: error ? 'failed' : 'success', errorCount: error ? 1 : 0, errors: [error?.message] });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
