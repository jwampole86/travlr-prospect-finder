/**
 * kpiDefinitions.ts — Canonical KPI Metric Contract
 *
 * SINGLE SOURCE OF TRUTH for all Dashboard KPI metrics.
 * Both the Dashboard (useDashboardLeads) and the KPI Monitor (DashboardKPIMonitor)
 * MUST reference these definitions. Never implement the same business logic twice.
 *
 * Canonical terminal stages (valid lead_stage enum): 'Not a Fit', 'Live' * Canonical active pipeline stages:'Contacted', 'Interested', 'Proposal Sent', 'Under Contract'
 * Canonical score field: prospect_score
 * Canonical assignment field: primary_agent_id (NOT agent_name text)
 * Canonical phone field: contact_phone (NOT has_phone cached flag)
 *
 * STR Eligible definition:
 *   The Dashboard card labeled "STR-Eligible" shows regulation_status IN ('Allowed','Restricted')
 *   — i.e. markets where STR operation is potentially legal (Allowed = unrestricted, Restricted = conditional).
 *   This is the "STR_ELIGIBLE" metric. *"Fully Allowed" (regulation_status = 'Allowed' only) is a separate, stricter metric.
 *   The KPI Monitor MUST compare STR_ELIGIBLE against the same Allowed+Restricted definition,
 *   NOT against Allowed-only. Comparing different definitions is a false divergence.
 */

import { createClient } from '@/lib/supabase/client';

// ─── Metric IDs ───────────────────────────────────────────────────────────────

export const METRIC_IDS = {
  TOTAL_LEADS: 'TOTAL_LEADS',
  HIGH_PRIORITY: 'HIGH_PRIORITY',
  AVG_SCORE: 'AVG_SCORE',
  ACTION_NEEDED: 'ACTION_NEEDED',
  FULLY_VERIFIED: 'FULLY_VERIFIED',
  PHONE_AVAILABLE: 'PHONE_AVAILABLE',
  UNASSIGNED_PRIORITY: 'UNASSIGNED_PRIORITY',
  ASSIGNED: 'ASSIGNED',
  ACTIVE_PIPELINE: 'ACTIVE_PIPELINE',
  STR_ELIGIBLE: 'STR_ELIGIBLE',
} as const;

export type MetricId = (typeof METRIC_IDS)[keyof typeof METRIC_IDS];

// ─── Canonical Terminal Stages ────────────────────────────────────────────────

/** Valid lead_stage enum terminal values — prospects that are closed/disqualified */
export const TERMINAL_STAGES = ['Not a Fit', 'Live'] as const;

/** Valid lead_stage enum active pipeline values — in-progress, past New Lead */
export const ACTIVE_PIPELINE_STAGES = [
  'Contacted',
  'Interested',
  'Proposal Sent',
  'Under Contract',
] as const;

/** High Priority score threshold */
export const HIGH_PRIORITY_SCORE_THRESHOLD = 75;

// ─── Metric Definitions ───────────────────────────────────────────────────────

export interface KpiMetricDefinition {
  metricId: MetricId;
  label: string;
  description: string;
  /** Human-readable canonical definition for display in KPI Monitor */
  canonicalDefinition: string;
  /** Tolerance: divergence beyond this triggers a warning */
  tolerance: number;
  /** Click-through filter URL for Lead Management */
  clickThroughFilter: string;
}

