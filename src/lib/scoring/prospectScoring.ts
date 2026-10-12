export type RegulationStatusForScore = 'Allowed' | 'Restricted' | 'Prohibited' | 'Banned' | 'Pending' | 'Unknown' | string;

export interface ProspectScoringWeights {
  revenuePotential: number;
  propertyFit: number;
  regulatoryFeasibility: number;
  leadQuality: number;
  engagement: number;
}

export interface ProspectScoringInput {
  estimatedNetMonthly?: number | null;
  estimatedGrossMonthly?: number | null;
  estimatedADR?: number | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  propertyType?: string | null;
  regulationStatus?: RegulationStatusForScore | null;
  verifiedOwner?: boolean | null;
  verifiedNumber?: boolean | null;
  verifiedAddress?: string | boolean | null;
  hasPhone?: boolean | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  doNotContact?: boolean | null;
  daysOnMarket?: number | null;
  createdAt?: string | null;
  emailOpens?: number | null;
  emailClicks?: number | null;
  smsReplies?: number | null;
  callsAnswered?: number | null;
  callbackRequests?: number | null;
  stage?: string | null;
  luxury?: boolean | null;
  /** 'sale' means `price` is a purchase price, never monthly income. */
  priceType?: 'rent' | 'sale' | null;
  /** Market rent estimate (e.g. Zillow rentZestimate) for for-sale listings. */
  estimatedMonthlyRentAi?: number | null;
  /** No listing agent or broker: the contact is most likely the owner. */
  isFsbo?: boolean | null;
  isFurnished?: boolean | null;
  /** Unit inside a multi-unit apartment community, the least STR-convertible type. */
  isApartmentCommunity?: boolean | null;
  /** Resident of record or listing contact; unverified, so worth less than verifiedOwner. */
  contactName?: string | null;
  /** How far the homeowner got in a text campaign; a person who replied or asked for a call is a lead worth calling whatever the property scores. */
  campaignEngagement?: 'replied' | 'hot' | 'warm' | null;
}

/** Bump when the formula changes so stored scores can be recomputed. */
export const SCORE_MODEL_VERSION = 'v3-calibrated';

export interface ProspectScoreFactor {
  key: string;
  label: string;
  score: number;
  weight: number;
  weightedPoints: number;
  explanation: string;
}

export interface ProspectScoreResult {
  score: number;
  band: 'hot' | 'warm' | 'nurture' | 'cold' | 'blocked';
  factors: ProspectScoreFactor[];
  blockers: string[];
}

export const DEFAULT_PROSPECT_SCORING_WEIGHTS: ProspectScoringWeights = {
  revenuePotential: 25,
  propertyFit: 25,
  regulatoryFeasibility: 25,
  leadQuality: 15,
  engagement: 10,
};

const TERMINAL_STAGES = new Set(['Not a Fit', 'Live', 'closed_dead', 'Closed Dead', 'Lost']);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Raw sums top out near 70 on real data, so stretch above 40 to make the dashboard's 75 bar mean top tier (raw 60 -> 75, raw 63 -> 80). */
function calibrate(raw: number): number {
  return raw <= 40 ? raw : clampScore(40 + (raw - 40) * 1.75);
}

function normalizeWeights(weights: ProspectScoringWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return total > 0 ? total : 1;
}

function hasVerifiedAddress(value: string | boolean | null | undefined): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim() !== '' && value !== 'false';
  return false;
}

