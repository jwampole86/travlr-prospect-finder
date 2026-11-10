/** Address normalisation for property identity. Pure functions: no I/O. */

const SUFFIX: Record<string, string> = {
  street: 'st', str: 'st', avenue: 'ave', av: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct', circle: 'cir',
  place: 'pl', terrace: 'ter', trail: 'trl', parkway: 'pkwy', highway: 'hwy', way: 'way', square: 'sq', alley: 'aly',
};
const DIRECTION: Record<string, string> = { north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
// "#4B", "Apt 4B", "Unit 12", "Suite 200", "Ste 5", "Floor 3", "Fl 3", "Bldg C" at the end of an address.
// "#penthouse 5", "# 4 B": after a "#" the whole rest of the address is the unit, spaces included.
const HASH_UNIT_RE = /\s*#\s*([a-z0-9][a-z0-9 -]{0,19})$/i;
const UNIT_RE = /(?:,|\s)\s*(?:(?:apt|apartment|unit|ste|suite|fl|floor|bldg|building|rm|room|no)\.?\s*#?\s*|#\s*)([a-z0-9][a-z0-9-]*)\s*$/i;

export interface NormalizedAddress {
  streetNumber: string;
  streetName: string;
  unit: string | null;
  city: string;
  state: string;
  zip5: string;
  /** zip + number + street, without the unit: identifies the building or parcel. */
  key: string;
  /** False when there is no usable street number, street name or ZIP, so the address cannot identify a property. */
  usable: boolean;
}

const clean = (s: string) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Some sources write the whole address into the street line ("1438 Hillcrest Rd, Santa Barbara, CA 93103"). The city, state and ZIP are
 * already known separately, so they are taken off the end when they match, and only then. Never leaves less than a number and a street.
 */
function stripLocality(raw: string, city: string, state: string, zip5: string): string {
  const words = raw.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase().replace(/\./g, ''));
  let end = lower.length;
  const MIN = 2;
  if (end > MIN && /^\d{5}(-\d{4})?$/.test(lower[end - 1]) && (!zip5 || lower[end - 1].slice(0, 5) === zip5)) end--;
  if (state && end > MIN && lower[end - 1] === state) end--;
  const cityWords = city.split(' ').filter(Boolean);
  if (cityWords.length && end - cityWords.length >= MIN && cityWords.every((w, i) => lower[end - cityWords.length + i] === w)) end -= cityWords.length;
  return end === words.length ? raw : words.slice(0, end).join(' ');
}

export function normalizeAddress(input: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }): NormalizedAddress {
  const zip5 = (String(input.zip ?? '').match(/\d{5}/) ?? [''])[0];
  const city = clean(String(input.city ?? ''));
  const state = clean(String(input.state ?? '')).slice(0, 2);
  let raw = stripLocality(String(input.address ?? '').trim(), city, state, zip5);
  let unit: string | null = null;
  const m = HASH_UNIT_RE.exec(raw) ?? UNIT_RE.exec(raw);
  if (m) {
    unit = m[1].toLowerCase().trim().replace(/\s+/g, ' ');
    raw = raw.slice(0, m.index).trim();
  }
  const words = clean(raw).split(' ').filter(Boolean);
  const streetNumber = /^\d+[a-z]?$/.test(words[0] ?? '') ? words.shift()! : '';
  const streetName = words.map((w, i) => (i === words.length - 1 ? SUFFIX[w] ?? w : DIRECTION[w] ?? w)).join(' ');
  const usable = !!streetNumber && !!streetName && !!zip5;
  return { streetNumber, streetName, unit, city, state, zip5, key: usable ? `${zip5}|${streetNumber}|${streetName}` : '', usable };
}

/** Levenshtein distance, capped: only "is it within one or two edits" matters here. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) >= cap) return cap;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin >= cap) return cap;
  }
  return Math.min(prev[b.length], cap);
}

/** Great-circle distance in metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
