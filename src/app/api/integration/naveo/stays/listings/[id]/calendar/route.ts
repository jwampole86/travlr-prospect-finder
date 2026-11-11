import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parseBlock } from '@/lib/stays/bookings';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/** GET: the holds on a listing that an owner may manage (not bookings), with ids so one can be removed. Works for any listing in the key's organization. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getSupabaseAdmin();
  const { listing } = await findListing(db, access.organizationId, (await params).id, { liveOnly: false, columns: 'id' });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data } = await db.from('stays_calendar_blocks').select('id,start_date,end_date,reason,note').eq('listing_id', listing.id).neq('reason', 'booking').order('start_date');
  return NextResponse.json({ listingId: listing.id, blocks: data ?? [] }, { headers: { 'cache-control': 'no-store' } });
}

/** POST: hold dates (owner use, maintenance or other). Refused with 409 if any of those nights is already booked or held by a guest booking. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = parseBlock(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = getSupabaseAdmin();
  const { listing } = await findListing(db, access.organizationId, (await params).id, { liveOnly: false, columns: 'id' });
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
