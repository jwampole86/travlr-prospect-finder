import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { recordRechecked, runAndRecord } from '@/lib/services/systemHealth';
import { repairDegraded } from '@/lib/services/systemHealthRepair';

export const maxDuration = 300;

/** GET /api/cron/system-health  Runs every service check and stores the result for the status page. */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.reason || 'Unauthorized' }, { status: 401 });
  }

  const run = await startCronRun('system-health');

  try {
    const db = getSupabaseAdmin();
    const { at, results } = await runAndRecord(db);
    // Fix what can be fixed (re-run the stalled job, confirm it recovered) and store the follow-up check.
    const { actions, rechecked } = await repairDegraded(db, results, { origin: req.nextUrl.origin });
    await recordRechecked(db, rechecked);
    const statuses = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.status]));
    const degraded = Object.values(results).filter((result) => result.status === 'degraded').length;
    const outage = Object.values(results).filter((result) => result.status === 'outage').length;

    await finishCronRun(run, {
      status: 'success',
      metadata: {
        checkedAt: at,
        serviceCount: Object.keys(results).length,
        degradedServices: degraded,
        outageServices: outage,
        statuses,
        repairs: actions,
      },
    });

    return NextResponse.json({ ok: true, at, statuses, repairs: actions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'System health run failed';
    await finishCronRun(run, {
      status: 'failed',
      errorCount: 1,
      errors: [message],
      metadata: { failed: true },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
