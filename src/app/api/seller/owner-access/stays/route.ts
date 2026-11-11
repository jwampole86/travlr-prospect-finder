import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';

export const dynamic = 'force-dynamic';

/** GET: the NAVEO Stays homes with who may manage each one. Admin only. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  let q = ctx.db.from('stays_listings').select('id,title,city,state,status,quality_approved,owner_email,authorized_emails').order('title').limit(500);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data, error } = await q;
  if (error) return fail('Could not load the homes.', 500);
  return NextResponse.json({ items: data ?? [] });
}
