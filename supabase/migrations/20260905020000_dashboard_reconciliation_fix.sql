-- ============================================================
-- Dashboard Reconciliation Fix
-- Timestamp: 20260905020000
-- ============================================================
-- Fixes:
--   1. avg_score: computed over full prospect population (not a biased 100-row sample)
--   2. active_pipeline: explicit definition — stages that are in-progress
--   3. action_needed: high-score (≥75) uncontacted (New Lead) prospects
--   4. phone_available: aligned to contact_phone IS NOT NULL (same as paginated API)
--   5. str_eligible: regulation_status = 'Allowed' (strict, not Allowed+Restricted)
--   6. Source-sync protection: prevent overwriting manually-researched CSV phone/verification data
-- ============================================================

-- ─── 1. Replace get_dashboard_summary with reconciled version ────────────────
-- All KPIs now use the SAME population base (is_synthetic IS NOT TRUE)
-- and the SAME score field (prospect_score).
-- avg_score is computed over ALL real prospects (not a sample).
-- action_needed: score >= 75 AND stage = 'New Lead' (high-score, uncontacted).
-- active_pipeline: stages that are genuinely in-progress (not New, not terminal).
-- phone_available: contact_phone IS NOT NULL AND contact_phone <> '' (canonical phone field).
-- str_eligible: regulation_status = 'Allowed' only (strict STR-eligible).
-- fully_verified: verified_owner=true AND verified_address IS NOT NULL/'' AND verified_number=true.
-- unassigned_priority: score >= 75 AND primary_agent_id IS NULL AND not terminal.
-- Terminal stages (valid lead_stage enum values): 'Not a Fit', 'Live'
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
    -- COUNT(DISTINCT id) of all real (non-synthetic) leads.
    'total_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Average Score ────────────────────────────────────────────────────
    -- ROUND(AVG(prospect_score)) over ALL real prospects with a score > 0.
    -- Uses the SAME population as total_prospects (no sampling, no cap).
    -- This is the canonical avg score — must be consistent with high_priority.
    'avg_score',
    (SELECT COALESCE(ROUND(AVG(l.prospect_score))::INT, 0)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score > 0
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── High Priority ────────────────────────────────────────────────────
    -- Prospects with prospect_score >= 75 that are not in terminal stages.
    -- Terminal stages (valid enum values): Not a Fit, Live.
    -- Uses the SAME score field (prospect_score) as avg_score.
    'high_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Pipeline ──────────────────────────────────────────────────
    -- Prospects that are genuinely in-progress: past New Lead but not terminal.
    -- Definition: stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    -- Excludes: New Lead (not yet worked), Live (converted), Not a Fit (terminal).
    -- NOTE: If all leads are 'New Lead', this will correctly be 0.
    --       Pipeline by Stage shows ALL stages including New Lead.
    'active_pipeline',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Action Needed ────────────────────────────────────────────────────
    -- High-score prospects that have not yet been contacted.
    -- Definition: prospect_score >= 75 AND stage = 'New Lead'.
    -- These are the highest-value leads requiring immediate outreach.
    -- The Lead Management ?actionNeeded=true filter uses the SAME criteria.
    'action_needed',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage = 'New Lead'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Fully Verified ───────────────────────────────────────────────────
    -- verified_owner = true AND verified_address IS NOT NULL/'' AND verified_number = true.
    -- Does NOT derive from phone availability alone.
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
    -- Aligned with paginated API (which also checks contact_phone).
    -- Does NOT use has_phone (a derived/cached flag that may be stale).
    'phone_available',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.contact_phone IS NOT NULL AND l.contact_phone <> ''
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Assigned Leads ───────────────────────────────────────────────────
    -- Uses primary_agent_id (canonical assignment relationship, not agent_name text field).
    'assigned_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NOT NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Unassigned Priority ──────────────────────────────────────────────
    -- High-value (score >= 75) prospects with no agent assigned.
    -- Uses primary_agent_id (canonical), not agent_name text field.
    -- Excludes terminal stages (Not a Fit, Live).
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
    -- regulation_status = 'Allowed' ONLY (strict STR-eligible).
    -- NOT Allowed+Restricted — Restricted means conditional/limited STR.
    -- This is the canonical STR Eligible count shown on the dashboard.
    'str_eligible',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status = 'Allowed'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Regulation Friendly (Allowed + Restricted) ───────────────────────
    -- Kept for backward compatibility. Includes both Allowed and Restricted.
    'regulation_friendly',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND l.address IS NOT NULL AND l.address <> ''
       AND l.price > 0 AND l.beds > 0
       AND l.stage <> 'Not a Fit'
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

-- ─── 2. Source-sync protection function ──────────────────────────────────────
-- Prevents source syncs from overwriting manually-researched CSV phone/verification data.
-- Called before any sync upsert to preserve CSV-imported contact data.
CREATE OR REPLACE FUNCTION public.protect_csv_contact_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If the existing row has ingestion_source = 'CSV_IMPORT' or 'MANUAL_CSV',
  -- preserve contact_phone, verified_owner, verified_number, verified_address
  -- when a sync (non-CSV) tries to overwrite them with NULL or empty values.
  IF OLD.ingestion_source IN ('CSV_IMPORT', 'MANUAL_CSV', 'MANUAL_VERIFIED_IMPORT') THEN
    -- Protect contact_phone: never overwrite a real phone with NULL/empty from sync
    IF (NEW.contact_phone IS NULL OR NEW.contact_phone = '')
       AND (OLD.contact_phone IS NOT NULL AND OLD.contact_phone <> '') THEN
      NEW.contact_phone := OLD.contact_phone;
    END IF;

    -- Protect verified_owner: never downgrade from true to false/null from sync
    IF (NEW.verified_owner IS NOT TRUE) AND (OLD.verified_owner IS TRUE) THEN
      NEW.verified_owner := OLD.verified_owner;
    END IF;

    -- Protect verified_number: never downgrade from true to false/null from sync
    IF (NEW.verified_number IS NOT TRUE) AND (OLD.verified_number IS TRUE) THEN
      NEW.verified_number := OLD.verified_number;
    END IF;

    -- Protect verified_address: never overwrite a real address with NULL/empty from sync
    IF (NEW.verified_address IS NULL OR NEW.verified_address = '' OR NEW.verified_address = 'false')
       AND (OLD.verified_address IS NOT NULL AND OLD.verified_address <> '' AND OLD.verified_address <> 'false') THEN
      NEW.verified_address := OLD.verified_address;
    END IF;

    -- Protect has_phone flag
    IF (NEW.has_phone IS NOT TRUE) AND (OLD.has_phone IS TRUE) THEN
      NEW.has_phone := OLD.has_phone;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Install the trigger on leads table
DROP TRIGGER IF EXISTS trg_protect_csv_contact_data ON public.leads;
CREATE TRIGGER trg_protect_csv_contact_data
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_csv_contact_data();

-- ─── 3. Reconciliation view ───────────────────────────────────────────────────
-- A live view that returns all reconciliation metrics directly from the DB.
-- Used by /api/admin/reconciliation to produce the reconciliation table.
-- NOTE: lead_stage enum valid values: 'New Lead', 'Contacted', 'Interested',
--       'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'
--       Terminal stages = 'Not a Fit' (disqualified) and 'Live' (converted/closed-won).
CREATE OR REPLACE VIEW public.v_dashboard_reconciliation AS
SELECT
  -- Total Leads
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE) AS total_leads,

  -- High Priority (score >= 75, not terminal)
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
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND primary_agent_id IS NULL
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live')) AS unassigned_priority,

  -- Assigned (has primary_agent_id)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND primary_agent_id IS NOT NULL) AS assigned_leads,

  -- STR Eligible (regulation_status = 'Allowed' only)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND regulation_status = 'Allowed') AS str_eligible,

  -- Active Pipeline (in-progress stages only)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')) AS active_pipeline,

  -- Pipeline by Stage breakdown (all stages)
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

  NOW() AS computed_at;

-- Grant SELECT on the reconciliation view to authenticated users
GRANT SELECT ON public.v_dashboard_reconciliation TO authenticated;

-- ─── 4. Performance index for avg_score computation ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score_real
ON public.leads (prospect_score)
WHERE is_synthetic IS NOT TRUE AND prospect_score > 0;

CREATE INDEX IF NOT EXISTS idx_leads_action_needed
ON public.leads (prospect_score, stage)
WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage = 'New Lead';

CREATE INDEX IF NOT EXISTS idx_leads_active_pipeline
ON public.leads (stage)
WHERE is_synthetic IS NOT TRUE AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract');
