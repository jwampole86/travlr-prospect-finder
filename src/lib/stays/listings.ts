/** What NAVEO Stays may show for a listing. Private details, owner contact data and internal quality notes are never part of this shape. */
export type StaysListingRow = Record<string, unknown> & { id: string };

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function publicListing(row: StaysListingRow) {
  const a = (row.attributes && typeof row.attributes === 'object' ? row.attributes : {}) as Record<string, unknown>;
  return {
    id: row.id,
    title: row.title, city: row.city, state: row.state, country: row.country, neighborhood: row.neighborhood,
    latitude: num(row.latitude), longitude: num(row.longitude),
    property_type: row.property_type,
    bedrooms: num(row.bedrooms), bathrooms: num(row.bathrooms), max_guests: num(row.max_guests),
    description: row.description, amenities: arr(row.amenities), images: arr(row.images),
    price_per_night: num(row.price_per_night), cleaning_fee: num(row.cleaning_fee), min_nights: num(row.min_nights) ?? 1,
    status: row.status,
    sale: publicSale(row),
    ...a,
  };
}

export type Block = { start_date: string; end_date: string; reason: string };

/** Guests only need to know a date is taken, so owner, showing and maintenance holds are not told apart. */
export function publicBlocks(blocks: Block[]) {
  return blocks.map((b) => ({ start: b.start_date, end: b.end_date, kind: b.reason === 'booking' ? 'booking' : 'blocked' }));
}

const DAY = 86_400_000;
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Parses the availability window: defaults to today through a year, and never longer than 400 days. */
export function availabilityWindow(from: string | null, to: string | null, today = new Date()): { from: string; to: string } | { error: string } {
  const start = isDate(from) ? from : today.toISOString().slice(0, 10);
  const end = isDate(to) ? to : new Date(Date.parse(start) + 365 * DAY).toISOString().slice(0, 10);
  if ((from && !isDate(from)) || (to && !isDate(to))) return { error: 'from and to must be YYYY-MM-DD' };
  const span = (Date.parse(end) - Date.parse(start)) / DAY;
  if (span <= 0 || span > 400) return { error: 'the window must be between 1 and 400 days' };
  return { from: start, to: end };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A listing id is an AVYRO id, or the id the home had on the old NAVEO Stays site so existing links keep working. */
export const listingIdFilter = (id: string): { column: 'id' | 'stays_property_id'; value: string } =>
  UUID.test(id) ? { column: 'id', value: id } : { column: 'stays_property_id', value: id };

/** Whether the home is also for sale. Showing times are calendar holds, so only the sale itself and the handover date are shared. */
export function publicSale(row: Record<string, unknown>) {
  const s = (row.sale_status && typeof row.sale_status === 'object' ? row.sale_status : {}) as Record<string, unknown>;
  if (s.for_sale !== true) return { for_sale: false };
  const handover = typeof s.handover_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.handover_date) ? s.handover_date : null;
  return { for_sale: true, handover_date: handover };
}
