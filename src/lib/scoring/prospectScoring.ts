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
}

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

function normalizeWeights(weights: ProspectScoringWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return total > 0 ? total : 1;
}

function hasVerifiedAddress(value: string | boolean | null | undefined): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim() !== '' && value !== 'false';
  return false;
}

function scoreRevenue(input: ProspectScoringInput): ProspectScoreFactor {
  const revenue = input.estimatedNetMonthly || input.estimatedGrossMonthly || input.price || 0;
  let score = 35;
  if (revenue >= 12000) score = 100;
  else if (revenue >= 8000) score = 90;
  else if (revenue >= 5000) score = 78;
  else if (revenue >= 3000) score = 62;
  else if (revenue >= 1500) score = 45;

  if (input.luxury) score = Math.min(100, score + 8);

  return {
    key: 'revenuePotential',
    label: 'Revenue Potential',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: revenue > 0
      ? `Estimated monthly opportunity is $${Math.round(revenue).toLocaleString()}.`
      : 'No revenue estimate is available, so this factor stays conservative.',
  };
}

function scorePropertyFit(input: ProspectScoringInput): ProspectScoreFactor {
  const beds = Number(input.beds || 0);
  const baths = Number(input.baths || 0);
  const type = (input.propertyType || '').toLowerCase();
  let score = 45;

  if (beds >= 3 && beds <= 5) score += 25;
  else if (beds === 2 || beds === 6) score += 15;
  else if (beds >= 7) score += 8;

  if (baths >= 2) score += 15;
  else if (baths >= 1.5) score += 8;

  if (/single|sfr|house|townhome|townhouse|villa|estate/.test(type)) score += 10;
  else if (/condo|apartment/.test(type)) score += 2;

  return {
    key: 'propertyFit',
    label: 'Property Fit',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: `${beds || 'Unknown'} beds / ${baths || 'unknown'} baths; larger private-home profiles score best for luxury STR demand.`,
  };
}

function scoreRegulation(input: ProspectScoringInput): ProspectScoreFactor {
  const status = String(input.regulationStatus || 'Unknown');
  const scoreMap: Record<string, number> = {
    Allowed: 100,
    Restricted: 70,
    Pending: 45,
    Unknown: 40,
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
  let score = 20;
  const phoneReady = input.verifiedNumber || input.hasPhone || Boolean(input.contactPhone);
  if (input.verifiedOwner) score += 25;
  if (hasVerifiedAddress(input.verifiedAddress)) score += 25;
  if (phoneReady) score += 25;
  if (input.contactEmail) score += 5;

  return {
    key: 'leadQuality',
    label: 'Lead Quality',
    score: clampScore(score),
    weight: 0,
    weightedPoints: 0,
    explanation: 'Owner, address, and phone verification are the strongest send-readiness signals.',
  };
}

function scoreEngagement(input: ProspectScoringInput): ProspectScoreFactor {
  let score = 35;
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

  if (['Interested', 'Proposal Sent', 'Under Contract', 'interested', 'proposal_sent'].includes(stage)) score += 18;
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

  let score = clampScore(factors.reduce((sum, factor) => sum + factor.weightedPoints, 0));
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
