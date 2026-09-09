/**
 * TRAVLR City Regulations / STR Rules Engine
 * One source of truth for all regulation data across the platform.
 */

import { createClient } from '@/lib/supabase/client';

// ─── Canonical Status Taxonomy ────────────────────────────────────────────────

export type CanonicalRegStatus =
  | 'ALLOWED' |'ALLOWED_WITH_REQUIREMENTS' |'PERMIT_REQUIRED' |'RESTRICTED' |'PRIMARY_RESIDENCE_REQUIRED' |'PROHIBITED' |'UNKNOWN' |'REVIEW_REQUIRED';

export const CANONICAL_STATUS_LABELS: Record<CanonicalRegStatus, string> = {
  ALLOWED: 'Allowed',
  ALLOWED_WITH_REQUIREMENTS: 'Allowed with Requirements',
  PERMIT_REQUIRED: 'Permit Required',
  RESTRICTED: 'Restricted',
  PRIMARY_RESIDENCE_REQUIRED: 'Primary Residence Required',
  PROHIBITED: 'Prohibited',
  UNKNOWN: 'Unknown',
  REVIEW_REQUIRED: 'Review Required',
};

export const CANONICAL_STATUS_COLORS: Record<CanonicalRegStatus, string> = {
  ALLOWED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  ALLOWED_WITH_REQUIREMENTS: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  PERMIT_REQUIRED: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  RESTRICTED: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  PRIMARY_RESIDENCE_REQUIRED: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  PROHIBITED: 'bg-red-500/10 text-red-700 border-red-500/20',
  UNKNOWN: 'bg-muted text-muted-foreground border-border',
  REVIEW_REQUIRED: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
};

