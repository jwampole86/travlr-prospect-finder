// Shared copy for the homeowner report (web, PDF and email). Plain data only: safe to import from client and server.
// Equipment costs are broad retail ranges for typical consumer-grade products; they are labelled "typical" wherever shown.

export type EquipmentKey = 'smoke' | 'co' | 'extinguisher' | 'lock' | 'doorbell' | 'noise' | 'alarm' | 'firstaid';

export interface EquipmentItem {
  key: EquipmentKey;
  label: string;
  /** Typical purchase cost of the equipment itself. */
  cost: string;
  why: string;
  /** Platform or safety caveat worth stating plainly. */
  note?: string;
  /** Matches city-researched safety requirement names so we can flag "required by your city". */
  cityMatch?: RegExp;
  /** Life-safety items are essentially universal requirements for rentals. */
  lifeSafety?: boolean;
}

export const EQUIPMENT: EquipmentItem[] = [
  {
    key: 'smoke', label: 'Smoke detectors', cost: '$20 to $60 each', lifeSafety: true, cityMatch: /smoke/i,
    why: 'Required almost everywhere, typically on every level and in every sleeping area. Interconnected 10-year units are the easiest to maintain.',
  },
  {
    key: 'co', label: 'Carbon monoxide detectors', cost: '$25 to $70 each', lifeSafety: true, cityMatch: /carbon|\bCO\b/i,
    why: 'Required in most markets for homes with a gas appliance, fireplace or attached garage, and expected by booking platforms and insurers for guest safety.',
  },
  {
    key: 'extinguisher', label: 'Fire extinguisher', cost: '$25 to $60', lifeSafety: true, cityMatch: /extinguisher/i,
    why: 'A multipurpose (ABC) extinguisher in the kitchen or near an exit, checked on a schedule, is expected by many cities and insurers.',
  },
  {
    key: 'lock', label: 'Smart lock (keyless entry)', cost: '$150 to $300 per door',
    why: 'Self check-in with a unique code for each guest. No key handoffs, no lockbox, and codes can be removed the moment a stay ends.',
  },
  {
    key: 'doorbell', label: 'Video doorbell or exterior camera', cost: '$100 to $250',
    why: 'Lets us see who is at the door and deters misuse of the property.',
    note: 'Exterior only, and it must be disclosed in the listing. Airbnb prohibits cameras inside the home.',
  },
  {
    key: 'noise', label: 'Noise monitor', cost: '$60 to $200, some with a small monthly fee',
    why: 'Alerts us when sound levels spike, so we can step in early and keep neighbors happy.',
    note: 'Choose a decibel-only sensor that does not record audio.',
  },
  {
    key: 'alarm', label: 'Security alarm or monitored system', cost: '$200 to $600 plus about $20 to $50 a month if monitored',
    why: 'Optional, and valued by many owners and insurers. Door and window sensors are what matter most between stays.',
    note: 'Keep any indoor motion sensors off while guests are staying, and disclose the system in the listing.',
  },
  {
    key: 'firstaid', label: 'First aid kit', cost: '$15 to $50',
    why: 'A stocked kit for minor cuts, burns and bumps, kept somewhere easy to find. Guests notice it, and it is a simple safeguard that many insurers and platforms recommend.',
    note: 'Check it between stays and restock anything used or expired.',
  },
];

export const EQUIPMENT_KEYS: EquipmentKey[] = EQUIPMENT.map(e => e.key);

/** Reads the `eq` URL parameter. Returns null when the homeowner did not say, so the report shows the full checklist untailored. */
export function parseEquipment(raw: string | null | undefined): EquipmentKey[] | null {
  if (raw === null || raw === undefined) return null;
  const valid = new Set<string>(EQUIPMENT_KEYS);
  return raw.split(',').map(s => s.trim()).filter((s): s is EquipmentKey => valid.has(s));
}