function positiveNumber(value: number | null | undefined): number {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Monthly income basis: STR estimates first, then listed rent. A sale price never counts. */
export function revenueBasis(input: ProspectScoringInput): number {
  const rentBasis = input.priceType === 'sale'
    ? positiveNumber(input.estimatedMonthlyRentAi)
    : positiveNumber(input.price);
  return positiveNumber(input.estimatedNetMonthly) || positiveNumber(input.estimatedGrossMonthly) || rentBasis;
}

function scoreRevenue(input: ProspectScoringInput): ProspectScoreFactor {
  const revenue = revenueBasis(input);
  let score = 8;
  if (revenue >= 12000) score = 100;
  else if (revenue >= 8000) score = 90;
  else if (revenue >= 5000) score = 78;
  else if (revenue >= 3000) score = 62;
  else if (revenue >= 1500) score = 45;

  if (input.luxury) score = Math.min(100, score + 15);

  return {
    key: 'revenuePotential',
    label: 'Revenue Potential',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: (revenue > 0
      ? `Estimated monthly opportunity is $${Math.round(revenue).toLocaleString()}.`
      : input.priceType === 'sale'
        ? 'For-sale listing with no monthly revenue estimate; the sale price is not income, so this factor stays conservative.'
        : 'No revenue estimate is available, so this factor stays conservative.')
      + (input.luxury ? ' Luxury for its local market (+15).' : ''),
  };
}

function scorePropertyFit(input: ProspectScoringInput): ProspectScoreFactor {
  const beds = positiveNumber(input.beds);
  const baths = positiveNumber(input.baths);
  const type = (input.propertyType || '').toLowerCase();
  let score = 8;

  if (beds >= 3 && beds <= 5) score += 35;
  else if (beds === 2 || beds === 6) score += 22;
  else if (beds >= 7) score += 14;

  if (baths >= 2) score += 25;
  else if (baths >= 1.5) score += 12;

  if (input.isApartmentCommunity) score -= 20;
  else if (/single|sfr|house|townhome|townhouse|villa|estate/.test(type)) score += 20;
  else if (/condo|apartment/.test(type)) score += 5;

  if (input.isFurnished) score += 12;
  if (input.luxury) score += 10;

  const notes = [
    input.isApartmentCommunity ? 'apartment community (-20)' : null,
    input.isFurnished ? 'furnished, STR-ready (+12)' : null,
    input.luxury ? 'luxury tier (+10)' : null,
  ].filter(Boolean).join(', ');

  return {
    key: 'propertyFit',
    label: 'Property Fit',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: `${beds || 'Unknown'} beds / ${baths || 'unknown'} baths; larger private-home profiles score best for luxury STR demand.${notes ? ` ${notes}.` : ''}`,
  };
}

function scoreRegulation(input: ProspectScoringInput): ProspectScoreFactor {
  const status = String(input.regulationStatus || 'Unknown');
  const scoreMap: Record<string, number> = {
    Allowed: 100,
    Restricted: 70,
    Pending: 35,
    Unknown: 25,
    Prohibited: 0,
    Banned: 0,
  };
  const score = scoreMap[status] ?? 40;

  return {
    key: 'regulatoryFeasibility',
    label: 'Regulatory Feasibility',
    score,
    weight: 0,
    weightedPoints: 0,
    explanation: `${status} market status; allowed and manageable restricted markets remain viable, prohibited markets are blocked.`,
  };
}

function scoreLeadQuality(input: ProspectScoringInput): ProspectScoreFactor {
  let score = 0;
  const phoneReady = input.verifiedNumber || input.hasPhone || Boolean(input.contactPhone);
  if (input.verifiedOwner) score += 25;
  else if (input.contactName && input.contactName.trim()) score += 10;
  if (hasVerifiedAddress(input.verifiedAddress)) score += 25;
  if (phoneReady) score += 25;
  if (input.contactEmail) score += 5;
  // An owner-listed rental is the ideal STR prospect: the owner decides and there is no agent to route around.
  if (input.isFsbo) score += input.priceType === 'sale' ? 4 : 12;

  return {
    key: 'leadQuality',
    label: 'Lead Quality',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: 'Owner, address, and phone verification are the strongest send-readiness signals.'
      + (input.isFsbo ? (input.priceType === 'sale' ? ' Owner-listed sale (+4).' : ' Owner-listed rental, direct decision maker (+12).') : '')
      + (!input.verifiedOwner && input.contactName ? ' Unverified contact name (+10).' : ''),
  };
}

function scoreEngagement(input: ProspectScoringInput): ProspectScoreFactor {
  let score = 10;
  const smsReplies = Number(input.smsReplies || 0);
  const callbackRequests = Number(input.callbackRequests || 0);
  const emailClicks = Number(input.emailClicks || 0);
  const callsAnswered = Number(input.callsAnswered || 0);
  const emailOpens = Number(input.emailOpens || 0);
  const stage = input.stage || '';

  score += Math.min(25, smsReplies * 20);
  score += Math.min(20, callbackRequests * 15);
  score += Math.min(15, emailClicks * 8);
  score += Math.min(12, callsAnswered * 6);
  score += Math.min(8, emailOpens * 2);

  if (['Interested', 'Proposal Sent', 'Under Contract', 'interested', 'proposal_sent', 'human_outreach'].includes(stage)) score += 18;
  if (stage === 'New Lead') score += 5;

  const days = input.daysOnMarket;
  if (typeof days === 'number') {
    if (days <= 7) score += 8;
    else if (days <= 21) score += 4;
    else if (days > 90) score -= 12;
    else if (days > 60) score -= 6;
  }

  return {
    key: 'engagement',
    label: 'Engagement & Freshness',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: 'Replies, callbacks, clicks, answered calls, and fresh listings raise urgency; very stale listings are penalized.',
  };
}

export function calculateProspectScore(
  input: ProspectScoringInput,
  weights: ProspectScoringWeights = DEFAULT_PROSPECT_SCORING_WEIGHTS
): ProspectScoreResult {
  const blockers: string[] = [];
  if (input.doNotContact) blockers.push('Do Not Contact flag blocks outreach.');
  if (['Prohibited', 'Banned'].includes(String(input.regulationStatus || ''))) blockers.push('STR operation appears prohibited in this market.');
  if (input.stage && TERMINAL_STAGES.has(input.stage)) blockers.push(`Terminal stage: ${input.stage}.`);

  const totalWeight = normalizeWeights(weights);
  const factors = [
    scoreRevenue(input),
    scorePropertyFit(input),
    scoreRegulation(input),
    scoreLeadQuality(input),
    scoreEngagement(input),
  ].map((factor) => {
    const weight = weights[factor.key as keyof ProspectScoringWeights] || 0;
    return {
      ...factor,
      weight,
      weightedPoints: Math.round((factor.score * weight) / totalWeight),
    };
  });

  let score = calibrate(clampScore(factors.reduce((sum, factor) => sum + factor.weightedPoints, 0)));

  const hasRevenue = Boolean(revenueBasis(input));
  const hasPropertyFacts = Boolean(positiveNumber(input.beds) || positiveNumber(input.baths) || input.propertyType);
  const hasContactSignal = Boolean(input.verifiedOwner || input.verifiedNumber || hasVerifiedAddress(input.verifiedAddress) || input.hasPhone || input.contactPhone || input.contactEmail || input.contactName);
  const hasRegulatorySignal = !['', 'Unknown'].includes(String(input.regulationStatus || 'Unknown'));
  const hasEngagementSignal = Boolean(input.smsReplies || input.callbackRequests || input.emailClicks || input.callsAnswered || input.emailOpens || typeof input.daysOnMarket === 'number');

  if (!hasRevenue && !hasPropertyFacts && !hasContactSignal) score = Math.min(score, 35);
  else if (!hasRevenue && !hasPropertyFacts) score = Math.min(score, 55);
  else if (!hasRevenue) score = Math.min(score, 72);
  if (!hasContactSignal) score = Math.min(score, 78);
  if (!hasRegulatorySignal && !hasEngagementSignal) score = Math.min(score, 82);

  // Engagement outranks the property's own attractiveness: someone who replied or asked for a call should sit at the top of the call list.
  const engagementFloor = input.campaignEngagement === 'replied' || input.campaignEngagement === 'hot' ? 80 : input.campaignEngagement === 'warm' ? 60 : 0;
  if (engagementFloor && blockers.length === 0) score = Math.max(score, engagementFloor);

  if (blockers.length > 0) score = Math.min(score, input.doNotContact ? 10 : 35);

  const band: ProspectScoreResult['band'] = blockers.length > 0
    ? 'blocked'
    : score >= 80
      ? 'hot'
      : score >= 60
        ? 'warm'
        : score >= 40
          ? 'nurture'
          : 'cold';

  return { score, band, factors, blockers };
}

export function getProspectScoreBandLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Nurture';
  return 'Cold';
}