export const CANONICAL_STATUS_ALERT: Record<CanonicalRegStatus, boolean> = {
  ALLOWED: false,
  ALLOWED_WITH_REQUIREMENTS: false,
  PERMIT_REQUIRED: false,
  RESTRICTED: true,
  PRIMARY_RESIDENCE_REQUIRED: true,
  PROHIBITED: true,
  UNKNOWN: false,
  REVIEW_REQUIRED: false,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CityRegulation {
  id: string;
  jurisdictionName: string;
  city: string | null;
  county: string | null;
  state: string;
  jurisdictionType: string;
  status: CanonicalRegStatus;
  strAllowed: boolean | null;
  permitRequired: boolean | null;
  licenseRequired: boolean | null;
  registrationRequired: boolean | null;
  primaryResidenceRequired: boolean | null;
  ownerOccupancyRequired: boolean | null;
  nightCap: number | null;
  minimumStay: number | null;
  maximumStay: number | null;
  occupancyLimit: number | null;
  parkingRequirements: string | null;
  zoningRestrictions: string | null;
  hostPresenceRequired: boolean | null;
  localContactRequired: boolean | null;
  taxRequirements: string | null;
  inspectionRequired: boolean | null;
  insuranceRequirements: string | null;
  hoaConsideration: string | null;
  additionalRestrictions: string | null;
  summary: string | null;
  agentSummary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  effectiveDate: string | null;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
  confidence: string;
  reviewStatus: string;
  regulationVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyRegulationEvaluation {
  id: string;
  leadId: string;
  cityRegulationId: string | null;
  jurisdictionName: string | null;
  cityRegulationStatus: CanonicalRegStatus;
  evaluatedAt: string;
  regulationVersion: number | null;
  sourceLastVerifiedAt: string | null;
  confidence: string;
  reviewRequired: boolean;
  evaluationReason: string | null;
  dataQualityFlags: string[] | null;
  cityRegulation?: CityRegulation | null;
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
  coveragePercent: number;
}

export interface TeleprompterRegulationContext {
  jurisdictionName: string;
  cityRegulationStatus: CanonicalRegStatus;
  statusLabel: string;
  permitRequired: string;
  licenseRequired: string;
  primaryResidenceRequired: string;
  nightCap: string;
  minimumStay: string;
  occupancyLimit: string;
  lastVerified: string;
  agentSummary: string;
  reviewStatus: string;
  isStale: boolean;
  isProhibited: boolean;
  isRestricted: boolean;
  hasAlert: boolean;
  alertMessage: string | null;
  keyRules: string[];
}

// ─── DB row → typed object ────────────────────────────────────────────────────

function dbToCityRegulation(row: Record<string, unknown>): CityRegulation {
  return {
    id: row.id as string,
    jurisdictionName: row.jurisdiction_name as string,
    city: row.city as string | null,
    county: row.county as string | null,
    state: row.state as string,
    jurisdictionType: (row.jurisdiction_type as string) || 'CITY',
    status: (row.status as CanonicalRegStatus) || 'UNKNOWN',
    strAllowed: row.str_allowed as boolean | null,
    permitRequired: row.permit_required as boolean | null,
    licenseRequired: row.license_required as boolean | null,
    registrationRequired: row.registration_required as boolean | null,
    primaryResidenceRequired: row.primary_residence_required as boolean | null,
    ownerOccupancyRequired: row.owner_occupancy_required as boolean | null,
    nightCap: row.night_cap as number | null,
    minimumStay: row.minimum_stay as number | null,
    maximumStay: row.maximum_stay as number | null,
    occupancyLimit: row.occupancy_limit as number | null,
    parkingRequirements: row.parking_requirements as string | null,
    zoningRestrictions: row.zoning_restrictions as string | null,
    hostPresenceRequired: row.host_presence_required as boolean | null,
    localContactRequired: row.local_contact_required as boolean | null,
    taxRequirements: row.tax_requirements as string | null,
    inspectionRequired: row.inspection_required as boolean | null,
    insuranceRequirements: row.insurance_requirements as string | null,
    hoaConsideration: row.hoa_consideration as string | null,
    additionalRestrictions: row.additional_restrictions as string | null,
    summary: row.summary as string | null,
    agentSummary: row.agent_summary as string | null,
    sourceName: row.source_name as string | null,
    sourceUrl: row.source_url as string | null,
    sourceType: row.source_type as string | null,
    effectiveDate: row.effective_date as string | null,
    lastVerifiedAt: row.last_verified_at as string | null,
    nextReviewAt: row.next_review_at as string | null,
    confidence: (row.confidence as string) || 'MEDIUM',
    reviewStatus: (row.review_status as string) || 'UNKNOWN',
    regulationVersion: (row.regulation_version as number) || 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function dbToEvaluation(row: Record<string, unknown>): PropertyRegulationEvaluation {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    cityRegulationId: row.city_regulation_id as string | null,
    jurisdictionName: row.jurisdiction_name as string | null,
    cityRegulationStatus: (row.city_regulation_status as CanonicalRegStatus) || 'UNKNOWN',
    evaluatedAt: row.evaluated_at as string,
    regulationVersion: row.regulation_version as number | null,
    sourceLastVerifiedAt: row.source_last_verified_at as string | null,
    confidence: (row.confidence as string) || 'MEDIUM',
    reviewRequired: (row.review_required as boolean) || false,
    evaluationReason: row.evaluation_reason as string | null,
    dataQualityFlags: row.data_quality_flags as string[] | null,
    cityRegulation: row.city_regulations
      ? dbToCityRegulation(row.city_regulations as Record<string, unknown>)
      : null,
  };
}

// ─── Freshness helpers ────────────────────────────────────────────────────────

export function getRegulationFreshnessStatus(lastVerifiedAt: string | null): 'CURRENT' | 'REVIEW_DUE' | 'STALE' | 'UNKNOWN' {
  if (!lastVerifiedAt) return 'UNKNOWN';
  const daysSince = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 365) return 'STALE';
  if (daysSince > 180) return 'REVIEW_DUE';
  return 'CURRENT';
}

export function formatRegDate(iso: string | null): string {
  if (!iso) return 'Not verified';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ─── Build teleprompter context ───────────────────────────────────────────────

export function buildTeleprompterRegulationContext(
  evaluation: PropertyRegulationEvaluation | null
): TeleprompterRegulationContext {
  if (!evaluation) {
    return {
      jurisdictionName: 'Unknown / Not Verified',
      cityRegulationStatus: 'UNKNOWN',
      statusLabel: 'Unknown',
      permitRequired: 'Not verified',
      licenseRequired: 'Not verified',
      primaryResidenceRequired: 'Not verified',
      nightCap: 'Not verified',
      minimumStay: 'Not verified',
      occupancyLimit: 'Not verified',
      lastVerified: 'Not verified',
      agentSummary: 'Local STR rules have not been fully verified for this property.',
      reviewStatus: 'UNKNOWN',
      isStale: false,
      isProhibited: false,
      isRestricted: false,
      hasAlert: false,
      alertMessage: null,
      keyRules: [],
    };
  }

  const cr = evaluation.cityRegulation;
  const status = evaluation.cityRegulationStatus;
  const freshness = getRegulationFreshnessStatus(evaluation.sourceLastVerifiedAt);
  const isStale = freshness === 'STALE' || freshness === 'REVIEW_DUE';
  const isProhibited = status === 'PROHIBITED';
  const isRestricted = ['RESTRICTED', 'PRIMARY_RESIDENCE_REQUIRED'].includes(status);
  const hasAlert = CANONICAL_STATUS_ALERT[status] || isStale;

  // Build key rules (only non-null meaningful values)
  const keyRules: string[] = [];
  if (cr?.permitRequired === true) keyRules.push('Permit required');
  if (cr?.licenseRequired === true) keyRules.push('License required');
  if (cr?.registrationRequired === true) keyRules.push('Registration required');
  if (cr?.primaryResidenceRequired === true) keyRules.push('Primary residence required');
  if (cr?.nightCap) keyRules.push(`Max ${cr.nightCap} rental nights/year`);
  if (cr?.minimumStay) keyRules.push(`Minimum stay: ${cr.minimumStay} nights`);
  if (cr?.occupancyLimit) keyRules.push(`Occupancy limit: ${cr.occupancyLimit} guests`);
  if (cr?.localContactRequired === true) keyRules.push('Local contact required');
  if (cr?.hostPresenceRequired === true) keyRules.push('Host presence required');
  if (cr?.zoningRestrictions) keyRules.push(`Zoning: ${cr.zoningRestrictions}`);

  let alertMessage: string | null = null;
  if (isProhibited) {
    alertMessage = 'This jurisdiction has PROHIBITED short-term rentals. Review before discussing management potential.';
  } else if (isRestricted) {
    alertMessage = 'This jurisdiction has significant STR restrictions. Review the local rules before discussing management potential.';
  } else if (isStale) {
    alertMessage = 'Local STR rules are due for review. Verify current requirements before providing regulatory guidance.';
  }

  const unknownStatuses: CanonicalRegStatus[] = ['UNKNOWN', 'REVIEW_REQUIRED'];
  const agentSummary = unknownStatuses.includes(status)
    ? 'Local STR rules have not been fully verified for this property.'
    : (cr?.agentSummary || cr?.summary || CANONICAL_STATUS_LABELS[status]);

  return {
    jurisdictionName: evaluation.jurisdictionName || 'Unknown / Not Verified',
    cityRegulationStatus: status,
    statusLabel: CANONICAL_STATUS_LABELS[status],
    permitRequired: cr?.permitRequired === true ? 'Required' : cr?.permitRequired === false ? 'Not required' : 'Not verified',
    licenseRequired: cr?.licenseRequired === true ? 'Required' : cr?.licenseRequired === false ? 'Not required' : 'Not verified',
    primaryResidenceRequired: cr?.primaryResidenceRequired === true ? 'Required' : cr?.primaryResidenceRequired === false ? 'Not required' : 'Not verified',
    nightCap: cr?.nightCap ? `${cr.nightCap} nights/year` : 'None identified',
    minimumStay: cr?.minimumStay ? `${cr.minimumStay} nights` : 'None identified',
    occupancyLimit: cr?.occupancyLimit ? `${cr.occupancyLimit} guests` : 'Not specified',
    lastVerified: formatRegDate(evaluation.sourceLastVerifiedAt),
    agentSummary,
    reviewStatus: freshness,
    isStale,
    isProhibited,
    isRestricted,
    hasAlert,
    alertMessage,
    keyRules,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class CityRegulationService {
  // Get evaluation for a specific lead (with canonical regulation joined)
  async getEvaluationForLead(leadId: string): Promise<PropertyRegulationEvaluation | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('property_regulation_evaluations')
      .select(`
        *,
        city_regulations (*)
      `)
      .eq('lead_id', leadId)
      .single();

    if (error || !data) return null;
    return dbToEvaluation(data as Record<string, unknown>);
  }

  // Get teleprompter context for a specific lead
  async getTeleprompterContext(leadId: string): Promise<TeleprompterRegulationContext> {
    const evaluation = await this.getEvaluationForLead(leadId);
    return buildTeleprompterRegulationContext(evaluation);
  }

  // Get all city regulations (for admin management)
  async getAllCityRegulations(stateFilter?: string): Promise<CityRegulation[]> {
    const supabase = createClient();
    let query = supabase
      .from('city_regulations')
      .select('*')
      .order('state', { ascending: true })
      .order('city', { ascending: true });

    if (stateFilter && stateFilter !== 'all') {
      query = query.eq('state', stateFilter);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(dbToCityRegulation);
  }

  // Get regulation coverage stats
  async getCoverage(stateFilter?: string): Promise<RegulationCoverage> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_regulation_coverage', {
      p_state: stateFilter || 'all',
    });

    if (error || !data) {
      return {
        totalApplicable: 0, regulationEvaluated: 0, cityRulesFound: 0,
        allowed: 0, allowedWithRequirements: 0, permitRequired: 0,
        restricted: 0, primaryResidenceRequired: 0, prohibited: 0,
        unknown: 0, reviewRequired: 0, stale: 0, jurisdictionUnknown: 0,
        coveragePercent: 0,
      };
    }

    const d = data as Record<string, number>;
    const total = d.total_applicable || 0;
    const evaluated = d.regulation_evaluated || 0;
    return {
      totalApplicable: total,
      regulationEvaluated: evaluated,
      cityRulesFound: d.city_rules_found || 0,
      allowed: d.allowed || 0,
      allowedWithRequirements: d.allowed_with_requirements || 0,
      permitRequired: d.permit_required || 0,
      restricted: d.restricted || 0,
      primaryResidenceRequired: d.primary_residence_required || 0,
      prohibited: d.prohibited || 0,
      unknown: d.unknown || 0,
      reviewRequired: d.review_required || 0,
      stale: d.stale || 0,
      jurisdictionUnknown: d.jurisdiction_unknown || 0,
      coveragePercent: total > 0 ? Math.round((evaluated / total) * 100) : 0,
    };
  }

  // Evaluate a single lead's regulation (upsert)
  async evaluateLead(leadId: string, city: string, state: string): Promise<PropertyRegulationEvaluation | null> {
    const supabase = createClient();

    // Find canonical regulation
    const { data: crData } = await supabase
      .from('city_regulations')
      .select('*')
      .eq('state', state)
      .ilike('city', city.trim())
      .single();

    let evalData: Record<string, unknown>;

    if (crData) {
      const cr = dbToCityRegulation(crData as Record<string, unknown>);
      evalData = {
        lead_id: leadId,
        city_regulation_id: cr.id,
        jurisdiction_name: cr.jurisdictionName,
        city_regulation_status: cr.status,
        evaluated_at: new Date().toISOString(),
        regulation_version: cr.regulationVersion,
        source_last_verified_at: cr.lastVerifiedAt,
        confidence: cr.confidence,
        review_required: cr.reviewStatus !== 'CURRENT',
        evaluation_reason: 'CANONICAL_MATCH',
        data_quality_flags: null,
      };
    } else {
      evalData = {
        lead_id: leadId,
        city_regulation_id: null,
        jurisdiction_name: city && state ? `${city}, ${state}` : null,
        city_regulation_status: 'UNKNOWN',
        evaluated_at: new Date().toISOString(),
        regulation_version: null,
        source_last_verified_at: null,
        confidence: 'LOW',
        review_required: true,
        evaluation_reason: 'NO_CANONICAL_RECORD',
        data_quality_flags: ['REGULATION_NOT_FOUND', 'JURISDICTION_UNKNOWN'],
      };
    }

    const { data, error } = await supabase
      .from('property_regulation_evaluations')
      .upsert(evalData, { onConflict: 'lead_id' })
      .select(`*, city_regulations (*)`)
      .single();

    if (error || !data) return null;
    return dbToEvaluation(data as Record<string, unknown>);
  }

  // Trace regulation for admin diagnostics
  async traceRegulation(leadId: string): Promise<Record<string, unknown> | null> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('trace_regulation', { p_lead_id: leadId });
    if (error || !data) return null;
    return data as Record<string, unknown>;
  }

  // Update a canonical city regulation and re-evaluate all affected leads
  async updateCityRegulation(
    id: string,
    updates: Partial<CityRegulation>,
    userId: string
  ): Promise<{ updated: boolean; affectedLeads: number }> {
    const supabase = createClient();

    // Get current version
    const { data: current } = await supabase
      .from('city_regulations')
      .select('regulation_version, status, jurisdiction_name')
      .eq('id', id)
      .single();

    const newVersion = ((current?.regulation_version as number) || 1) + 1;

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      regulation_version: newVersion,
    };

    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.permitRequired !== undefined) dbUpdates.permit_required = updates.permitRequired;
    if (updates.licenseRequired !== undefined) dbUpdates.license_required = updates.licenseRequired;
    if (updates.primaryResidenceRequired !== undefined) dbUpdates.primary_residence_required = updates.primaryResidenceRequired;
    if (updates.nightCap !== undefined) dbUpdates.night_cap = updates.nightCap;
    if (updates.minimumStay !== undefined) dbUpdates.minimum_stay = updates.minimumStay;
    if (updates.occupancyLimit !== undefined) dbUpdates.occupancy_limit = updates.occupancyLimit;
    if (updates.summary !== undefined) dbUpdates.summary = updates.summary;
    if (updates.agentSummary !== undefined) dbUpdates.agent_summary = updates.agentSummary;
    if (updates.sourceName !== undefined) dbUpdates.source_name = updates.sourceName;
    if (updates.sourceUrl !== undefined) dbUpdates.source_url = updates.sourceUrl;
    if (updates.lastVerifiedAt !== undefined) dbUpdates.last_verified_at = updates.lastVerifiedAt;
    if (updates.reviewStatus !== undefined) dbUpdates.review_status = updates.reviewStatus;
    if (updates.confidence !== undefined) dbUpdates.confidence = updates.confidence;

    const { error: updateError } = await supabase
      .from('city_regulations')
      .update(dbUpdates)
      .eq('id', id);

    if (updateError) return { updated: false, affectedLeads: 0 };

    // Re-evaluate all leads referencing this regulation
    const { data: affectedEvals } = await supabase
      .from('property_regulation_evaluations')
      .select('lead_id')
      .eq('city_regulation_id', id);

    const affectedLeads = affectedEvals?.length || 0;

    if (affectedLeads > 0) {
      const newStatus = (updates.status || current?.status) as string;
      await supabase
        .from('property_regulation_evaluations')
        .update({
          city_regulation_status: newStatus,
          regulation_version: newVersion,
          source_last_verified_at: updates.lastVerifiedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('city_regulation_id', id);

      // Log activity for status change
      if (updates.status && updates.status !== current?.status) {
        const leadIds = (affectedEvals || []).map((e: Record<string, unknown>) => e.lead_id as string);
        const activityRows = leadIds.slice(0, 100).map((leadId: string) => ({
          lead_id: leadId,
          activity_type: 'REGULATION_STATUS_CHANGED',
          activity_data: {
            jurisdiction: current?.jurisdiction_name,
            old_status: current?.status,
            new_status: updates.status,
            regulation_version: newVersion,
          },
          performed_by: userId,
        }));

        if (activityRows.length > 0) {
          await supabase.from('lead_activity_log').insert(activityRows);
        }
      }
    }

    return { updated: true, affectedLeads };
  }
}

export const cityRegulationService = new CityRegulationService();
