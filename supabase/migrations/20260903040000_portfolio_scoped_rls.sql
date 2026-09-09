-- Migration: Portfolio-scoped RLS for Lead Management, Agent Routing, and Enrichment tables
-- Team members only see data for their assigned portfolios.
-- Portfolio assignment is stored in agent_portfolio_assignments (portfolio_key = state code).

-- ─── 1. Helper function: get current user's assigned portfolio state codes ───
CREATE OR REPLACE FUNCTION public.get_my_portfolio_states()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT portfolio_key
      FROM public.agent_portfolio_assignments
      WHERE agent_user_id = auth.uid()
    ),
    ARRAY[]::TEXT[]
  )
$$;

-- ─── 2. Helper function: check if user is admin ───────────────────────────────
-- Reuses existing get_my_role() which already handles admin detection safely.

-- ─── 3. Helper function: portfolio-scoped lead access ────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_lead_portfolio(lead_state TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- Admins see everything
    public.get_my_role() = 'admin'
    OR
    -- No portfolio assignments = see all (ops/unscoped users)
    NOT EXISTS (
      SELECT 1 FROM public.agent_portfolio_assignments
      WHERE agent_user_id = auth.uid()
    )
    OR
    -- Lead state matches one of the user's assigned portfolios
    lead_state = ANY(public.get_my_portfolio_states())
$$;

-- ─── 4. Helper function: portfolio-scoped enrichment access ──────────────────
CREATE OR REPLACE FUNCTION public.can_access_enrichment_for_lead(p_lead_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    public.get_my_role() = 'admin'
    OR
    NOT EXISTS (
      SELECT 1 FROM public.agent_portfolio_assignments
      WHERE agent_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = p_lead_id
        AND l.state = ANY(public.get_my_portfolio_states())
    )
$$;

-- ─── 5. Ensure agent_portfolio_assignments has needed columns ─────────────────
ALTER TABLE public.agent_portfolio_assignments
  ADD COLUMN IF NOT EXISTS portfolio_key text;

CREATE INDEX IF NOT EXISTS idx_agent_portfolio_assignments_user
  ON public.agent_portfolio_assignments (agent_user_id);

-- ─── 6. LEADS — portfolio-scoped SELECT policy ───────────────────────────────
-- Replaces the broad "authenticated_read_all_leads" with portfolio-scoped access.
-- Admins and unscoped users still see all leads.

DROP POLICY IF EXISTS "portfolio_scoped_read_leads" ON public.leads;
CREATE POLICY "portfolio_scoped_read_leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.can_access_lead_portfolio(state));

-- Keep existing write policies intact (they already check admin/owner).

-- ─── 7. LEAD_ASSIGNMENTS — portfolio-scoped access ───────────────────────────
DROP POLICY IF EXISTS "portfolio_scoped_lead_assignments" ON public.lead_assignments;
CREATE POLICY "portfolio_scoped_lead_assignments"
ON public.lead_assignments
FOR SELECT
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR agent_user_id = auth.uid()
  OR public.can_access_enrichment_for_lead(lead_id::text)
);

-- ─── 8. AGENT_ROUTING_METRICS — portfolio-scoped access ──────────────────────
ALTER TABLE public.agent_routing_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_scoped_agent_routing_metrics" ON public.agent_routing_metrics;
CREATE POLICY "portfolio_scoped_agent_routing_metrics"
ON public.agent_routing_metrics
FOR ALL
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR agent_id = auth.uid()::text
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
)
WITH CHECK (
  public.get_my_role() = 'admin'
  OR agent_id = auth.uid()::text
);

-- ─── 9. LEAD_ENRICHMENTS — portfolio-scoped access ───────────────────────────
ALTER TABLE public.lead_enrichments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_scoped_lead_enrichments" ON public.lead_enrichments;
CREATE POLICY "portfolio_scoped_lead_enrichments"
ON public.lead_enrichments
FOR SELECT
TO authenticated
USING (public.can_access_enrichment_for_lead(lead_id::text));

DROP POLICY IF EXISTS "portfolio_scoped_lead_enrichments_write" ON public.lead_enrichments;
CREATE POLICY "portfolio_scoped_lead_enrichments_write"
ON public.lead_enrichments
FOR ALL
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR public.can_access_enrichment_for_lead(lead_id::text)
)
WITH CHECK (
  public.get_my_role() = 'admin'
  OR public.can_access_enrichment_for_lead(lead_id::text)
);

-- ─── 10. ENRICHMENT_VALIDATION_CACHE — portfolio-scoped access ───────────────
DROP POLICY IF EXISTS "portfolio_scoped_enrichment_cache" ON public.enrichment_validation_cache;
CREATE POLICY "portfolio_scoped_enrichment_cache"
ON public.enrichment_validation_cache
FOR ALL
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR public.can_access_enrichment_for_lead(lead_id::text)
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
)
WITH CHECK (
  public.get_my_role() = 'admin'
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
);

-- ─── 11. ENRICHMENT_VALIDATION_EVENTS — portfolio-scoped access ──────────────
DROP POLICY IF EXISTS "portfolio_scoped_enrichment_events" ON public.enrichment_validation_events;
CREATE POLICY "portfolio_scoped_enrichment_events"
ON public.enrichment_validation_events
FOR ALL
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR public.can_access_enrichment_for_lead(lead_id::text)
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
)
WITH CHECK (
  public.get_my_role() = 'admin'
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
);

-- ─── 12. LEAD_HANDOFF_HISTORY — portfolio-scoped access ──────────────────────
DROP POLICY IF EXISTS "portfolio_scoped_lead_handoff" ON public.lead_handoff_history;
CREATE POLICY "portfolio_scoped_lead_handoff"
ON public.lead_handoff_history
FOR SELECT
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR from_agent_id = auth.uid()
  OR to_agent_id = auth.uid()
  OR NOT EXISTS (
    SELECT 1 FROM public.agent_portfolio_assignments
    WHERE agent_user_id = auth.uid()
  )
);

-- ─── 13. Index for portfolio-scoped lead queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_state_score_portfolio
  ON public.leads (state, prospect_score DESC)
  WHERE archived_at IS NULL;
