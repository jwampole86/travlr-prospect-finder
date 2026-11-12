/**
 * NAVEO Stays channel fee for co-listing managers. The fee applies only to bookings made through NAVEO Stays checkout (every row in stays_bookings),
 * never to Airbnb, Vrbo or direct bookings. Guests pay no service fee, so the base is the booking total.
 */
export const CHANNEL_FEE = { freeDays: 60, standardRate: 0.1, volumeRate: 0.08, volumeMinHomes: 10 } as const;

const DAY = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10)));

/** The ongoing rate: lower for a partner with 10 or more live homes. */
export const channelRate = (partnerHomes: number) => (partnerHomes >= CHANNEL_FEE.volumeMinHomes ? CHANNEL_FEE.volumeRate : CHANNEL_FEE.standardRate);

export type ChannelFee = { rate: number; fee: number; net: number; intro: boolean };

/**
 * `bookedOn` is the day the guest booked on NAVEO. Bookings in the first 60 days after the partner's homes went live are free; the same applies
 * while no live date is recorded yet, so a partner is never charged before the start of the window is set.
 */
export function channelFee(input: { bookedOn: string; liveDate: string | null; total: number; partnerHomes: number }): ChannelFee {
  const total = Number.isFinite(input.total) && input.total > 0 ? input.total : 0;
  const liveMs = isDate(input.liveDate) ? Date.parse(input.liveDate.slice(0, 10)) : null;
  const bookedMs = isDate(input.bookedOn) ? Date.parse(input.bookedOn.slice(0, 10)) : null;
  const intro = liveMs === null || bookedMs === null || bookedMs < liveMs + CHANNEL_FEE.freeDays * DAY;
  const rate = intro ? 0 : channelRate(input.partnerHomes);
  const fee = round2(total * rate);
  return { rate, fee, net: round2(total - fee), intro };
}

export type FeeBooking = { reference: string; partner: string; title: string; check_in: string; check_out: string; total: number; bookedOn: string; liveDate: string | null };
export type FeeLine = FeeBooking & ChannelFee;
export type PartnerSummary = { partner: string; homes: number; bookings: number; total: number; fee: number; introBookings: number };

/** Per-booking fees and a per-partner monthly summary ("X NAVEO bookings = $Y channel fee"). `homesByPartner` is each partner's live home count. */
export function summarizeChannelFees(bookings: FeeBooking[], homesByPartner: Record<string, number>): { lines: FeeLine[]; partners: PartnerSummary[] } {
  const lines = bookings.map((b) => ({ ...b, ...channelFee({ bookedOn: b.bookedOn, liveDate: b.liveDate, total: b.total, partnerHomes: homesByPartner[b.partner] ?? 0 }) }));
  const byPartner = new Map<string, PartnerSummary>();
  for (const l of lines) {
    const s = byPartner.get(l.partner) ?? { partner: l.partner, homes: homesByPartner[l.partner] ?? 0, bookings: 0, total: 0, fee: 0, introBookings: 0 };
    s.bookings += 1; s.total = round2(s.total + l.total); s.fee = round2(s.fee + l.fee); if (l.intro) s.introBookings += 1;
    byPartner.set(l.partner, s);
  }
  return { lines, partners: [...byPartner.values()].sort((a, b) => a.partner.localeCompare(b.partner)) };
}
