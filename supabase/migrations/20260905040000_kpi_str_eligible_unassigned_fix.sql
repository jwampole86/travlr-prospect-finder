-- ============================================================
-- KPI Monitor Divergence Fix
-- Timestamp: 20260905040000
-- ============================================================
-- Fixes:
--   1. get_dashboard_summary: str_eligible now uses Allowed+Restricted
--      (matching the Dashboard card "Allowed or restricted" label).
--      Previously used Allowed-only, causing a false KPI Monitor divergence.
--   2. Adds fully_allowed (Allowed only) as a separate metric for reference.
--   3. Unassigned Priority: explicitly built from High Priority base scope
--      (score >= 75, not terminal, primary_agent_id IS NULL).
--   4. High Priority: uses only valid terminal stages (Not a Fit, Live).
--      Removed invalid 'Closed' and 'Archived' enum values from all filters.
--
-- CANONICAL DEFINITIONS (must match src/lib/kpiDefinitions.ts):
--   HIGH_PRIORITY:        prospect_score >= 75 AND stage NOT IN ('Not a Fit','Live')
--   UNASSIGNED_PRIORITY:  HIGH_PRIORITY base + primary_agent_id IS NULL
--   STR_ELIGIBLE:         regulation_status IN ('Allowed','Restricted')
--   FULLY_ALLOWED:        regulation_status = 'Allowed' (separate metric, not STR Eligible)
--   ACTIVE_PIPELINE:      stage IN ('Contacted','Interested','Proposal Sent','Under Contract')
--   ACTION_NEEDED:        prospect_score >= 75 AND stage = 'New Lead'
--   FULLY_VERIFIED:       verified_owner=true AND verified_address NOT NULL/'' AND verified_number=true
--   PHONE_AVAILABLE:      contact_phone IS NOT NULL AND contact_phone <> ''
--   ASSIGNED:             primary_agent_id IS NOT NULL
--   AVG_SCORE:            ROUND(AVG(prospect_score)) WHERE score > 0
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
  SELECT jsonb_build_object(

    -- ── Total Prospects ──────────────────────────────────────────────────
    'total_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Average Score ────────────────────────────────────────────────────
    -- ROUND(AVG(prospect_score)) over ALL real prospects with score > 0.
    -- Same population as total_prospects. No sampling.
    'avg_score',
    (SELECT COALESCE(ROUND(AVG(l.prospect_score))::INT, 0)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score > 0
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── High Priority ────────────────────────────────────────────────────
    -- prospect_score >= 75, not in terminal stages.
    -- Terminal stages (valid lead_stage enum): 'Not a Fit', 'Live'
    -- DO NOT use 'Closed' or 'Archived' — not valid enum values.
    'high_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Pipeline ──────────────────────────────────────────────────
    -- In-progress stages only. Excludes New Lead (not yet worked) and terminal.
    'active_pipeline',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Action Needed ────────────────────────────────────────────────────
    -- High-score prospects not yet contacted (New Lead stage).
    -- Same score threshold as High Priority.
    'action_needed',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage = 'New Lead'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Fully Verified ───────────────────────────────────────────────────
    -- verified_owner=true AND verified_address NOT NULL/'' AND verified_number=true
    'fully_verified',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Verified Owner ───────────────────────────────────────────────────
    'verified_owner',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Verified Number ──────────────────────────────────────────────────
    'verified_number',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Phone Available ──────────────────────────────────────────────────
    -- Canonical phone field: contact_phone IS NOT NULL AND NOT empty.
    -- Does NOT use has_phone (a derived/cached flag that may be stale).
    'phone_available',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.contact_phone IS NOT NULL AND l.contact_phone <> ''
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Assigned Leads ───────────────────────────────────────────────────
    -- Uses primary_agent_id (canonical assignment field, NOT agent_name text).
    'assigned_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NOT NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Unassigned Priority ──────────────────────────────────────────────
    -- Built from High Priority base scope + primary_agent_id IS NULL.
    -- SAME score threshold and terminal stage exclusion as high_priority.
    -- Uses primary_agent_id (canonical), NOT agent_name text field.
    'unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NULL
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── New Leads (30d) ──────────────────────────────────────────────────
    'new_leads_30d',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.created_at >= NOW() - INTERVAL '30 days'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── STR Eligible ─────────────────────────────────────────────────────
    -- CANONICAL DEFINITION: regulation_status IN ('Allowed', 'Restricted')
    -- = markets where STR operation is potentially legal.
    -- This matches the Dashboard card labeled "Allowed or restricted".
    -- The KPI Monitor MUST compare against this same definition.
    --
    -- NOTE: "Fully Allowed" (regulation_status = 'Allowed' only) is a SEPARATE
    -- metric returned as 'fully_allowed' below. Do NOT compare STR Eligible
    -- against Fully Allowed — they are different metrics.
    'str_eligible',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Fully Allowed (Allowed only — separate from STR Eligible) ────────
    -- regulation_status = 'Allowed' only (unrestricted markets).
    -- This is NOT the same as STR Eligible (which includes Restricted).
    -- Kept for reference; not used as the primary STR Eligible metric.
    'fully_allowed',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status = 'Allowed'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Regulation Friendly (Allowed + Restricted) ───────────────────────
    -- Alias for str_eligible — kept for backward compatibility with existing
    -- Dashboard code that reads summary.regulation_friendly.
    'regulation_friendly',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury KPIs ──────────────────────────────────────────────────────
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

    'luxury_verified_owner',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND l.verified_owner IS TRUE
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
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    'luxury_unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (l.priority_tier = 1 OR l.prospect_score >= 75)
       AND l.primary_agent_id IS NULL
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Portfolios ─────────────────────────────────────────────────
    'active_portfolios',
    (SELECT COUNT(DISTINCT pr.id)
     FROM public.portfolio_registry pr
     WHERE pr.is_active IS TRUE
       AND (NOT v_state_filter OR pr.state_code = p_state))

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Update reconciliation view ───────────────────────────────────────────────
-- Aligns str_eligible with Allowed+Restricted (matching Dashboard card).
-- Adds fully_allowed (Allowed only) as a separate column.
DROP VIEW IF EXISTS public.v_dashboard_reconciliation;
CREATE OR REPLACE VIEW public.v_dashboard_reconciliation AS
SELECT
  -- Total Leads
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE) AS total_leads,

  -- High Priority (score >= 75, not terminal)
  -- Terminal stages: 'Not a Fit', 'Live' (valid enum values only)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live')) AS high_priority,

  -- Average Score (full population, score > 0)
  (SELECT COALESCE(ROUND(AVG(prospect_score))::INT, 0) FROM public.leads
   WHERE is_synthetic IS NOT TRUE AND prospect_score > 0) AS avg_score,

  -- Action Needed (score >= 75, New Lead stage)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage = 'New Lead') AS action_needed,

  -- Fully Verified (owner + address + number)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND verified_owner IS TRUE
     AND verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false'
     AND verified_number IS TRUE) AS fully_verified,

  -- Phone Available (canonical contact_phone field)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND contact_phone IS NOT NULL AND contact_phone <> '') AS phone_available,

  -- Unassigned Priority (score >= 75, no agent, not terminal)
  -- Built from same High Priority base scope + primary_agent_id IS NULL
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND primary_agent_id IS NULL
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live')) AS unassigned_priority,

  -- Assigned (has primary_agent_id)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND primary_agent_id IS NOT NULL) AS assigned_leads,

  -- STR Eligible (Allowed + Restricted — matches Dashboard card "Allowed or restricted")
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND regulation_status IN ('Allowed', 'Restricted')) AS str_eligible,

  -- Fully Allowed (Allowed only — separate metric, NOT the same as STR Eligible)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND regulation_status = 'Allowed') AS fully_allowed,

  -- Active Pipeline (in-progress stages only)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')) AS active_pipeline,

  -- Pipeline total (all stages)
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE) AS pipeline_total,

  -- Regulation Status breakdown
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND regulation_status = 'Allowed') AS reg_allowed,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND regulation_status = 'Restricted') AS reg_restricted,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND regulation_status = 'Prohibited') AS reg_prohibited,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND (regulation_status IS NULL OR regulation_status = 'Unknown')) AS reg_unknown,

  -- Stage breakdown (valid lead_stage enum values only)
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'New Lead') AS stage_new_lead,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Contacted') AS stage_contacted,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Interested') AS stage_interested,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Proposal Sent') AS stage_proposal_sent,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Under Contract') AS stage_under_contract,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Live') AS stage_live,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Not a Fit') AS stage_not_a_fit,

  -- Cross-check: High Priority vs Action Needed difference
  -- Expected: High Priority - Action Needed = Active Pipeline prospects that are high-score
  -- (i.e. prospects that advanced from New Lead into pipeline stages)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live'))
  -
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage = 'New Lead') AS high_priority_minus_action_needed,

  NOW() AS computed_at;

-- Grant SELECT on the reconciliation view to authenticated users
GRANT SELECT ON public.v_dashboard_reconciliation TO authenticated;