/** Columns a leads row needs for leadRowToScoringInput. Use in every select that feeds the model. */
export const SCORING_LEAD_COLUMNS =
  'estimated_net_monthly,estimated_gross_monthly,estimated_adr,price,price_type,beds,baths,property_type,regulation_status,' +
  'verified_owner,verified_number,verified_address,has_phone,contact_phone,contact_name,stage,days_on_market,luxury,' +
  'is_fsbo,is_furnished,is_apartment_community,estimated_monthly_rent_ai,tags,outreach_responded_at,escalated_at';

/** Maps a leads table row to model input, so no route hand-builds its own field list. */
export function leadRowToScoringInput(row: Record<string, unknown>): ProspectScoringInput {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const flag = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [];
  const negative = tags.some(t => ['sms:status:opted_out', 'sms:status:declined', 'sms:status:wrong_contact', 'sms:status:unreachable'].includes(t));
  const replied = !negative && Boolean(row.outreach_responded_at || row.escalated_at);
  const temp = negative ? null : tags.includes('sms:status:hot') ? 'hot' : tags.includes('sms:status:warm') ? 'warm' : null;
  const campaignEngagement: ProspectScoringInput['campaignEngagement'] = replied ? 'replied' : temp;
  return {
    smsReplies: replied ? 1 : 0, callbackRequests: temp === 'hot' ? 1 : 0, emailClicks: temp ? 1 : 0, campaignEngagement,
    estimatedNetMonthly: Number(row.estimated_net_monthly || 0),
    estimatedGrossMonthly: Number(row.estimated_gross_monthly || 0),
    estimatedADR: Number(row.estimated_adr || 0),
    price: Number(row.price || 0),
    priceType: row.price_type === 'sale' ? 'sale' : row.price_type === 'rent' ? 'rent' : null,
    estimatedMonthlyRentAi: Number(row.estimated_monthly_rent_ai || 0),
    beds: Number(row.beds || 0),
    baths: Number(row.baths || 0),
    propertyType: text(row.property_type),
    regulationStatus: text(row.regulation_status) ?? 'Unknown',
    verifiedOwner: Boolean(row.verified_owner),
    verifiedNumber: Boolean(row.verified_number),
    verifiedAddress: row.verified_address as string | boolean | null,
    hasPhone: Boolean(row.has_phone),
    contactPhone: text(row.contact_phone),
    contactName: text(row.contact_name),
    stage: text(row.stage),
    daysOnMarket: typeof row.days_on_market === 'number' ? row.days_on_market : null,
    luxury: Boolean(row.luxury),
    isFsbo: flag(row.is_fsbo),
    isFurnished: flag(row.is_furnished),
    isApartmentCommunity: flag(row.is_apartment_community),
  };
}
