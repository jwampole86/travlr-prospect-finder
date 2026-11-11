import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parseReview } from '@/lib/stays/bookings';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/** POST: a guest review for a listing, optionally tied to a booking reference (one review per booking). It updates the listing's rating and review count. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = parseReview(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = getSupabaseAdmin();
  const { listing } = await findListing(db, access.organizationId, (await params).id, { liveOnly: false, columns: 'id' });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let bookingId: string | null = null;
  if (parsed.value.reference) {
    const { data: booking } = await db.from('stays_bookings').select('id').eq('organization_id', access.organizationId).eq('listing_id', listing.id).eq('reference', parsed.value.reference).maybeSingle();
    if (!booking) return NextResponse.json({ error: 'booking_not_found' }, { status: 404 });
    bookingId = booking.id as string;
  }
  const { data, error } = await db.from('stays_reviews').insert({ listing_id: listing.id, booking_id: bookingId, rating: parsed.value.rating, comment: parsed.value.comment, issue: parsed.value.issue }).select('id').single();
  if (error?.code === '23505') return NextResponse.json({ error: 'already_reviewed' }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: 'could_not_save_review' }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
