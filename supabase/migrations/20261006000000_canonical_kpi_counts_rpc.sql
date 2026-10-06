-- ============================================================
-- Migration: 20261006000000_canonical_kpi_counts_rpc
--
-- PURPOSE:
--   Fix false-positive "CRIT" divergences in the KPI Monitor
--   (Total Leads, High Priority, Action Needed, Unassigned Priority,
--   STR-Eligible, Avg Score all showed Dashboard > DB Count).
--
-- ROOT CAUSE:
--   The Dashboard's displayed values come from get_dashboard_summary(),
--   a SECURITY DEFINER function that bypasses Row Level Security and
--   scans the FULL leads table.
--
--   The KPI Monitor's "DB Count" column (fetchCanonicalKpiCounts in
--   kpiDefinitions.ts) ran plain supabase-js .select(..., {count:'exact'})
--   queries through PostgREST using the caller's session. Those queries
--   ARE subject to the portfolio-scoped RLS policy
--   "portfolio_scoped_read_leads" (20260903040000_portfolio_scoped_rls.sql),
--   which restricts non-admin/portfolio-scoped sessions to a subset of
--   leads.state values. Any session that isn't recognized as unrestricted
--   admin therefore undercounts every metric relative to the Dashboard —
--   producing a divergence that is a permissions artifact, not a real
--   data/business-logic bug.
--
--   The Avg Score "DB" value had the same issue PLUS it used a
--   .limit(1000) client-side sample instead of the full population.
--
-- FIX:
--   Add get_canonical_kpi_counts() — a SECURITY DEFINER RPC that
--   independently recomputes the same metrics as get_dashboard_summary
--   directly from public.leads, bypassing RLS exactly like the Dashboard
--   RPC does. This keeps the KPI Monitor a genuine independent check
--   (it is not merely calling get_dashboard_summary) while removing the
--   RLS-caused false divergence. kpiDefinitions.ts is updated to call
--   this RPC (and get_canonical_avg_score) instead of raw PostgREST counts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_canonical_kpi_counts(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_leads',
    COUNT(DISTINCT CASE
      WHEN (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'high_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'action_needed',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage = 'New Lead'
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'fully_verified',
    COUNT(DISTINCT CASE
      WHEN l.verified_owner IS TRUE
        AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
        AND l.verified_number IS TRUE
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'phone_available',
    COUNT(DISTINCT CASE
      WHEN l.contact_phone IS NOT NULL AND l.contact_phone <> ''
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'unassigned_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND l.primary_agent_id IS NULL
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'assigned',
    COUNT(DISTINCT CASE
      WHEN l.primary_agent_id IS NOT NULL
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'active_pipeline',
    COUNT(DISTINCT CASE
      WHEN l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'str_eligible',
    COUNT(DISTINCT CASE
      WHEN l.regulation_status IN ('Allowed', 'Restricted')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END)
  )
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_kpi_counts(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_canonical_kpi_counts(TEXT) IS
  'Independent SECURITY DEFINER re-computation of KPI Monitor "DB Count" metrics. '
  'Bypasses RLS (like get_dashboard_summary) so portfolio-scoped sessions do not '
  'show a false divergence against the Dashboard''s unrestricted totals.';