// What permits usually cost when the city's own figures are not on file. Always labelled "typical".
export const TYPICAL_PERMIT_COSTS: Array<{ label: string; range: string }> = [
  { label: 'Short-term rental permit or registration', range: 'Often $0 to $500 one time' },
  { label: 'Renewal', range: 'Often $0 to $300 a year' },
  { label: 'Local business license', range: 'Often $25 to $150 a year' },
  { label: 'Safety inspection (where required)', range: 'Often $0 to $250' },
  { label: 'Lodging tax registration', range: 'Usually free to register. The tax itself is typically 6% to 15% of the nightly rate and is often collected by the booking platform.' },
];

export const TYPICAL_PERMIT_STEPS: string[] = [
  'Confirm zoning and any HOA or deed restrictions for your parcel.',
  'Register for the local business license, if the city or county requires one.',
  'Complete the short-term rental permit or registration application, usually online.',
  'Pass any required safety or fire inspection (smoke and CO alarms, extinguisher, exits).',
  'Register for lodging (occupancy) tax and, where it applies, state sales tax.',
  'Add the permit number to every listing, then keep the permit renewed.',
];

export const TYPICAL_PROCESSING = 'Typically a few days to several weeks, depending on the city.';

export const PERMIT_HELP: string[] = [
  'We tell you exactly which permits and licenses apply to your address.',
  'Your specialist walks you through each application and inspection, step by step.',
  'We register your listing, add the permit number and keep renewals on your calendar.',
];

export const SETUP_HELP =
  'Your specialist helps you choose and set up these items, and can recommend products that work well with short-term rentals. You are never required to buy anything through us.';

// Mirrors the real homeowner portal (/homeowner).
export const OWNER_DASHBOARD: Array<{ title: string; body: string }> = [
  { title: 'Monthly statements & payouts', body: 'Every booking, fee and payout itemized, with year-to-date totals and revenue charts.' },
  { title: 'Bookings calendar', body: 'See upcoming and past stays, and block dates when you want to use the home yourself.' },
  { title: 'Setup checklist', body: 'Track your home from assessment through permits, photography, operations setup and listing launch.' },
  { title: 'Updates & notifications', body: 'Know when a booking lands, a payout goes out or something needs your attention.' },
  { title: 'Documents', body: 'Permits, agreements and statements stored together and always one click away.' },
  { title: 'Requests & messages', body: 'Ask for a maintenance visit, a special request or a call with your manager in one place.' },
];

/** Trim model-written text that was cut off mid-sentence. */
export function tidySentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/[.!?)"'\u201d]$/.test(t)) return t;
  const cut = Math.max(t.lastIndexOf('. '), t.lastIndexOf('; '));
  const out = cut > 40 ? t.slice(0, cut + 1) : t.replace(/[\s,;:\u2014-]+\S*$/, '') + '\u2026';
  return out.replace(/[;:,]$/, '.');
}

export type EquipmentStatus = 'have' | 'need' | 'optional' | null;
export interface EquipmentView { item: EquipmentItem; status: EquipmentStatus; cityRequired: boolean }

/** Decides, per item, whether the home has it, needs it, or it is simply recommended. `equipment` null = homeowner did not say. */
export function buildEquipmentView(
  equipment: EquipmentKey[] | null,
  citySafety: Array<{ item: string; detail: string }> = [],
): { items: EquipmentView[]; otherCity: Array<{ item: string; detail: string }>; mustHaveCount: number } {
  const have = new Set(equipment ?? []);
  // The research sometimes lists an item only to say the city does NOT require it. Those must not be shown as requirements.
  const NEGATED = /\b(does not|do not|not explicitly|not (?:list|publish|specif|require)|no (?:[a-z-]+ ){0,3}(?:requirement|specific|standard|number)s?)\b/i;
  const required = citySafety.filter(s => !NEGATED.test(s.detail));
  const items = EQUIPMENT.map(item => {
    const cityRequired = !!item.cityMatch && required.some(s => item.cityMatch!.test(s.item));
    const status: EquipmentStatus = equipment === null ? null : have.has(item.key) ? 'have' : (item.lifeSafety || cityRequired) ? 'need' : 'optional';
    return { item, status, cityRequired };
  });
  const otherCity = required.filter(s => !EQUIPMENT.some(e => e.cityMatch?.test(s.item)));
  return { items, otherCity, mustHaveCount: items.filter(i => i.status === 'need').length };
}
