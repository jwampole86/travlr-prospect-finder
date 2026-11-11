/** Reads and bounds a NAVEO Stays booking, so nothing unchecked reaches the database. Price is not accepted from the caller: AVYRO prices from the listing. */
export type StaysBookingInput = {
  listingId: string;
  reference: string;
  staysBookingId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guests: number;
  checkIn: string;
  checkOut: string;
  creditApplied: number;
  specialRequests: string | null;
};

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function parseBooking(body: unknown): { ok: true; value: StaysBookingInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const listingId = text(b.listing_id, 64);
  const reference = text(b.reference, 20);
  const email = text(b.guest_email, 200)?.toLowerCase() ?? null;
  const name = text(b.guest_name, 120);
  const guests = Number(b.guests);
  if (!listingId || !/^[A-Za-z0-9_-]{1,64}$/.test(listingId)) return { ok: false, error: 'listing_id is required' };
  if (!reference || !/^NV-[A-Z0-9]{6}$/.test(reference)) return { ok: false, error: 'a valid reference is required' };
  if (!name) return { ok: false, error: 'guest_name is required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'a valid guest_email is required' };
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) return { ok: false, error: 'guests must be a whole number from 1 to 50' };
  if (!isDate(b.check_in) || !isDate(b.check_out)) return { ok: false, error: 'check_in and check_out must be YYYY-MM-DD' };
  const nights = (Date.parse(b.check_out) - Date.parse(b.check_in)) / 86_400_000;
  if (nights < 1 || nights > 30) return { ok: false, error: 'a stay must be 1 to 30 nights' };
  const credit = Number(b.credit_applied ?? 0);
  return {
    ok: true,
    value: {
      listingId, reference, staysBookingId: text(b.stays_booking_id, 64), guestName: name, guestEmail: email, guestPhone: text(b.guest_phone, 40), guests,
      checkIn: b.check_in, checkOut: b.check_out, creditApplied: Number.isFinite(credit) && credit > 0 ? Math.round(credit * 100) / 100 : 0,
      specialRequests: text(b.special_requests, 1000),
    },
  };
}

const BOOKING_ERRORS: Record<string, { status: number; error: string }> = {
  dates_taken: { status: 409, error: 'dates_taken' },
  listing_unavailable: { status: 404, error: 'not_found' },
  too_many_guests: { status: 422, error: 'too_many_guests' },
  min_nights: { status: 422, error: 'min_nights' },
  after_handover: { status: 422, error: 'after_handover' },
};

/** Maps the booking function's raised reason to an API response; anything unrecognized is a plain server error. */
export function bookingFailure(message: string | undefined): { status: number; error: string } {
  const key = Object.keys(BOOKING_ERRORS).find((k) => message?.includes(k));
  return key ? BOOKING_ERRORS[key] : { status: 500, error: 'could_not_create_booking' };
}

export type Block = { reason: string };
/** Calendar holds a caller may place: bookings come only through a booking, and showings are set by AVYRO staff. */
export const CALLER_BLOCK_REASONS = ['owner', 'maintenance', 'other'] as const;

export function parseBlock(body: unknown): { ok: true; value: { start: string; end: string; reason: (typeof CALLER_BLOCK_REASONS)[number]; note: string | null } } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isDate(b.start_date) || !isDate(b.end_date)) return { ok: false, error: 'start_date and end_date must be YYYY-MM-DD' };
  const days = (Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000;
  if (days < 1 || days > 366) return { ok: false, error: 'a block must be 1 to 366 days' };
  const reason = (CALLER_BLOCK_REASONS as readonly string[]).includes(String(b.reason)) ? (b.reason as (typeof CALLER_BLOCK_REASONS)[number]) : 'owner';
  return { ok: true, value: { start: b.start_date, end: b.end_date, reason, note: text(b.note, 200) } };
}

export function parseReview(body: unknown): { ok: true; value: { reference: string | null; rating: number; comment: string | null; issue: string | null } } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'rating must be a whole number from 1 to 5' };
  const reference = text(b.reference, 20);
  if (reference && !/^NV-[A-Z0-9]{6}$/.test(reference)) return { ok: false, error: 'reference is not valid' };
  return { ok: true, value: { reference, rating, comment: text(b.comment, 2000), issue: text(b.issue, 1000) } };
}
