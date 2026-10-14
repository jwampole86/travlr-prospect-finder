import { NextRequest, NextResponse } from 'next/server';
import { reconcileOpenSessions } from '@/lib/services/signingSync';

export const maxDuration = 60;

/** GET /api/cron/docusign-reconcile  (CRON_SECRET, every 30 minutes)  Catches envelopes whose callback never arrived. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await reconcileOpenSessions()) });
}
