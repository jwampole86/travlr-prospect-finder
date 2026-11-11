import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ownerEmailFrom } from '@/lib/stays/owner';
import { ownerListing } from '@/lib/stays/listings';

export const dynamic = 'force-dynamic';

/** GET: every listing that belongs to the signed-in owner (their email, passed in `x-owner-email`), whatever its status. Nobody else's homes are ever returned. */
export async function GET(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const { data, error } = await getSupabaseAdmin().from('stays_listings').select('*')
    .eq('organization_id', access.organizationId).eq('owner_email', ownerEmail).order('created_at').limit(200);
  if (error) return NextResponse.json({ error: 'could_not_load_listings' }, { status: 500 });
  return NextResponse.json({ listings: (data ?? []).map(ownerListing) }, { headers: { 'cache-control': 'no-store' } });
}
