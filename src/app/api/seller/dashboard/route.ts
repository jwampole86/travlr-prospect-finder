import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { sellerDashboard } from '@/lib/seller/sellerPipeline';

export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  try {
    return NextResponse.json(await sellerDashboard(ctx.db, ctx.orgId));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not load the dashboard', 500);
  }
}
