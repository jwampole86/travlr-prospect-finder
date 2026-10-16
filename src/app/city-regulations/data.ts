import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

import type { CityRegulationsPageData, RegulationCoverage, RegulationMarket, RegulationRecord } from './components/types';

type RegulationRow = {
  id: string;
  jurisdiction_name: string;
  city: string | null;
  county: string | null;
  state: string;
  jurisdiction_type: string;
  status: RegulationRecord['status'];
  str_allowed: boolean | null;
  permit_required: boolean | null;
  license_required: boolean | null;
  registration_required: boolean | null;
  primary_residence_required: boolean | null;
  owner_occupancy_required: boolean | null;
  night_cap: number | null;
  minimum_stay: number | null;
  occupancy_limit: number | null;
  tax_requirements: string | null;
  additional_restrictions: string | null;
  summary: string | null;
  agent_summary: string | null;
  source_name: string | null;
  source_url: string | null;
  source_type: string | null;
  confidence: string | null;
  review_status: string | null;
  last_verified_at: string | null;
  next_review_at: string | null;
  regulation_version: number | null;
  permit_name: string | null;
  permit_cost_summary: string | null;
  permit_processing_time: string | null;
  permit_application_url: string | null;
  permit_renewal: string | null;
  permit_details_updated_at: string | null;
  permit_steps: string[] | null;
  safety_requirements: Array<{ item?: string | null; detail?: string | null }> | null;
  updated_at: string;
};

type CoverageRow = {
  total_applicable?: number;
  regulation_evaluated?: number;
  city_rules_found?: number;
  allowed?: number;
  allowed_with_requirements?: number;
  permit_required?: number;
  restricted?: number;
  primary_residence_required?: number;
  prohibited?: number;
  unknown?: number;
  review_required?: number;
  stale?: number;
  jurisdiction_unknown?: number;
};

type MarketRow = {
  city: string;
  state: string;
  leads: number;
  avg_score: number | null;
  rule_id: string | null;
  status: RegulationMarket['status'];
  review_status: string | null;
  confidence: string | null;
  source_type: string | null;
  last_verified_at: string | null;
  agent_summary: string | null;
  summary: string | null;
  source_name: string | null;
  source_url: string | null;
  str_allowed: boolean | null;
  permit_required: boolean | null;
  license_required: boolean | null;
  primary_residence_required: boolean | null;
  night_cap: number | null;
  minimum_stay: number | null;
};

function toRecord(row: RegulationRow): RegulationRecord {
  return {
    id: row.id,
    jurisdictionName: row.jurisdiction_name,
    city: row.city,
    county: row.county,
    state: row.state,
    jurisdictionType: row.jurisdiction_type,
    status: row.status,
    strAllowed: row.str_allowed,
    permitRequired: row.permit_required,
    licenseRequired: row.license_required,
    registrationRequired: row.registration_required,
    primaryResidenceRequired: row.primary_residence_required,
    ownerOccupancyRequired: row.owner_occupancy_required,
    nightCap: row.night_cap,
    minimumStay: row.minimum_stay,
    occupancyLimit: row.occupancy_limit,
    taxRequirements: row.tax_requirements,
    additionalRestrictions: row.additional_restrictions,
    summary: row.summary,
    agentSummary: row.agent_summary,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    confidence: row.confidence,
    reviewStatus: row.review_status,
    lastVerifiedAt: row.last_verified_at,
    nextReviewAt: row.next_review_at,
    regulationVersion: row.regulation_version ?? 1,
    permitName: row.permit_name,
    permitCostSummary: row.permit_cost_summary,
    permitProcessingTime: row.permit_processing_time,
    permitApplicationUrl: row.permit_application_url,
    permitRenewal: row.permit_renewal,
    permitDetailsUpdatedAt: row.permit_details_updated_at,
    permitSteps: row.permit_steps ?? [],
    safetyRequirements: (row.safety_requirements ?? []).flatMap((item) => item?.item && item?.detail ? [{ item: item.item, detail: item.detail }] : []),
    updatedAt: row.updated_at,
  };
}

