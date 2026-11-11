import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parseBlock } from '@/lib/stays/bookings';
import { findOwnedListing, ownerEmailFrom } from '@/lib/stays/owner';

export const dynamic = 'force-dynamic';

/** GET: the signed-in owner's own listing: holds they may manage (with ids so one can be removed) and the guest bookings on it, without guest contact details. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const db = getSupabaseAdmin();
  const listing = await findOwnedListing(db, access.organizationId, (await params).id, ownerEmail, 'id');
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [{ data: blocks }, { data: bookings }] = await Promise.all([
    db.from('stays_calendar_blocks').select('id,start_date,end_date,reason,note').eq('listing_id', listing.id).neq('reason', 'booking').order('start_date'),
    db.from('stays_bookings').select('reference,guest_name,guests,check_in,check_out,nights,total,status').eq('listing_id', listing.id).in('status', ['confirmed', 'completed']).order('check_in', { ascending: false }).limit(200),
  ]);
  return NextResponse.json({ listingId: listing.id, blocks: blocks ?? [], bookings: (bookings ?? []).map((b) => ({ ...b, guest_name: String(b.guest_name ?? '').split(' ')[0] })) }, { headers: { 'cache-control': 'no-store' } });
}

/** POST: hold dates on the owner's own listing (owner use, maintenance or other). Refused with 409 if any of those nights is already booked or held by a guest booking. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const parsed = parseBlock(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = getSupabaseAdmin();
  const listing = await findOwnedListing(db, access.organizationId, (await params).id, ownerEmail, 'id');
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { count } = await db.from('stays_calendar_blocks').select('id', { count: 'exact', head: true })
    .eq('listing_id', listing.id).eq('reason', 'booking').lt('start_date', parsed.value.end).gt('end_date', parsed.value.start);
  if (count) return NextResponse.json({ error: 'dates_booked' }, { status: 409 });

  const { data, error } = await db.from('stays_calendar_blocks').insert({
    listing_id: listing.id, start_date: parsed.value.start, end_date: parsed.value.end, reason: parsed.value.reason, source: 'naveo_stays', note: parsed.value.note,
  }).select('id').single();
  if (error || !data) return NextResponse.json({ error: 'could_not_create_block' }, { status: 500 });
  return NextResponse.json({ id: data.id, listingId: listing.id }, { status: 201 });
}
