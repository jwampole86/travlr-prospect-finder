import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { summarizeChannelFees, type FeeBooking } from '@/lib/stays/channelFee';

export const dynamic = 'force-dynamic';

type Row = { reference: string; total: number | string; created_at: string; check_in: string; check_out: string; listing: { title: string; channel_partner: string; channel_live_date: string | null } | null };

/** GET ?month=YYYY-MM (default this month): the NAVEO bookings made that month on co-listing partners' homes, the channel fee on each, and the homes to assign to a partner. Admin only. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('month must be YYYY-MM');
  const start = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10);

  let homesQ = ctx.db.from('stays_listings').select('id,title,city,state,status,channel_partner,channel_live_date').order('title').limit(500);
  let bookingsQ = ctx.db.from('stays_bookings')
    .select('reference,total,created_at,check_in,check_out,listing:stays_listings!inner(title,channel_partner,channel_live_date)')
    .in('status', ['confirmed', 'completed']).not('listing.channel_partner', 'is', null)
    .gte('created_at', start).lt('created_at', next).order('created_at').limit(2000);
  if (ctx.orgId) { homesQ = homesQ.eq('organization_id', ctx.orgId); bookingsQ = bookingsQ.eq('organization_id', ctx.orgId); }
  const [homes, bookings] = await Promise.all([homesQ, bookingsQ]);
  if (homes.error || bookings.error) return fail('Could not load the channel fees.', 500);

  const homesByPartner: Record<string, number> = {};
  for (const h of homes.data ?? []) if (h.channel_partner && h.status === 'active') homesByPartner[h.channel_partner] = (homesByPartner[h.channel_partner] ?? 0) + 1;
  const rows: FeeBooking[] = ((bookings.data ?? []) as unknown as Row[]).filter((r) => r.listing?.channel_partner).map((r) => ({
    reference: r.reference, partner: r.listing!.channel_partner, title: r.listing!.title, check_in: r.check_in, check_out: r.check_out,
    total: Number(r.total), bookedOn: r.created_at.slice(0, 10), liveDate: r.listing!.channel_live_date,
  }));
  return NextResponse.json({ month, homes: homes.data ?? [], homesByPartner, ...summarizeChannelFees(rows, homesByPartner) });
}