export const KPI_METRIC_DEFINITIONS: Record<MetricId, KpiMetricDefinition> = {
  TOTAL_LEADS: {
    metricId: 'TOTAL_LEADS',
    label: 'Total Leads',
    description: 'All real (non-synthetic) prospects in the database',
    canonicalDefinition: 'COUNT(DISTINCT id) WHERE is_synthetic IS NOT TRUE',
    tolerance: 5,
    clickThroughFilter: '/lead-management',
  },
  HIGH_PRIORITY: {
    metricId: 'HIGH_PRIORITY',
    label: 'High Priority',
    description: 'Prospects with score ≥ 75 that are not in terminal stages',
    canonicalDefinition: `prospect_score >= ${HIGH_PRIORITY_SCORE_THRESHOLD} AND stage NOT IN (${TERMINAL_STAGES.map(s => `'${s}'`).join(', ')})`,
    tolerance: 10,
    clickThroughFilter: `/lead-management?scoreMin=${HIGH_PRIORITY_SCORE_THRESHOLD}`,
  },
  AVG_SCORE: {
    metricId: 'AVG_SCORE',
    label: 'Avg Score',
    description: 'Average prospect_score over all real prospects with score > 0',
    canonicalDefinition: 'ROUND(AVG(prospect_score)) WHERE is_synthetic IS NOT TRUE AND prospect_score > 0 — server-side via get_canonical_avg_score RPC (full population, no row cap, no joins, one row per lead)',
    tolerance: 0,
    clickThroughFilter: '/tools',
  },
  ACTION_NEEDED: {
    metricId: 'ACTION_NEEDED',
    label: 'Action Needed',
    description: 'High-score prospects not yet contacted (New Lead stage)',
    canonicalDefinition: `prospect_score >= ${HIGH_PRIORITY_SCORE_THRESHOLD} AND stage = 'New Lead'`,
    tolerance: 10,
    // After pipeline stage correction (Active Pipeline = 0), Action Needed = High Priority.
    // Both filters use the same score threshold. actionNeeded=true maps to stage=New Lead + score>=75.
    clickThroughFilter: `/lead-management?scoreMin=${HIGH_PRIORITY_SCORE_THRESHOLD}&stage=New+Lead`,
  },
  FULLY_VERIFIED: {
    metricId: 'FULLY_VERIFIED',
    label: 'Fully Verified',
    description: 'Prospects with verified owner, address, and phone number',
    canonicalDefinition: 'verified_owner=true AND verified_address IS NOT NULL/empty AND verified_number=true',
    tolerance: 2,
    clickThroughFilter: '/lead-management?view=verified-priority&verifiedOnly=true',
  },
  PHONE_AVAILABLE: {
    metricId: 'PHONE_AVAILABLE',
    label: 'Phone Available',
    description: 'Prospects with a non-empty contact_phone (canonical phone field)',
    canonicalDefinition: 'contact_phone IS NOT NULL AND contact_phone <> \'\'',
    tolerance: 2,
    clickThroughFilter: '/lead-management?phoneAvailableOnly=true',
  },
  UNASSIGNED_PRIORITY: {
    metricId: 'UNASSIGNED_PRIORITY',
    label: 'Unassigned Priority',
    description: 'High Priority prospects with no agent assigned (primary_agent_id IS NULL)',
    canonicalDefinition: `prospect_score >= ${HIGH_PRIORITY_SCORE_THRESHOLD} AND stage NOT IN (${TERMINAL_STAGES.map(s => `'${s}'`).join(', ')}) AND primary_agent_id IS NULL`,
    tolerance: 5,
    clickThroughFilter: `/lead-management?scoreMin=${HIGH_PRIORITY_SCORE_THRESHOLD}&assignmentStatus=unassigned`,
  },
  ASSIGNED: {
    metricId: 'ASSIGNED',
    label: 'Assigned',
    description: 'Prospects with a primary agent assigned (primary_agent_id IS NOT NULL)',
    canonicalDefinition: 'primary_agent_id IS NOT NULL',
    tolerance: 10,
    clickThroughFilter: '/lead-management?assignmentStatus=assigned',
  },
  ACTIVE_PIPELINE: {
    metricId: 'ACTIVE_PIPELINE',
    label: 'Active Pipeline',
    description: 'Prospects in active in-progress stages (past New Lead, not terminal). Only advances via real authorized outreach events.',
    canonicalDefinition: `stage IN (${ACTIVE_PIPELINE_STAGES.map(s => `'${s}'`).join(', ')}) — requires real outreach event (call, SMS, email, appointment, proposal, contract)`,
    tolerance: 5,
    clickThroughFilter: `/lead-management?stages=${ACTIVE_PIPELINE_STAGES.map(s => encodeURIComponent(s)).join('&stages=')}`,
  },
  STR_ELIGIBLE: {
    metricId: 'STR_ELIGIBLE',
    label: 'STR-Eligible',
    description: 'Prospects in markets where STR operation is potentially legal (Allowed or Restricted)',
    canonicalDefinition: "regulation_status IN ('Allowed', 'Restricted')",
    tolerance: 20,
    clickThroughFilter: '/lead-management?regulation=Allowed&regulation=Restricted',
  },
};

// ─── Canonical DB Query Functions ─────────────────────────────────────────────

/**
 * High Priority base scope — shared by HIGH_PRIORITY and UNASSIGNED_PRIORITY.
 * Both metrics build from this same base. Never duplicate this logic.
 *
 * Returns a Supabase query builder with the high-priority filters applied.
 * Caller adds additional filters (e.g. primary_agent_id IS NULL for unassigned).
 */
