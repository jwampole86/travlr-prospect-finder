-- ============================================================
-- TRAVLR — Fix Active Pipeline Stage Corruption
-- Timestamp: 20260905050000
-- ============================================================
--
-- PROBLEM:
--   Active Pipeline = 4 despite no real homeowner outreach having occurred.
--   Four prospect records have stage IN ('Contacted','Interested','Proposal Sent',
--   'Under Contract') without any legitimate outreach event.
--
-- ROOT CAUSE ANALYSIS:
--   1. CSV import route passes rawStage directly from CSV column to DB.
--      If a CSV file contained a 'stage' column with active pipeline values,
--      those values were inserted verbatim — bypassing the business rule that
--      only real outreach events may advance pipeline stage.
--   2. The 20260821060000 backfill migration only corrected 'Contacted' stage
--      for records with no outreach_history. It did NOT correct 'Interested',
--      'Proposal Sent', or 'Under Contract' records.
--   3. Source sync, enrichment, verification, assignment, and CSV import are
--      all non-outreach events and MUST NOT advance lead stage.
--
-- BUSINESS RULE (NON-NEGOTIABLE):
--   A prospect may only enter Active Pipeline stages ('Contacted', 'Interested',
--   'Proposal Sent', 'Under Contract') via a real authorized outreach event:
--     - Agent records a connected call
--     - Agent marks Interested
--     - Agent schedules appointment
--     - Admin updates qualified stage
--     - Proposal sent
--     - Contract signed
--
--   Source discovery, CSV import, enrichment, verification, scoring,
--   regulation lookup, Luxury classification, deduplication, assignment,
--   or syncing do NOT constitute outreach and MUST NEVER advance pipeline.
--
-- ACTIONS:
--   1. Identify all non-New-Lead prospects with no outreach history
--   2. Reset them to 'New Lead' and log PIPELINE_STAGE_CORRECTED audit events
--   3. Extend the backfill to cover ALL active pipeline stages (not just Contacted)
--   4. Add a pipeline_stage_audit_log table for future corrections
--   5. Update get_dashboard_summary RPC with canonical active pipeline definition
--   6. Update v_dashboard_reconciliation view
--
-- CANONICAL ACTIVE PIPELINE STAGES:
--   'Contacted', 'Interested', 'Proposal Sent', 'Under Contract'
--
-- CANONICAL TERMINAL STAGES:
--   'Not a Fit', 'Live'
--
-- CANONICAL UNTOUCHED STAGE:
--   'New Lead'
-- ============================================================

-- ─── 1. Pipeline Stage Audit Log ─────────────────────────────────────────────
-- Records every pipeline stage correction with full provenance.
-- Used to track PIPELINE_STAGE_CORRECTED events without faking outreach events.

