import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { availabilityWindow, publicBlocks } from '@/lib/stays/listings';

export const dynamic = 'force-dynamic';

/** GET: the dates a live listing cannot be booked, between `from` and `to` (YYYY-MM-DD; default today to a year). Check-out day is free, so a block's `end` is the first free day. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const window = availabilityWindow(req.nextUrl.searchParams.get('from'), req.nextUrl.searchParams.get('to'));
  if ('error' in window) return NextResponse.json({ error: window.error }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: listing, error } = await db.from('stays_listings').select('id,min_nights').eq('id', id)
    .eq('organization_id', access.organizationId).eq('status', 'active').eq('quality_approved', true).maybeSingle();
  if (error) return NextResponse.json({ error: 'could_not_load_availability' }, { status: 500 });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: blocks, error: blockError } = await db.from('stays_calendar_blocks').select('start_date,end_date,reason')
    .eq('listing_id', id).lt('start_date', window.to).gt('end_date', window.from).order('start_date');
  if (blockError) return NextResponse.json({ error: 'could_not_load_availability' }, { status: 500 });
  return NextResponse.json({ listingId: id, from: window.from, to: window.to, min_nights: listing.min_nights, blocks: publicBlocks(blocks ?? []) }, { headers: { 'cache-control': 'no-store' } });
}