export function applyHighPriorityBaseScope(
  query: ReturnType<ReturnType<typeof createClient>['from']>,
  pState?: string | null
) {
  let q = query
    .neq('is_synthetic', true)
    .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
    .not('stage', 'in', `(${TERMINAL_STAGES.map(s => `"${s}"`).join(',')})`);

  if (pState && pState !== 'all') {
    q = q.eq('state', pState);
  }
  return q;
}

/**
 * Run all canonical KPI DB counts in parallel.
 * Used by the KPI Monitor to validate Dashboard values.
 * Returns the same metric IDs as the Dashboard RPC.
 *
 * IMPORTANT: This uses the EXACT same definitions as get_dashboard_summary RPC.
 * If you change a definition here, update the RPC migration too.
 *
 * AVG_SCORE ROOT CAUSE FIX (20260906000000):
 *   Previous version used .select('prospect_score') via PostgREST which returns
 *   at most 1000 rows by default. Client-side average of 1000 rows ≠ true average
 *   of 5,897 rows → biased sample → KPI Monitor showed 96 while Dashboard (RPC)
 *   correctly showed 93.
 *   Fix: AVG_SCORE now calls get_canonical_avg_score() RPC which executes
 *   AVG() server-side over the FULL population — same logic as get_dashboard_summary.
 *
 * AVG_SCORE DIVERGENCE FIX (20260906010000):
 *   Dashboard showed 96, DB showed 76. Both RPCs use identical logic:
 *   ROUND(AVG(prospect_score)) WHERE is_synthetic IS NOT TRUE AND prospect_score > 0.
 *   Root cause: Dashboard was displaying a stale cached value from before score
 *   data changed. The fallback path in useDashboardLeads also used .limit(100)
 *   which produced a biased sample. Both are now fixed.
 *   Tolerance reduced to 0 — both sides must return the same integer value.
 */
