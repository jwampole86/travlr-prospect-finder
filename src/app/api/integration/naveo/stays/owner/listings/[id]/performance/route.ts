import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { performance } from '@/lib/stays/performance';
import { findOwnedListing, ownerEmailFrom } from '@/lib/stays/owner';

export const dynamic = 'force-dynamic';

/** GET: revenue, nights booked and occupancy for the signed-in owner's own listing between `from` and `to` (YYYY-MM-DD; default the last 90 days), computed from AVYRO's own bookings. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const to = p.get('to') ?? today;
  const from = p.get('from') ?? new Date(Date.parse(to) - 90 * 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 800 * 86_400_000) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD, up to 800 days apart' }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const listing = await findOwnedListing(db, access.organizationId, (await params).id, ownerEmail, 'id');
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data } = await db.from('stays_bookings').select('check_in,check_out,total,status').eq('listing_id', listing.id)
    .in('status', ['confirmed', 'completed']).lt('check_in', to).gt('check_out', from);
  return NextResponse.json({ listingId: listing.id, from, to, ...performance(data ?? [], from, to) }, { headers: { 'cache-control': 'no-store' } });
}
