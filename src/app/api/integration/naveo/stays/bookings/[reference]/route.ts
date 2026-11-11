import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** PATCH: set a booking's status to `cancelled` (frees its dates) or `completed`. A cancelled booking cannot be reopened; book again instead. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { reference } = await params;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== 'cancelled' && status !== 'completed') return NextResponse.json({ error: 'status must be cancelled or completed' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: booking } = await db.from('stays_bookings').select('id,status').eq('organization_id', access.organizationId).eq('reference', reference).maybeSingle();
  if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'already_cancelled' }, { status: 409 });
  if (booking.status === status) return NextResponse.json({ reference, status });

  const { error } = await db.from('stays_bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', booking.id);
  if (error) return NextResponse.json({ error: 'could_not_update_booking' }, { status: 500 });
  if (status === 'cancelled') await db.from('stays_calendar_blocks').delete().eq('booking_id', booking.id);
  return NextResponse.json({ reference, status });
}