export async function fetchCanonicalKpiCounts(
  pState?: string | null
): Promise<Record<MetricId, number> & { error?: string }> {
  const supabase = createClient();
  const ps = pState && pState !== 'all' ? pState : null;

  try {
    const [
      totalRes,
      highPriRes,
      actionNeededRes,
      fullyVerifiedRes,
      phoneAvailableRes,
      unassignedRes,
      assignedRes,
      activePipelineRes,
      // STR Eligible: Allowed OR Restricted (same as Dashboard card)
      strEligibleRes,
      // AVG_SCORE: server-side RPC — full population, no row cap
      avgScoreRpcRes,
    ] = await Promise.all([
      // TOTAL_LEADS
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // HIGH_PRIORITY: score >= 75, not terminal
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
          .not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // ACTION_NEEDED: score >= 75, New Lead
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
          .eq('stage', 'New Lead');
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // FULLY_VERIFIED
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .eq('verified_owner', true)
          .eq('verified_number', true)
          .not('verified_address', 'is', null)
          .neq('verified_address', '')
          .neq('verified_address', 'false');
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // PHONE_AVAILABLE: canonical contact_phone field
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .not('contact_phone', 'is', null)
          .neq('contact_phone', '');
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // UNASSIGNED_PRIORITY: high priority base + primary_agent_id IS NULL
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
          .not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`)
          .is('primary_agent_id', null);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // ASSIGNED: primary_agent_id IS NOT NULL
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .not('primary_agent_id', 'is', null);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // ACTIVE_PIPELINE
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .in('stage', [...ACTIVE_PIPELINE_STAGES]);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // STR_ELIGIBLE: Allowed OR Restricted — same as Dashboard card "Allowed or restricted"
      // NOTE: This is NOT the same as regulation_status = 'Allowed' only.
      // "Fully Allowed" (Allowed only) = 591. "STR Eligible" (Allowed+Restricted) = 4,763.
      // The KPI Monitor MUST compare this metric against Allowed+Restricted, not Allowed-only.
      (() => {
        let q = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .neq('is_synthetic', true)
          .in('regulation_status', ['Allowed', 'Restricted']);
        if (ps) q = q.eq('state', ps);
        return q;
      })(),

      // AVG_SCORE: SERVER-SIDE RPC — full population, no PostgREST row cap
      // ROOT CAUSE FIX: Previous .select('prospect_score') was capped at 1000 rows
      // by PostgREST default → biased sample average (96) ≠ true average (93).
      // get_canonical_avg_score() uses SQL AVG() over ALL rows in one pass.
      supabase.rpc('get_canonical_avg_score', { p_state: ps ?? 'all' }),
    ]);

    // Extract avg_score from RPC response
    let canonicalAvgScore = 0;
    if (avgScoreRpcRes.error) {
      console.error('[fetchCanonicalKpiCounts] get_canonical_avg_score RPC error:', avgScoreRpcRes.error);
      canonicalAvgScore = -1; // signal query failure
    } else {
      const rpcData = avgScoreRpcRes.data as { avg_score?: number } | null;
      canonicalAvgScore = rpcData?.avg_score ?? 0;
      console.log('[fetchCanonicalKpiCounts] AVG_SCORE from server-side RPC:', canonicalAvgScore, '(full population, no row cap)');
    }

    // Validate counts — a null count means the query failed, not that the count is 0
    const safeCount = (res: { count: number | null; error: unknown }, metricId: string): number => {
      if (res.error) {
        console.error(`[fetchCanonicalKpiCounts] ${metricId} query error:`, res.error);
        return -1; // -1 signals a query failure (not a real zero)
      }
      return res.count ?? 0;
    };

    return {
      TOTAL_LEADS: safeCount(totalRes, 'TOTAL_LEADS'),
      HIGH_PRIORITY: safeCount(highPriRes, 'HIGH_PRIORITY'),
      AVG_SCORE: canonicalAvgScore,
      ACTION_NEEDED: safeCount(actionNeededRes, 'ACTION_NEEDED'),
      FULLY_VERIFIED: safeCount(fullyVerifiedRes, 'FULLY_VERIFIED'),
      PHONE_AVAILABLE: safeCount(phoneAvailableRes, 'PHONE_AVAILABLE'),
      UNASSIGNED_PRIORITY: safeCount(unassignedRes, 'UNASSIGNED_PRIORITY'),
      ASSIGNED: safeCount(assignedRes, 'ASSIGNED'),
      ACTIVE_PIPELINE: safeCount(activePipelineRes, 'ACTIVE_PIPELINE'),
      STR_ELIGIBLE: safeCount(strEligibleRes, 'STR_ELIGIBLE'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetchCanonicalKpiCounts] fatal error:', msg);
    return {
      TOTAL_LEADS: -1,
      HIGH_PRIORITY: -1,
      AVG_SCORE: -1,
      ACTION_NEEDED: -1,
      FULLY_VERIFIED: -1,
      PHONE_AVAILABLE: -1,
      UNASSIGNED_PRIORITY: -1,
      ASSIGNED: -1,
      ACTIVE_PIPELINE: -1,
      STR_ELIGIBLE: -1,
      error: msg,
    };
  }
}

/**
 * Validate a raw metric value from the Dashboard API response.
 * Returns the validated number, or throws a descriptive error if invalid.
 *
 * Rules:
 * - Must exist (not undefined/null)
 * - Must be numeric
 * - Must be finite
 * - Must be >= 0
 *
 * A failed/missing metric MUST show DATA ERROR, not coerce to 0.
 */
export function validateMetricValue(
  value: unknown,
  metricId: string
): { value: number; error: null } | { value: null; error: string } {
  if (value === undefined || value === null) {
    return { value: null, error: `MISSING_METRIC_FIELD: ${metricId} is undefined/null in API response` };
  }
  const n = Number(value);
  if (!isFinite(n)) {
    return { value: null, error: `INVALID_METRIC_VALUE: ${metricId} = ${String(value)} is not finite` };
  }
  if (n < 0) {
    return { value: null, error: `INVALID_METRIC_VALUE: ${metricId} = ${n} is negative` };
  }
  return { value: n, error: null };
}

/**
 * Safely extract a metric from the RPC summary response.
 * Returns { value, error } — never coerces undefined to 0.
 *
 * If the RPC field is missing, returns an error string instead of 0.
 * The caller decides whether to show DATA ERROR or fall back.
 */
export function extractRpcMetric(
  summary: Record<string, unknown> | null,
  field: string,
  metricId: string
): { value: number; error: null } | { value: null; error: string } {
  if (!summary) {
    return { value: null, error: `MISSING_RPC_RESPONSE: get_dashboard_summary returned null for ${metricId}` };
  }
  const raw = summary[field];
  return validateMetricValue(raw, metricId);
}