function toCoverage(row: CoverageRow | null): RegulationCoverage {
  return {
    totalApplicable: row?.total_applicable ?? 0,
    regulationEvaluated: row?.regulation_evaluated ?? 0,
    cityRulesFound: row?.city_rules_found ?? 0,
    allowed: row?.allowed ?? 0,
    allowedWithRequirements: row?.allowed_with_requirements ?? 0,
    permitRequired: row?.permit_required ?? 0,
    restricted: row?.restricted ?? 0,
    primaryResidenceRequired: row?.primary_residence_required ?? 0,
    prohibited: row?.prohibited ?? 0,
    unknown: row?.unknown ?? 0,
    reviewRequired: row?.review_required ?? 0,
    stale: row?.stale ?? 0,
    jurisdictionUnknown: row?.jurisdiction_unknown ?? 0,
  };
}

function toMarket(row: MarketRow): RegulationMarket {
  return {
    city: row.city,
    state: row.state,
    leads: row.leads,
    avgScore: row.avg_score,
    ruleId: row.rule_id,
    status: row.status,
    reviewStatus: row.review_status,
    confidence: row.confidence,
    sourceType: row.source_type,
    lastVerifiedAt: row.last_verified_at,
    agentSummary: row.agent_summary,
    summary: row.summary,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    strAllowed: row.str_allowed,
    permitRequired: row.permit_required,
    licenseRequired: row.license_required,
    primaryResidenceRequired: row.primary_residence_required,
    nightCap: row.night_cap,
    minimumStay: row.minimum_stay,
  };
}

export async function getCityRegulationsPageData(): Promise<CityRegulationsPageData> {
  const db = getSupabaseAdmin();

  const [countResult, aiCountResult, coverageResult, regulationsResult, marketsResult] = await Promise.all([
    db.from('city_regulations').select('id', { count: 'exact', head: true }),
    db.from('city_regulations').select('id', { count: 'exact', head: true }).eq('source_type', 'AI_RESEARCHED'),
    db.rpc('get_regulation_coverage', { p_state: 'all' }),
    db
      .from('city_regulations')
      .select('id, jurisdiction_name, city, county, state, jurisdiction_type, status, str_allowed, permit_required, license_required, registration_required, primary_residence_required, owner_occupancy_required, night_cap, minimum_stay, occupancy_limit, tax_requirements, additional_restrictions, summary, agent_summary, source_name, source_url, source_type, confidence, review_status, last_verified_at, next_review_at, regulation_version, permit_name, permit_cost_summary, permit_processing_time, permit_application_url, permit_renewal, permit_details_updated_at, permit_steps, safety_requirements, updated_at')
      .order('updated_at', { ascending: false })
      .range(0, 399),
    db.rpc('get_regulation_markets', { p_state: 'all' }),
  ]);

  if (coverageResult.error) throw new Error(coverageResult.error.message);
  if (regulationsResult.error) throw new Error(regulationsResult.error.message);
  if (marketsResult.error) throw new Error(marketsResult.error.message);

  const regulations = ((regulationsResult.data ?? []) as RegulationRow[]).map(toRecord);
  const markets = ((marketsResult.data ?? []) as MarketRow[]).map(toMarket).filter((market) => market.city && market.state);

  return {
    counts: {
      totalRules: countResult.count ?? regulations.length,
      aiResearched: aiCountResult.count ?? regulations.filter((row) => row.sourceType === 'AI_RESEARCHED').length,
      marketsWithLeads: markets.filter((market) => market.leads > 0).length,
      uncoveredMarkets: markets.filter((market) => market.leads > 0 && !market.ruleId).length,
    },
    coverage: toCoverage((coverageResult.data ?? null) as CoverageRow | null),
    regulations,
    markets,
  };
}
