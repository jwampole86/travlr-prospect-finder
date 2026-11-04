import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { backfillSellerSignals } from '@/lib/seller/sellerPipeline';

export const maxDuration = 120;

/** POST { dryRun?: boolean } scans past text replies for seller signals and opens an opportunity for each owner. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => ({})) as { dryRun?: boolean };
  try {
    return NextResponse.json(await backfillSellerSignals(ctx.db, { organizationId: ctx.orgId, dryRun: body.dryRun !== false }));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Backfill failed', 500);
  }
}