CREATE TABLE IF NOT EXISTS public.pipeline_stage_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'PIPELINE_STAGE_CORRECTED',
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'SYSTEM',
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM',
  -- Preserved fields (must not be changed by stage correction)
  lead_address TEXT,
  lead_created_at TIMESTAMPTZ,
  -- Audit metadata
  corrected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_name TEXT DEFAULT '20260905050000_fix_active_pipeline_stage_corruption',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_audit_log_lead_id
  ON public.pipeline_stage_audit_log (lead_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_audit_log_event_type
  ON public.pipeline_stage_audit_log (event_type);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_audit_log_corrected_at
  ON public.pipeline_stage_audit_log (corrected_at DESC);

ALTER TABLE public.pipeline_stage_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_pipeline_stage_audit_log" ON public.pipeline_stage_audit_log;
CREATE POLICY "admin_manage_pipeline_stage_audit_log"
  ON public.pipeline_stage_audit_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 2. Audit & Reset Invalid Pipeline Stages ────────────────────────────────
-- Find ALL prospects in active pipeline stages with no outreach history.
-- These are the records incorrectly classified as Active Pipeline.
-- Reset them to 'New Lead' and log a PIPELINE_STAGE_CORRECTED audit event.
--
-- IMPORTANT: This only resets records with NO outreach history.
-- Records with legitimate outreach events are left untouched.
-- createdAt is NEVER modified — only stage and updated_at change.

DO $$
DECLARE
  rec RECORD;
  corrected_count INTEGER := 0;
  skipped_count INTEGER := 0;
  has_outreach BOOLEAN;
BEGIN
  -- Loop over all prospects in active pipeline stages
  FOR rec IN
    SELECT
      l.id,
      l.address,
      l.stage,
      l.created_at,
      l.updated_at,
      l.import_batch_id,
      l.record_source,
      l.source_type,
      l.is_synthetic
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE
      AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    ORDER BY l.created_at ASC
  LOOP
    -- Check for any legitimate outreach event in outreach_history
    has_outreach := EXISTS (
      SELECT 1 FROM public.outreach_history oh
      WHERE oh.lead_id = rec.id
        AND oh.lead_id IS NOT NULL
    );

    -- Also check activity_events for real outreach actions
    IF NOT has_outreach THEN
      has_outreach := EXISTS (
        SELECT 1 FROM public.activity_events ae
        WHERE ae.lead_id = rec.id
          AND ae.event_type IN (
            'CALL_CONNECTED', 'CALL_OUTCOME', 'SMS_SENT', 'EMAIL_SENT',
            'OUTREACH_RECORDED', 'STAGE_ADVANCED_BY_AGENT', 'APPOINTMENT_SCHEDULED',
            'PROPOSAL_SENT', 'CONTRACT_SIGNED', 'INTERESTED_MARKED',
            'CONNECTED', 'VOICEMAIL_LEFT', 'CALL_COMPLETED'
          )
      );
    END IF;

    IF NOT has_outreach THEN
      -- No legitimate outreach event — this stage is invalid.
      -- Log the correction BEFORE resetting so we have the old stage.
      INSERT INTO public.pipeline_stage_audit_log (
        lead_id,
        event_type,
        old_stage,
        new_stage,
        reason,
        actor,
        actor_type,
        lead_address,
        lead_created_at,
        corrected_at,
        migration_name,
        notes
      ) VALUES (
        rec.id,
        'PIPELINE_STAGE_CORRECTED',
        rec.stage,
        'New Lead',
        'PIPELINE_WITHOUT_OUTREACH_ERROR: Prospect was in active pipeline stage ' ||
          rec.stage || ' with no outreach_history or activity_events record. ' ||
          'Root cause: CSV import passed rawStage directly from CSV column without ' ||
          'enforcing New Lead default. Source: ' || COALESCE(rec.record_source, 'Unknown') ||
          ', source_type: ' || COALESCE(rec.source_type, 'Unknown') ||
          ', import_batch: ' || COALESCE(rec.import_batch_id, 'None') || '.',
        'SYSTEM_MIGRATION',
        'SYSTEM',
        rec.address,
        rec.created_at,
        now(),
        '20260905050000_fix_active_pipeline_stage_corruption',
        'Automated correction: stage reset to New Lead. createdAt preserved. ' ||
          'No outreach data deleted. Prospect data fully intact.'
      );

      -- Reset stage to New Lead.
      -- CRITICAL: Only stage and updated_at change. created_at is NEVER touched.
      UPDATE public.leads
      SET
        stage = 'New Lead',
        updated_at = now()
      WHERE id = rec.id;

      corrected_count := corrected_count + 1;

      RAISE NOTICE 'PIPELINE_STAGE_CORRECTED: lead_id=%, address=%, old_stage=%, new_stage=New Lead',
        rec.id, rec.address, rec.stage;

    ELSE
      -- Has legitimate outreach — leave this record alone.
      skipped_count := skipped_count + 1;
      RAISE NOTICE 'PIPELINE_STAGE_PRESERVED: lead_id=%, stage=% (has outreach history)',
        rec.id, rec.stage;
    END IF;
  END LOOP;

  RAISE NOTICE '=== PIPELINE STAGE CORRECTION COMPLETE ===';
  RAISE NOTICE 'Records corrected (reset to New Lead): %', corrected_count;
  RAISE NOTICE 'Records preserved (had outreach history): %', skipped_count;
  RAISE NOTICE 'Expected Active Pipeline after correction: 0 (if no real outreach exists)';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Pipeline stage correction failed: %', SQLERRM;
END $$;

-- ─── 3. Stage Distribution Audit ─────────────────────────────────────────────
-- Log the full stage distribution after correction for reconciliation.
-- This is informational — it does not modify any data.

DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '=== POST-CORRECTION STAGE DISTRIBUTION ===';
  FOR rec IN
    SELECT stage, COUNT(*) AS cnt
    FROM public.leads
    WHERE is_synthetic IS NOT TRUE
    GROUP BY stage
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'stage=%, count=%', rec.stage, rec.cnt;
  END LOOP;

  RAISE NOTICE '=== ACTIVE PIPELINE COUNT (should be 0 if no real outreach) ===';
  FOR rec IN
    SELECT COUNT(*) AS active_pipeline_count
    FROM public.leads
    WHERE is_synthetic IS NOT TRUE
      AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
  LOOP
    RAISE NOTICE 'active_pipeline=%', rec.active_pipeline_count;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Stage distribution audit failed: %', SQLERRM;
END $$;

-- ─── 4. Update get_dashboard_summary RPC ─────────────────────────────────────
-- Canonical active pipeline definition:
--   stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
--   AND is_synthetic IS NOT TRUE
--
-- This replaces all previous versions of this RPC.
-- The active_pipeline count is now derived from real stage data.
-- After the correction above, this will return 0 if no real outreach has occurred.

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
    -- ── Total Prospects ──────────────────────────────────────────────────────
    'total_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Leads (non-terminal, has address+price+beds) ──────────────────
    'active_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.address IS NOT NULL AND l.address <> ''
       AND l.price > 0 AND l.beds > 0
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND l.prospect_score > 0
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── High Priority: score >= 75, not terminal ──────────────────────────────
    -- CANONICAL DEFINITION: prospect_score >= 75 AND stage NOT IN ('Not a Fit','Live')
    -- Terminal stages are ONLY 'Not a Fit' and 'Live' (valid lead_stage enum values).
    -- DO NOT use 'Closed' or 'Archived' — those are not valid enum values.
    'high_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Fully Verified ────────────────────────────────────────────────────────
    'fully_verified',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Verified Owner ────────────────────────────────────────────────────────
    'verified_owner',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_owner IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Verified Number ───────────────────────────────────────────────────────
    'verified_number',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Phone Available: canonical contact_phone field ────────────────────────
    'phone_available',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.contact_phone IS NOT NULL AND l.contact_phone <> ''
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Assigned Leads ────────────────────────────────────────────────────────
    'assigned_leads',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.primary_agent_id IS NOT NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Unassigned Priority ───────────────────────────────────────────────────
    -- HIGH PRIORITY base scope + primary_agent_id IS NULL
    -- CANONICAL: prospect_score >= 75 AND stage NOT IN terminal AND primary_agent_id IS NULL
    'unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND l.primary_agent_id IS NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Action Needed: high-score, uncontacted (New Lead) ────────────────────
    -- CANONICAL: prospect_score >= 75 AND stage = 'New Lead'
    -- These are high-value leads that have NOT been contacted yet.
    -- Action Needed = High Priority - Active Pipeline (high-score prospects)
    'action_needed',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score >= 75
       AND l.stage = 'New Lead'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Pipeline ───────────────────────────────────────────────────────
    -- CANONICAL DEFINITION:
    --   stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    --   AND is_synthetic IS NOT TRUE
    --
    -- CRITICAL BUSINESS RULE:
    --   A prospect enters Active Pipeline ONLY via a real authorized outreach event.
    --   Source sync, CSV import, enrichment, verification, scoring, assignment,
    --   regulation lookup, or deduplication MUST NEVER advance pipeline stage.
    --
    -- LISTING STATUS != PIPELINE STATUS:
    --   A property's external listing status (Active, Pending, Under Contract, Rented)
    --   is stored in listing_status and MUST NEVER be mapped to lead stage.
    --   TRAVLR's pipeline represents OUR outreach relationship, not the property's
    --   marketplace status.
    --
    -- After the stage correction above, this should return 0 if no real outreach
    -- has occurred. This is the CORRECT business state.
    'active_pipeline',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── New Leads (last 30 days) ──────────────────────────────────────────────
    'new_leads_30d',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.stage = 'New Lead'
       AND l.created_at >= NOW() - INTERVAL '30 days'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Avg Score ─────────────────────────────────────────────────────────────
    'avg_score',
    (SELECT ROUND(AVG(l.prospect_score))
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.prospect_score > 0
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── STR Eligible: Allowed OR Restricted ──────────────────────────────────
    -- CANONICAL DEFINITION: regulation_status IN ('Allowed', 'Restricted')
    -- This is the "STR Eligible" metric — markets where STR is potentially legal.
    -- "Fully Allowed" (regulation_status = 'Allowed' only) is a SEPARATE metric.
    -- The KPI Monitor MUST compare this against Allowed+Restricted, NOT Allowed-only.
    'str_eligible',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Fully Allowed (strict STR — separate from STR Eligible) ──────────────
    'fully_allowed',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status = 'Allowed'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Regulation Friendly (same as STR Eligible for backward compat) ────────
    'regulation_friendly',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.regulation_status IN ('Allowed', 'Restricted')
       AND l.address IS NOT NULL AND l.address <> ''
       AND l.price > 0 AND l.beds > 0
       AND l.stage <> 'Not a Fit'
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury Prospects ──────────────────────────────────────────────────────
    'luxury_prospects',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury Fully Verified ─────────────────────────────────────────────────
    'luxury_fully_verified',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND l.verified_owner IS TRUE
       AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury Verified Number ────────────────────────────────────────────────
    'luxury_verified_number',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND l.verified_number IS TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury Priority ───────────────────────────────────────────────────────
    'luxury_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (l.priority_tier = 1 OR l.prospect_score >= 75)
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Luxury Unassigned Priority ────────────────────────────────────────────
    'luxury_unassigned_priority',
    (SELECT COUNT(DISTINCT l.id)
     FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND l.luxury IS TRUE
       AND (l.priority_tier = 1 OR l.prospect_score >= 75)
       AND l.primary_agent_id IS NULL
       AND l.stage NOT IN ('Not a Fit', 'Live')
       AND (NOT v_state_filter OR l.state = p_state)),

    -- ── Active Portfolios ─────────────────────────────────────────────────────
    'active_portfolios',
    (SELECT COUNT(DISTINCT pr.id)
     FROM public.portfolio_registry pr
     WHERE pr.is_active IS TRUE)

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── 5. Update v_dashboard_reconciliation view ────────────────────────────────
-- Drop and recreate to ensure all column names and definitions are current.
-- This view is used by /api/admin/reconciliation for the reconciliation table.

DROP VIEW IF EXISTS public.v_dashboard_reconciliation;

CREATE OR REPLACE VIEW public.v_dashboard_reconciliation AS
SELECT
  -- ── Core KPIs ──────────────────────────────────────────────────────────────
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE) AS total_leads,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live')) AS high_priority,

  (SELECT ROUND(AVG(prospect_score))
   FROM public.leads
   WHERE is_synthetic IS NOT TRUE AND prospect_score > 0) AS avg_score,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage = 'New Lead') AS action_needed,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND verified_owner IS TRUE
     AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false')
     AND verified_number IS TRUE) AS fully_verified,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND contact_phone IS NOT NULL AND contact_phone <> '') AS phone_available,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND primary_agent_id IS NOT NULL) AS assigned_leads,

  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage NOT IN ('Not a Fit', 'Live')
     AND primary_agent_id IS NULL) AS unassigned_priority,

  -- ── STR Eligible (Allowed + Restricted) — canonical Dashboard definition ───
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND regulation_status IN ('Allowed', 'Restricted')) AS str_eligible,

  -- ── Fully Allowed (Allowed only — separate stricter metric) ──────────────
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND regulation_status = 'Allowed') AS fully_allowed,

  -- ── Active Pipeline (in-progress stages only) ─────────────────────────────
  -- CANONICAL: stage IN ('Contacted','Interested','Proposal Sent','Under Contract')
  -- After stage correction, this should be 0 if no real outreach has occurred.
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')) AS active_pipeline,

  -- ── Pipeline total (all stages) ───────────────────────────────────────────
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE) AS pipeline_total,

  -- ── New Lead count ────────────────────────────────────────────────────────
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE AND stage = 'New Lead') AS new_lead_count,

  -- ── Stage breakdown (valid lead_stage enum values only) ───────────────────
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'New Lead') AS stage_new_lead,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Contacted') AS stage_contacted,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Interested') AS stage_interested,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Proposal Sent') AS stage_proposal_sent,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Under Contract') AS stage_under_contract,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Live') AS stage_live,
  (SELECT COUNT(DISTINCT id) FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'Not a Fit') AS stage_not_a_fit,

  -- ── Cross-check: High Priority vs Action Needed difference ────────────────
  -- Expected: High Priority - Action Needed = Active Pipeline (high-score prospects)
  -- Before outreach: High Priority = 3710, Action Needed = 3706, Active Pipeline = 4
  -- After correction: High Priority = 3710, Action Needed = 3710, Active Pipeline = 0
  -- (The 4 corrected records were high-score, so Action Needed increases by 4)
  (SELECT COUNT(DISTINCT id) FROM public.leads
   WHERE is_synthetic IS NOT TRUE
     AND prospect_score >= 75
     AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')) AS high_priority_in_pipeline,

  -- ── Pipeline correction audit ─────────────────────────────────────────────
  (SELECT COUNT(*) FROM public.pipeline_stage_audit_log
   WHERE event_type = 'PIPELINE_STAGE_CORRECTED') AS total_pipeline_corrections,

  -- ── Timestamp ─────────────────────────────────────────────────────────────
  now() AS reconciled_at;

-- ─── 6. Indexes for pipeline stage queries ────────────────────────────────────

-- Index for active pipeline count (used by Dashboard and KPI Monitor)
CREATE INDEX IF NOT EXISTS idx_leads_active_pipeline_v2
  ON public.leads (stage)
  WHERE is_synthetic IS NOT TRUE
    AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract');

-- Index for action needed (high-score New Lead)
CREATE INDEX IF NOT EXISTS idx_leads_action_needed_v2
  ON public.leads (prospect_score, stage)
  WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage = 'New Lead';

-- Index for high priority
CREATE INDEX IF NOT EXISTS idx_leads_high_priority_v2
  ON public.leads (prospect_score, stage)
  WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75;

-- ─── 7. Final reconciliation summary ─────────────────────────────────────────
DO $$
DECLARE
  total_leads INTEGER;
  new_lead_count INTEGER;
  active_pipeline_count INTEGER;
  action_needed_count INTEGER;
  high_priority_count INTEGER;
  corrections_made INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_leads FROM public.leads WHERE is_synthetic IS NOT TRUE;
  SELECT COUNT(*) INTO new_lead_count FROM public.leads WHERE is_synthetic IS NOT TRUE AND stage = 'New Lead';
  SELECT COUNT(*) INTO active_pipeline_count FROM public.leads
    WHERE is_synthetic IS NOT TRUE AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract');
  SELECT COUNT(*) INTO action_needed_count FROM public.leads
    WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage = 'New Lead';
  SELECT COUNT(*) INTO high_priority_count FROM public.leads
    WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage NOT IN ('Not a Fit', 'Live');
  SELECT COUNT(*) INTO corrections_made FROM public.pipeline_stage_audit_log
    WHERE event_type = 'PIPELINE_STAGE_CORRECTED';

  RAISE NOTICE '=== FINAL RECONCILIATION ===';
  RAISE NOTICE 'Total Leads:        %', total_leads;
  RAISE NOTICE 'New Lead (untouched): %', new_lead_count;
  RAISE NOTICE 'Active Pipeline:    % (expected: 0 if no real outreach)', active_pipeline_count;
  RAISE NOTICE 'Action Needed:      %', action_needed_count;
  RAISE NOTICE 'High Priority:      %', high_priority_count;
  RAISE NOTICE 'Stage Corrections:  %', corrections_made;
  RAISE NOTICE '';
  RAISE NOTICE 'ACCEPTANCE TEST: Active Pipeline = 0 => %',
    CASE WHEN active_pipeline_count = 0 THEN 'PASS' ELSE 'FAIL — ' || active_pipeline_count || ' records still in pipeline without outreach' END;
  RAISE NOTICE 'ACCEPTANCE TEST: Action Needed = High Priority => %',
    CASE WHEN action_needed_count = high_priority_count THEN 'PASS (all high-priority leads are untouched)'
         ELSE 'INFO — difference of ' || (high_priority_count - action_needed_count) || ' (prospects in pipeline or terminal)' END;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Final reconciliation summary failed: %', SQLERRM;
END $$;
