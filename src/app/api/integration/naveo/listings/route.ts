import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publishableGallery } from '@/lib/media/propertyMedia';

export const dynamic = 'force-dynamic';

/**
 * GET: the properties NAVEO Homes may show as listings. Read-only. Only leads a person has marked listed (naveo_listed_at) in the key's own
 * organization are returned, with property facts and cleared photos only: never owner contact details, notes or scores.
 * Called with the shared key in `x-naveo-key`. Optional `limit` (1-100, default 50) and `offset`.
 */
export async function GET(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number.parseInt(p.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, Number.parseInt(p.get('offset') ?? '0', 10) || 0);

  const db = getSupabaseAdmin();
  const { data, error } = await db.from('leads')
    .select('id,address,city,state,zip,beds,baths,price,property_type,listing_url,naveo_listed_at')
    .eq('organization_id', access.organizationId).not('naveo_listed_at', 'is', null)
    .order('naveo_listed_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: 'could_not_load_listings' }, { status: 500 });

  const listings = await Promise.all((data ?? []).map(async (l) => ({
    leadId: l.id as string, address: l.address, city: l.city, state: l.state, zip: l.zip, beds: l.beds, baths: l.baths,
    price: l.price, propertyType: l.property_type, listedAt: l.naveo_listed_at,
    photos: await publishableGallery(db, l.id as string, access.organizationId).catch(() => []),
  })));
  return NextResponse.json({ listings, limit, offset }, { headers: { 'cache-control': 'no-store' } });
}
