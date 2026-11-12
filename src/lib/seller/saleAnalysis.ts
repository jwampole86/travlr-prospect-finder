import { assessDual, DEFAULT_SELLING_COST_PCT } from './dualOpportunity';
import { ALREADY_LISTED_LABEL } from './alreadyListed';

/**
 * The sale side of a lead: how likely the owner is to sell, what they would net, and whether to pitch a sale referral, short-term rental
 * management, or both. Figures come from the listing and its price history; nothing here is a valuation or a promise of a sale price.
 */
export interface SaleFacts {
  priceType: 'sale' | 'rent' | 'unknown';
  price: number | null;
  daysOnMarket: number | null;
  /** Null when the price history has not been read yet. */
  priceCuts: number | null;
  lastSoldPrice: number | null;
  lastSoldDate: string | null;
  ownerListed: boolean | null;
  regulation: string | null;
  estimatedNetMonthly: number | null;
  repliedYes: boolean;
  declined: boolean;
}

export interface SaleAnalysis {
  listingType: 'sale' | 'rent' | 'unknown';
  /** 0-100 for a for-sale lead; null when the home is listed for rent. */
  motivationScore: number | null;
  motivationLabel: 'High' | 'Medium' | 'Low' | 'Not a sale listing';
  motivationReasons: string[];
  proceeds: { low: number; high: number; costPct: number } | null;
  history: { lastSoldPrice: number; lastSoldDate: string; change: number; changePct: number } | null;
  priceCuts: number | null;
  path: { key: string; label: string; reasons: string[]; cautions: string[] };
  summary: string;
  talkingPoints: string[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const round100 = (n: number) => Math.round(n / 100) * 100;
const monthsSince = (iso: string) => (Date.now() - Date.parse(iso)) / (30.44 * 86_400_000);

export function analyzeSale(f: SaleFacts): SaleAnalysis {
  const forSale = f.priceType === 'sale';
  const reasons: string[] = [];
  let score = 40;

  if (forSale) {
    const dom = f.daysOnMarket ?? 0;
    if (dom >= 120) { score += 20; reasons.push(`On the market ${dom} days: past the point most homes sell`); }
    else if (dom >= 60) { score += 12; reasons.push(`On the market ${dom} days`); }
    else if (dom > 0) { reasons.push(`Listed ${dom} days: still early`); }
    if (f.priceCuts != null) {
      if (f.priceCuts > 0) { score += Math.min(24, f.priceCuts * 8); reasons.push(`${f.priceCuts} price cut${f.priceCuts === 1 ? '' : 's'} so far: the owner is adjusting to sell`); }
      else reasons.push('No price cuts yet');
    } else reasons.push('Price history not checked yet');
    if (f.ownerListed === true) { score += 8; reasons.push('Listed by the owner with no agent: easy to reach, and open to a referral to a licensed broker'); }
    else if (f.ownerListed === false) reasons.push('Agent-listed: an existing listing agreement may limit a referral');
  } else if (f.priceType === 'rent') {
    reasons.push('Listed for rent, so the owner is holding the home as an income property today');
  }
  if (f.repliedYes) { score += 15; reasons.push('Replied YES to our text'); }
  score = Math.max(0, Math.min(100, score));

  const cost = DEFAULT_SELLING_COST_PCT;
  const proceeds = forSale && f.price && f.price >= 50_000
    ? { low: round100(f.price * 0.95 * (1 - cost / 100)), high: round100(f.price * (1 - cost / 100)), costPct: cost }
    : null;

  let history: SaleAnalysis['history'] = null;
  if (forSale && f.price && f.lastSoldPrice && f.lastSoldDate) {
    const change = f.price - f.lastSoldPrice;
    history = { lastSoldPrice: f.lastSoldPrice, lastSoldDate: f.lastSoldDate, change, changePct: Math.round((change / f.lastSoldPrice) * 100) };
    if (monthsSince(f.lastSoldDate) < 12) reasons.push(`Sold ${Math.round(monthsSince(f.lastSoldDate))} months ago and listed again: a fast resale`);
  }

  // Reuses the owner-facing rules, so what an agent sees here matches what NAVEO recommends.
  const dual = assessDual({
    timeline: null, occupancy: null, goals: [], regulationStatus: f.regulation, estimatedNetMonthly: f.estimatedNetMonthly,
    priceExpectationLow: proceeds ? Math.round(f.price! * 0.95) : null, priceExpectationHigh: proceeds ? f.price : null,
    listingStatus: forSale ? 'listed' : null, estDaysToSale: null, estSellingCostPct: null,
  });
  const agentListed = forSale && f.ownerListed === false;
  const path = agentListed
    ? {
        key: 'buyer_side_only', label: ALREADY_LISTED_LABEL,
        reasons: ['The sale side stays with the listing broker. Do not ask to list it or replace their broker.', f.estimatedNetMonthly ? `Short-term rental management is the way in: it could net about ${money(f.estimatedNetMonthly)} a month.` : 'Short-term rental management is the way in, if the rules allow it.'],
        cautions: ['A buyer introduction applies only when AVYRO has an identified, interested buyer, and goes to a licensed buyer\u2019s agent in this state.'],
      }
    : forSale
    ? { key: dual.recommendation, label: dual.label, reasons: dual.reasons, cautions: dual.cautions.filter((c) => !/^Uses a default/.test(c)) }
    : {
        key: 'long_term_rental', label: 'Rent or short-term rental',
        reasons: [f.estimatedNetMonthly ? `Short-term rental could net about ${money(f.estimatedNetMonthly)} a month against the current rent` : 'Compare short-term rental income with the current rent'],
        cautions: ['If a tenant is in place, a short-term rental is not available until the lease ends.'],
      };

  const label: SaleAnalysis['motivationLabel'] = !forSale ? 'Not a sale listing' : score >= 70 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  const summary = f.declined
    ? 'The owner declined or opted out, so no sale or rental conversation should start.'
    : forSale
      ? agentListed
        ? `Already listed with an agent, so the sale stays with the listing broker (${label.toLowerCase()} sale motivation, ${score}/100). Pitch rental management only; a buyer introduction applies only if we have an interested buyer.`
        : `${label} sale motivation (${score}/100).${proceeds ? ` At the asking price the owner would net about ${money(proceeds.low)} to ${money(proceeds.high)} after ${cost}% selling costs.` : ''} Best path: ${path.label}.`
      : 'Listed for rent, so the main conversation is rental management. Treat a sale as a longer-term angle and ask whether they have thought about selling.';
  const talkingPoints = agentListed
    ? ['Do not ask to list the home or to replace their broker.', 'Offer short-term rental management as an income option while it is listed.', 'Mention a buyer introduction only if we have a real, interested buyer.']
    : forSale
    ? [
        ...(f.priceCuts ? ['Ask whether they would rather be paid for the home or earn from it while it waits for the right buyer.'] : []),
        ...(f.ownerListed ? ['Offer an introduction to a licensed local broker; there is no cost unless the home closes.'] : []),
        ...(history && history.changePct > 0 ? [`They bought at ${money(history.lastSoldPrice)}: the asking price is ${history.changePct}% above that, so check how firm the price is.`] : []),
        ...(proceeds ? [`Selling costs of ${cost}% leave about ${money(proceeds.low)} to ${money(proceeds.high)}: a figure to confirm with their broker, not a promise.`] : []),
      ].slice(0, 3)
    : ['Ask how the rental is going and whether they would consider short-term rental management.', 'Ask if they have thought about selling in the next year or two.'];

  return { listingType: f.priceType, motivationScore: forSale ? score : null, motivationLabel: label, motivationReasons: reasons, proceeds, history, priceCuts: f.priceCuts, path, summary, talkingPoints };
}
