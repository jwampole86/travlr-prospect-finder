import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { bookingFailure, parseBooking } from '@/lib/stays/bookings';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/**
 * POST: NAVEO Stays writes a guest booking. AVYRO prices it from the listing, checks the listing is live and the dates are free, and creates the booking
 * and its calendar block in one step, so a night can never be sold twice. 409 `dates_taken` means someone else holds those nights. Called with `x-naveo-key`.
 */
export async function POST(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = parseBooking(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const b = parsed.value;
  const db = getSupabaseAdmin();

  const { listing } = await findListing(db, access.organizationId, b.listingId, { liveOnly: true, columns: 'id' });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data, error } = await db.rpc('stays_book', {
    p_org: access.organizationId, p_listing: listing.id, p_ref: b.reference, p_stays_booking_id: b.staysBookingId, p_name: b.guestName, p_email: b.guestEmail,
    p_phone: b.guestPhone, p_guests: b.guests, p_in: b.checkIn, p_out: b.checkOut, p_credit: b.creditApplied, p_requests: b.specialRequests,
  });
  if (error) {
    const f = error.code === '23P01' ? { status: 409, error: 'dates_taken' } : bookingFailure(error.message);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: 'could_not_create_booking' }, { status: 500 });
  return NextResponse.json({
    booking_id: row.out_booking_id, listing_id: listing.id, reference: b.reference, nightly_total: row.out_nightly_total, cleaning_fee: row.out_cleaning_fee,
    total: row.out_total, amount_due: row.out_amount_due, status: 'confirmed',
  }, { status: 201 });
}
