import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/** DELETE: remove an owner, maintenance or other hold. Guest bookings and AVYRO showing holds cannot be removed here. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; blockId: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, blockId } = await params;
  const db = getSupabaseAdmin();
  const { listing } = await findListing(db, access.organizationId, id, { liveOnly: false, columns: 'id' });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data } = await db.from('stays_calendar_blocks').delete().eq('id', blockId).eq('listing_id', listing.id).in('reason', ['owner', 'maintenance', 'other']).select('id');
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
