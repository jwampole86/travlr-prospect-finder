export type CanonicalStatus =
  | 'ALLOWED'
  | 'ALLOWED_WITH_REQUIREMENTS'
  | 'PERMIT_REQUIRED'
  | 'RESTRICTED'
  | 'PRIMARY_RESIDENCE_REQUIRED'
  | 'PROHIBITED'
  | 'UNKNOWN'
  | 'REVIEW_REQUIRED';

export interface RegulationRecord {
  id: string;
  jurisdictionName: string;
  city: string | null;
  county: string | null;
  state: string;
  jurisdictionType: string;
  status: CanonicalStatus;
  strAllowed: boolean | null;
  permitRequired: boolean | null;
  licenseRequired: boolean | null;
  registrationRequired: boolean | null;
  primaryResidenceRequired: boolean | null;
  ownerOccupancyRequired: boolean | null;
  nightCap: number | null;
  minimumStay: number | null;
  occupancyLimit: number | null;
  taxRequirements: string | null;
  additionalRestrictions: string | null;
  summary: string | null;
  agentSummary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  confidence: string | null;
  reviewStatus: string | null;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
  regulationVersion: number;
  permitName: string | null;
  permitCostSummary: string | null;
  permitProcessingTime: string | null;
  permitApplicationUrl: string | null;
  permitRenewal: string | null;
  permitDetailsUpdatedAt: string | null;
  permitSteps: string[];
  safetyRequirements: Array<{ item: string; detail: string }>;
  updatedAt: string;
}

export interface RegulationMarket {
  city: string;
  state: string;
  leads: number;
  avgScore: number | null;
  ruleId: string | null;
  status: CanonicalStatus | null;
  reviewStatus: string | null;
  confidence: string | null;
  sourceType: string | null;
  lastVerifiedAt: string | null;
  agentSummary: string | null;
  summary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  strAllowed: boolean | null;
  permitRequired: boolean | null;
  licenseRequired: boolean | null;
  primaryResidenceRequired: boolean | null;
  nightCap: number | null;
  minimumStay: number | null;
}

export interface RegulationCoverage {
  totalApplicable: number;
  regulationEvaluated: number;
  cityRulesFound: number;
  allowed: number;
  allowedWithRequirements: number;
  permitRequired: number;
  restricted: number;
  primaryResidenceRequired: number;
  prohibited: number;
  unknown: number;
  reviewRequired: number;
  stale: number;
  jurisdictionUnknown: number;
}

export interface CityRegulationsPageData {
  counts: {
    totalRules: number;
    aiResearched: number;
    marketsWithLeads: number;
    uncoveredMarkets: number;
  };
  coverage: RegulationCoverage;
  regulations: RegulationRecord[];
  markets: RegulationMarket[];
}
