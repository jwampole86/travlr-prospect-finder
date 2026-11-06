import type { ServiceLine } from './types';

export const RECOMMENDATIONS = ['sell_only', 'sell_and_earn', 'rent_while_preparing', 'investor_exit'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  sell_only: 'Sell only',
  sell_and_earn: 'Sell + Earn',
  rent_while_preparing: 'Rent while preparing to list',
  investor_exit: 'Investor exit',
};

/** The service a person would usually route the owner to for each path. This only suggests; it never sets the route. */
export const RECOMMENDATION_ROUTE: Record<Recommendation, ServiceLine> = {
  sell_only: 'sale_partner',
  sell_and_earn: 'interim_rental',
  rent_while_preparing: 'interim_rental',
  investor_exit: 'sale_partner',
};

export const DEFAULT_SELLING_COST_PCT = 7;
export const DEFAULT_DAYS_TO_SALE = 90;

export const DUAL_DISCLAIMER =
  'This is an estimate to help a person plan the conversation. It is not an offer to buy, sell or rent, not a promise of income or of a sale price, and a management agreement does not guarantee bookings.';

export type DualInput = {
  timeline: string | null;
  occupancy: string | null;
  goals: string[];
  regulationStatus: string | null;
  estimatedNetMonthly: number | null;
  priceExpectationLow: number | null;
  priceExpectationHigh: number | null;
  listingStatus: string | null;
  estDaysToSale: number | null;
  estSellingCostPct: number | null;
};

export type DualAssessment = {
  recommendation: Recommendation;
  label: string;
  reasons: string[];
  cautions: string[];
  suggestedRoute: ServiceLine;
  sale: { daysToSale: number; sellingCostPct: number; netLow: number | null; netHigh: number | null };
  stay: { regulation: 'allowed' | 'restricted' | 'unknown'; monthsAvailable: number; interimNet: number | null };
  disclaimer: string;
};

/** Reads "6 months", "asap", "in 2 weeks"... into months. Returns null when the text gives no usable time. */
export function timelineMonths(timeline: string | null): number | null {
  const t = (timeline || '').toLowerCase().trim();
  if (!t) return null;
  if (/\b(asap|immediately|right away|as soon as)\b/.test(t)) return 0;
  const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, 'a few': 3, few: 3 };
  const m = t.match(/(\d{1,2}|a few|few|a|one|two|three|four|five|six)\s+(day|week|month|year)s?/);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : words[m[1]] ?? 1;
  return m[2] === 'day' ? n / 30 : m[2] === 'week' ? n / 4.3 : m[2] === 'year' ? n * 12 : n;
}

const round = (n: number) => Math.round(n / 100) * 100;

/**
 * Compares a straight sale with a sale that also earns from the home while it waits to sell. The rules are deliberately
 * conservative: anything that could make a rental unlawful or unworkable (a tenant, unconfirmed or restricted short-term rental
 * rules, a near-immediate sale) points to "Sell only" and says why, so a person can correct it.
 */
export function assessDual(input: DualInput): DualAssessment {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const daysToSale = input.estDaysToSale ?? DEFAULT_DAYS_TO_SALE;
  const sellingCostPct = input.estSellingCostPct ?? DEFAULT_SELLING_COST_PCT;
  const assumed: string[] = [];
  if (input.estDaysToSale == null) assumed.push(`${DEFAULT_DAYS_TO_SALE} days to sell`);
  if (input.estSellingCostPct == null) assumed.push(`${DEFAULT_SELLING_COST_PCT}% selling costs`);
  if (assumed.length) cautions.push(`Uses a default of ${assumed.join(' and ')} until a person enters real figures.`);

  const lo = input.priceExpectationLow;
  const hi = input.priceExpectationHigh;
  const keep = 1 - sellingCostPct / 100;
  const netLow = lo != null ? round((lo ?? 0) * keep) : hi != null ? round(hi * keep) : null;
  const netHigh = hi != null ? round(hi * keep) : lo != null ? round(lo * keep) : null;
  if (netLow == null) cautions.push('No price expectation recorded, so seller net proceeds cannot be estimated.');
  else cautions.push('Net proceeds use the owner\'s price expectation, not a valuation or comparable sales.');

  const status = (input.regulationStatus || '').toLowerCase();
  const regulation: DualAssessment['stay']['regulation'] = status === 'allowed' ? 'allowed' : status === 'prohibited' || status === 'restricted' ? 'restricted' : 'unknown';
  const months = timelineMonths(input.timeline);
  const monthsAvailable = Math.max(0, Math.round((months ?? daysToSale / 30) * 10) / 10);
  const net = input.estimatedNetMonthly;
  const interimNet = net != null && net > 0 ? round(net * Math.min(monthsAvailable, daysToSale / 30)) : null;

  const base = { sale: { daysToSale, sellingCostPct, netLow, netHigh }, stay: { regulation, monthsAvailable, interimNet }, disclaimer: DUAL_DISCLAIMER };
  const result = (recommendation: Recommendation): DualAssessment => ({
    recommendation, label: RECOMMENDATION_LABEL[recommendation], reasons, cautions, suggestedRoute: RECOMMENDATION_ROUTE[recommendation], ...base,
  });

  if (input.occupancy === 'short_term_rental' || input.goals.includes('investor_exit')) {
    reasons.push(input.occupancy === 'short_term_rental' ? 'The home already operates as a short-term rental, which can appeal to buyers who want income.' : 'The owner is open to buyers who want an income-producing property.');
    cautions.push('Booking history and performance must be disclosed accurately; existing guest bookings must be honored or handled under their terms.');
    return result('investor_exit');
  }

  if (input.occupancy === 'tenant_occupied') {
    reasons.push('A tenant lives there, so a short-term rental is not available.');
    return result('sell_only');
  }
  if (months !== null && months < 1) {
    reasons.push('The owner needs to sell right away, which leaves no practical time to set up and book stays.');
    return result('sell_only');
  }
  if (regulation === 'restricted') {
    reasons.push('Short-term rentals are restricted or prohibited at this address.');
    return result('sell_only');
  }
  if (regulation === 'unknown') {
    reasons.push('Short-term rental rules are not confirmed for this address, so a rental cannot be recommended yet.');
    cautions.push('Confirm the local permit and zoning rules; if they allow it, run this assessment again.');
    return result('sell_only');
  }
  if (interimNet === null) {
    reasons.push('Short-term rentals are allowed here, but there is no net income estimate to compare.');
    cautions.push('Add or refresh the income estimate to see whether Sell + Earn is worthwhile.');
    return result('sell_only');
  }
  if (input.listingStatus === 'listed' || input.listingStatus === 'under_contract') {
    reasons.push('The home is already listed or under contract, so showings and the contract schedule come first.');
    cautions.push('Guest stays must not conflict with showings, inspections or closing dates.');
    return result('sell_only');
  }

  reasons.push('Short-term rentals are allowed here.', `Estimated interim net about $${interimNet.toLocaleString()} over the selling window.`);
  cautions.push('Check the owner\'s financing, insurance and occupancy terms before any rental.', 'Bookings must be scheduled around showings, inspections and closing.');
  if (months !== null && months >= 6 && input.listingStatus !== 'listed') {
    reasons.push('The owner has a longer timeline and can host stays before active showings begin.');
    return result('rent_while_preparing');
  }
  return result('sell_and_earn');
}
