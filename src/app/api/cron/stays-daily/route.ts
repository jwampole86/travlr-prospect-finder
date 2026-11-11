import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';

export const maxDuration = 120;

/**
 * Daily: runs NAVEO Stays' end-of-stay job (marks finished stays completed, sends the thank-you email with the review link, and handles Rewards).
 * Base44 cannot schedule that job itself, so AVYRO's scheduler calls it. The job is safe to run twice: every step skips what it already did.
 * Set NAVEO_STAYS_URL to the Stays site's https address; it defaults to the published Base44 address.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason ?? 'Unauthorized' }, { status: 401 });
  const run = await startCronRun('stays-daily');
  try {
    const base = process.env.NAVEO_STAYS_URL || 'https://naveo-stays-prime.base44.app';
    const url = new URL('/api/functions/processStays', base);
    if (url.protocol !== 'https:') throw new Error('NAVEO_STAYS_URL must be https');
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(100_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`processStays returned ${res.status}`);
    await finishCronRun(run, { status: 'success', metadata: data });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [(e as Error).message] });
    return NextResponse.json({ error: 'stays_job_failed' }, { status: 502 });
  }
}
