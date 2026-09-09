-- ============================================================
-- Dashboard Live Data + Regulation Rules RLS Fix
-- Timestamp: 20260904950000
-- ============================================================
-- 1. Ensure regulation_rules has a SELECT policy for authenticated users
-- 2. Add get_dashboard_summary RPC for optimized single-call KPI fetch
-- 3. Add index on regulation_rules for fast portfolio-scoped queries
-- ============================================================

-- ─── 1. Regulation Rules RLS ─────────────────────────────────────────────────
-- Allow authenticated users to read regulation rules (read-only, no write)
ALTER TABLE public.regulation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_regulation_rules" ON public.regulation_rules;
CREATE POLICY "authenticated_read_regulation_rules"
ON public.regulation_rules
FOR SELECT
TO authenticated
USING (true);

-- ─── 2. Index for regulation_rules portfolio-scoped queries ──────────────────
CREATE INDEX IF NOT EXISTS idx_regulation_rules_state_active
ON public.regulation_rules (state, is_active);

CREATE INDEX IF NOT EXISTS idx_regulation_rules_active_display
ON public.regulation_rules (is_active, display_order);

-- ─── 3. Dashboard Summary RPC ────────────────────────────────────────────────
-- Returns all core KPI counts in a single optimized query.
-- Uses COUNT(DISTINCT id) to prevent double-counting.
-- Accepts optional p_state filter ('all' = no filter).
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
  SELECT jsonb_build_object(
    'total_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'active_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.address IS NOT NULL AND l.address <> ''
       AND l.price > 0 AND l.beds > 0
       AND l.stage NOT IN ('Not a Fit', 'Live', 'Closed', 'Archived')
       AND l.prospect_score > 0
       AND (NOT v_state_filter OR l.state = p_state)),

    'high_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Closed', 'Archived')
       AND (NOT v_state_filter OR l.state = p_state)),

    'fully_verified',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'verified_owner',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'verified_number',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'phone_available',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.contact_phone IS NOT NULL AND l.contact_phone <> ''
       AND (NOT v_state_filter OR l.state = p_state)),

    'assigned_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NOT NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    'unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NULL
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Closed', 'Archived')
       AND (NOT v_state_filter OR l.state = p_state)),

    'new_leads_30d',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.created_at >= NOW() - INTERVAL '30 days'
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_fully_verified',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND l.verified_owner IS TRUE
       AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_verified_number',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (l.priority_tier = 1 OR l.prospect_score >= 75)
       AND l.stage NOT IN ('Not a Fit', 'Closed', 'Archived')
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (l.priority_tier = 1 OR l.prospect_score >= 75)
       AND l.primary_agent_id IS NULL
       AND l.stage NOT IN ('Not a Fit', 'Closed', 'Archived')
       AND (NOT v_state_filter OR l.state = p_state)),

    'regulation_friendly',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND l.address IS NOT NULL AND l.address <> ''
       AND l.price > 0 AND l.beds > 0
       AND l.stage <> 'Not a Fit'
       AND (NOT v_state_filter OR l.state = p_state)),

    'active_portfolios',
    (SELECT COUNT(DISTINCT pr.id)
     FROM public.portfolio_registry pr
     WHERE pr.is_active IS TRUE
       AND (NOT v_state_filter OR pr.state_code = p_state))

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── 4. Activity events index for fast dashboard feed queries ─────────────────
CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp_desc
ON public.activity_events (event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_state_timestamp
ON public.activity_events (lead_state, event_timestamp DESC);

-- ─── 5. Ensure leads indexes for dashboard KPI queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_luxury_verified
ON public.leads (luxury, verified_owner, verified_number)
WHERE is_synthetic IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_leads_luxury_priority_unassigned
ON public.leads (luxury, priority_tier, primary_agent_id)
WHERE is_synthetic IS NOT TRUE AND luxury IS TRUE;

CREATE INDEX IF NOT EXISTS idx_leads_created_at_state
ON public.leads (created_at DESC, state)
WHERE is_synthetic IS NOT TRUE;
