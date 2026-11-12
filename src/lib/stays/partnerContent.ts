import { CHANNEL_FEE } from './channelFee';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Plain-language terms for co-listing managers, generated from the same numbers the fee calculation uses. */
export const PARTNER_TERMS = [
  'Listing fee: $0. Guest service fee: $0 (guests see the all-in price). Monthly platform fee: $0.',
  `Channel fee: ${pct(0)} for the first ${CHANNEL_FEE.freeDays} days after the homes go live, then ${pct(CHANNEL_FEE.standardRate)} (${pct(CHANNEL_FEE.volumeRate)} from ${CHANNEL_FEE.volumeMinHomes} live homes) of the booking total.`,
  'Only bookings made through NAVEO Stays checkout are charged. Airbnb, Vrbo and direct bookings are never counted.',
  'Month-to-month, no exclusivity, remove listings anytime. Calendars sync with an iCal link from any channel manager.',
] as const;

export const PARTNER_EXAMPLE = { total: 1200, nights: 3 } as const;

export const PARTNER_TRACKING_STEPS = [
  'The home has its own listing on staynaveo.com with live availability.',
  'A guest books at NAVEO Stays checkout. AVYRO creates the reservation, and that is the only kind of booking the fee counts.',
  'The manager shares an iCal link; AVYRO blocks those dates so the home is not shown as free when it is booked elsewhere.',
  'Each month the report shows every NAVEO booking with its date, total and whether the 0% intro period or the ongoing fee applied.',
] as const;

export const PARTNER_ONE_LINER = 'Airbnb brings volume but adds a guest fee. NAVEO is an extra channel with no guest fee and a low (or zero at first) cost only on bookings we generate — you keep Airbnb exactly as it is.';

/** Airbnb's fees change; confirm the figures below against Airbnb's current fee pages before sending this outside the company. */
export const AIRBNB_COMPARISON: ReadonlyArray<readonly [area: string, airbnb: string, naveo: string]> = [
  ['Guest service fee', 'Typically 14–16% added at checkout', '$0 — all-in price shown up front'],
  ['Pricing transparency', 'Base rate shown; fees appear later', 'Full price (nightly + cleaning) visible before booking'],
  ['For professional managers', 'One of many channels; a high guest fee can hurt conversion', 'Extra channel only — keep Airbnb running'],
  ['Fee to the host or manager', 'Host fee varies; guest fee is separate', `${pct(0)} for ${CHANNEL_FEE.freeDays} days, then ${pct(CHANNEL_FEE.standardRate)} only on NAVEO bookings`],
  ['Exclusivity', 'None', 'None — keep all your other channels'],
  ['Calendar sync', 'Native and channel managers', 'iCal (works with any channel manager)'],
  ['Inventory style', 'Massive, variable quality', 'Curated, quality-checked homes'],
  ['Best for', 'Maximum reach', 'Incremental direct demand with clearer pricing'],
];
