import { assessDual } from './dualOpportunity';

/** What an owner is told about where their submission stands. Internal stages, scores and partner terms are never part of this. */
const REFERRAL_MILESTONE: Record<string, { key: string; label: string }> = {
  sent: { key: 'introduced', label: 'Introduced to a licensed partner' },
  received: { key: 'received', label: 'Your partner has your details' },
  contacted: { key: 'contacted', label: 'Your partner has contacted you' },
  listed: { key: 'listed', label: 'Listed for sale' },
  under_contract: { key: 'under_contract', label: 'Under contract' },
  closed: { key: 'closed', label: 'Closed' },
  dead: { key: 'ended', label: 'This introduction has ended' },
};

export function ownerMilestone(referralStatus: string | null, opportunityStatus: string | null): { key: string; label: string } {
  if (referralStatus && REFERRAL_MILESTONE[referralStatus]) return REFERRAL_MILESTONE[referralStatus];
  if (opportunityStatus === 'paused' || opportunityStatus === 'lost') return { key: 'paused', label: 'On hold' };
  return { key: 'in_review', label: 'Received and being reviewed' };
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** The same dual-path recommendation the owner saw when they submitted, from the lead and its open opportunity. */
export function ownerRecommendation(opp: Record<string, unknown> | null, lead: Record<string, unknown>) {
  if (!opp) return null;
  const d = assessDual({
    timeline: (opp.timeline as string | null) ?? null, occupancy: (opp.occupancy as string | null) ?? null, goals: Array.isArray(opp.goals) ? (opp.goals as string[]) : [],
    regulationStatus: (lead.regulation_status as string | null) ?? null, estimatedNetMonthly: num(lead.estimated_net_monthly),
    priceExpectationLow: num(opp.price_expectation_low), priceExpectationHigh: num(opp.price_expectation_high),
    listingStatus: typeof opp.listing_status === 'string' ? opp.listing_status : null, estDaysToSale: num(opp.est_days_to_sale), estSellingCostPct: num(opp.est_selling_cost_pct),
  });
  return { recommendation: d.recommendation, label: d.label, reasons: d.reasons.slice(0, 8), cautions: d.cautions.slice(0, 8), earnWhileYouSell: d.recommendation === 'sell_and_earn' || d.recommendation === 'rent_while_preparing' };
}
