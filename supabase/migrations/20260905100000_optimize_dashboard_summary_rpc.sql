-- ============================================================
-- Migration: 20260905100000_optimize_dashboard_summary_rpc
-- Purpose: Replace multi-subquery get_dashboard_summary with
--          a single-scan conditional aggregation for performance.
--
-- Root cause: The previous version ran ~18 separate COUNT(DISTINCT id)
-- subqueries sequentially inside a single JSONB build, causing 15s+ timeouts
-- on the 9,000+ row leads table.
--
-- Fix: Single table scan with COUNT(DISTINCT CASE WHEN ... THEN id END)
-- computes all KPIs in one pass — dramatically faster.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
BEGIN
  -- Single-scan conditional aggregation: one pass over leads table
  -- computes all KPIs simultaneously instead of ~18 sequential subqueries.
  SELECT jsonb_build_object(
    'total_prospects',
    COUNT(DISTINCT CASE
      WHEN (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'active_leads',
    COUNT(DISTINCT CASE
      WHEN l.address IS NOT NULL AND l.address <> ''
        AND l.price > 0 AND l.beds > 0
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND l.prospect_score > 0
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'high_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'fully_verified',
    COUNT(DISTINCT CASE
      WHEN l.verified_owner IS TRUE
        AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
        AND l.verified_number IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'verified_owner',
    COUNT(DISTINCT CASE
      WHEN l.verified_owner IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'verified_number',
    COUNT(DISTINCT CASE
      WHEN l.verified_number IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'phone_available',
    COUNT(DISTINCT CASE
      WHEN l.contact_phone IS NOT NULL AND l.contact_phone <> ''
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'assigned_leads',
    COUNT(DISTINCT CASE
      WHEN l.primary_agent_id IS NOT NULL
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'unassigned_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND l.primary_agent_id IS NULL
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'action_needed',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage = 'New Lead'
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'active_pipeline',
    COUNT(DISTINCT CASE
      WHEN l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'new_leads_30d',
    COUNT(DISTINCT CASE
      WHEN l.stage = 'New Lead'
        AND l.created_at >= NOW() - INTERVAL '30 days'
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'avg_score',
    ROUND(AVG(CASE
      WHEN l.prospect_score > 0
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.prospect_score END)),

    'str_eligible',
    COUNT(DISTINCT CASE
      WHEN l.regulation_status IN ('Allowed', 'Restricted')
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'fully_allowed',
    COUNT(DISTINCT CASE
      WHEN l.regulation_status = 'Allowed'
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'regulation_friendly',
    COUNT(DISTINCT CASE
      WHEN l.regulation_status IN ('Allowed', 'Restricted')
        AND l.address IS NOT NULL AND l.address <> ''
        AND l.price > 0 AND l.beds > 0
        AND l.stage <> 'Not a Fit'
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'luxury_prospects',
    COUNT(DISTINCT CASE
      WHEN l.luxury IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'luxury_fully_verified',
    COUNT(DISTINCT CASE
      WHEN l.luxury IS TRUE
        AND l.verified_owner IS TRUE
        AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
        AND l.verified_number IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'luxury_verified_number',
    COUNT(DISTINCT CASE
      WHEN l.luxury IS TRUE
        AND l.verified_number IS TRUE
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'luxury_priority',
    COUNT(DISTINCT CASE
      WHEN l.luxury IS TRUE
        AND (l.priority_tier = 1 OR l.prospect_score >= 75)
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    'luxury_unassigned_priority',
    COUNT(DISTINCT CASE
      WHEN l.luxury IS TRUE
        AND (l.priority_tier = 1 OR l.prospect_score >= 75)
        AND l.primary_agent_id IS NULL
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND (NOT v_state_filter OR l.state = p_state)
      THEN l.id END),

    -- active_portfolios is a separate table — keep as subquery (fast, small table)
    'active_portfolios',
    (SELECT COUNT(DISTINCT pr.id)
     FROM public.portfolio_registry pr
     WHERE pr.is_active IS TRUE)

  ) INTO v_result
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE;

  RETURN v_result;
END;
$$;

-- Ensure a composite index exists to support the single-scan filter
-- (is_synthetic IS NOT TRUE is the primary filter for all KPIs)
CREATE INDEX IF NOT EXISTS idx_leads_dashboard_scan
  ON public.leads (is_synthetic, state, prospect_score, stage)
  WHERE is_synthetic IS NOT TRUE;
