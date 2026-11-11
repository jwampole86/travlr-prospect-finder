import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publicListing } from '@/lib/stays/listings';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/** GET: one live listing (active, quality-approved and eligible) in the key's organization. Anything else is a 404, so a draft or paused home is never confirmed to exist. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { listing, error } = await findListing(getSupabaseAdmin(), access.organizationId, id, { liveOnly: true });
  if (error) return NextResponse.json({ error: 'could_not_load_listing' }, { status: 500 });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ listing: publicListing(listing as never) }, { headers: { 'cache-control': 'no-store' } });
}
