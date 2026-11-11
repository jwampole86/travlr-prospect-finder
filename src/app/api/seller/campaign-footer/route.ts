import { NextRequest, NextResponse } from 'next/server';
import { sellerContext } from '@/lib/seller/api';

export const dynamic = 'force-dynamic';

/** GET: the company mailing address the Campaign tab puts at the bottom of every email (COMPANY_POSTAL_ADDRESS). Admin only; null when it is not set. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  return NextResponse.json({ address: process.env.COMPANY_POSTAL_ADDRESS?.trim() || null }, { headers: { 'cache-control': 'no-store' } });
}
