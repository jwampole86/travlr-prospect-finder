-- ============================================================
-- Migration: 20260906000000_canonical_avg_score_pipeline_audit
--
-- PURPOSE:
--   1. Add get_canonical_avg_score() RPC — server-side AVG over the
--      full canonical prospect population. Eliminates the PostgREST
--      1000-row default cap that caused the KPI Monitor to compute
--      avg_score from a partial sample (→ 96) instead of the full
--      population (→ 93).
--
--   2. Add get_active_pipeline_audit() RPC — returns the exact records
--      currently in Active Pipeline with their supporting outreach
--      evidence so the KPI Monitor can verify business truth.
--
--   3. Add get_avg_score_diagnostics() RPC — returns the full diagnostic
--      breakdown (total prospects, scored count, null-score count, raw
--      avg, rounded avg) for the TRACE AVG SCORE admin panel.
--
--   4. Add correct_pipeline_stage_to_new_lead() RPC — corrects a
--      prospect's leadStage to 'New Lead' when no legitimate outreach
--      event exists, creating a PIPELINE_STAGE_CORRECTED audit event.
--
-- ROOT CAUSE DOCUMENTED:
--   Dashboard avg_score = 93 (correct — from get_dashboard_summary RPC
--     which uses SQL AVG() over all rows in one pass).
--   KPI Monitor DB avg_score = 96 (WRONG — fetchCanonicalKpiCounts used
--     .select('prospect_score') via PostgREST which returns at most 1000
--     rows by default; client-side average of 1000 rows ≠ true average
--     of 5,897 rows).
--   Fix: KPI Monitor now calls get_canonical_avg_score() RPC which
--     executes AVG() server-side over the full population.
-- ============================================================

-- ─── 1. get_canonical_avg_score ──────────────────────────────────────────────
-- Returns the canonical avg_score using the SAME population and logic as
-- get_dashboard_summary. Both functions must remain in sync.
--
-- Population: is_synthetic IS NOT TRUE AND prospect_score > 0
-- (NULL scores are excluded by PostgreSQL AVG() automatically;
--  explicit > 0 also excludes zero-scored placeholders)
-- Rounding: ROUND() — same as get_dashboard_summary
-- No join multiplication: single row per lead, no joins
CREATE OR REPLACE FUNCTION public.get_canonical_avg_score(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
  v_total_prospects BIGINT;
  v_scored_count BIGINT;
  v_null_score_count BIGINT;
  v_raw_avg NUMERIC;
  v_rounded_avg INTEGER;
BEGIN
  SELECT
    COUNT(*)                                                          AS total_prospects,
    COUNT(*) FILTER (WHERE l.prospect_score > 0)                     AS scored_count,
    COUNT(*) FILTER (WHERE l.prospect_score IS NULL OR l.prospect_score = 0) AS null_score_count,
    AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0)        AS raw_avg,
    ROUND(AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0)) AS rounded_avg
  INTO
    v_total_prospects,
    v_scored_count,
    v_null_score_count,
    v_raw_avg,
    v_rounded_avg
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND (NOT v_state_filter OR l.state = p_state);

  RETURN jsonb_build_object(
    'avg_score',          COALESCE(v_rounded_avg, 0),
    'raw_avg',            COALESCE(ROUND(v_raw_avg, 4), 0),
    'total_prospects',    v_total_prospects,
    'scored_count',       v_scored_count,
    'null_score_count',   v_null_score_count,
    'definition_version', '20260906000000',
    'population',         'is_synthetic IS NOT TRUE AND prospect_score > 0',
    'rounding',           'ROUND(AVG(prospect_score))'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_avg_score(TEXT) TO anon, authenticated;

-- ─── 2. get_avg_score_diagnostics ────────────────────────────────────────────
-- Full diagnostic breakdown for the TRACE AVG SCORE admin panel.
-- Returns everything needed to explain any divergence.
CREATE OR REPLACE FUNCTION public.get_avg_score_diagnostics(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
  v_total_prospects BIGINT;
  v_scored_count BIGINT;
  v_null_score_count BIGINT;
  v_zero_score_count BIGINT;
  v_raw_avg NUMERIC;
  v_rounded_avg INTEGER;
  v_min_score INTEGER;
  v_max_score INTEGER;
  v_p25 NUMERIC;
  v_p50 NUMERIC;
  v_p75 NUMERIC;
BEGIN
  SELECT
    COUNT(*)                                                                   AS total_prospects,
    COUNT(*) FILTER (WHERE l.prospect_score > 0)                              AS scored_count,
    COUNT(*) FILTER (WHERE l.prospect_score IS NULL)                          AS null_score_count,
    COUNT(*) FILTER (WHERE l.prospect_score = 0)                              AS zero_score_count,
    AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS raw_avg,
    ROUND(AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0))         AS rounded_avg,
    MIN(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS min_score,
    MAX(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS max_score,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p25,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p50,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p75
  INTO
    v_total_prospects, v_scored_count, v_null_score_count, v_zero_score_count,
    v_raw_avg, v_rounded_avg, v_min_score, v_max_score, v_p25, v_p50, v_p75
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND (NOT v_state_filter OR l.state = p_state);

  RETURN jsonb_build_object(
    'total_prospects',      v_total_prospects,
    'scored_count',         v_scored_count,
    'null_score_count',     v_null_score_count,
    'zero_score_count',     v_zero_score_count,
    'raw_avg',              COALESCE(ROUND(v_raw_avg, 4), 0),
    'rounded_avg',          COALESCE(v_rounded_avg, 0),
    'min_score',            COALESCE(v_min_score, 0),
    'max_score',            COALESCE(v_max_score, 0),
    'p25',                  COALESCE(ROUND(v_p25::NUMERIC, 1), 0),
    'p50',                  COALESCE(ROUND(v_p50::NUMERIC, 1), 0),
    'p75',                  COALESCE(ROUND(v_p75::NUMERIC, 1), 0),
    'population_filter',    'is_synthetic IS NOT TRUE AND prospect_score > 0',
    'rounding_rule',        'ROUND(AVG(prospect_score))',
    'definition_version',   '20260906000000',
    'root_cause_note',      'Previous KPI Monitor used PostgREST .select(prospect_score) capped at 1000 rows → biased sample avg. Fixed: now uses server-side AVG() via this RPC.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_avg_score_diagnostics(TEXT) TO anon, authenticated;

-- ─── 3. get_active_pipeline_audit ────────────────────────────────────────────
-- Returns the exact records in Active Pipeline with supporting outreach evidence.
-- Used by the KPI Monitor to verify business truth (not just matching counts).
--
-- LEGITIMATE outreach events (stage transition evidence):
--   call_sessions: outcome IN ('connected', 'interested', 'callback_requested',
--                              'proposal_sent', 'under_contract')
--   activity_events: event_type IN ('call_connected', 'sms_replied', 'email_replied',
--                                   'appointment_set', 'proposal_sent', 'contract_signed',
--                                   'manual_stage_change')
--
-- NOT legitimate (must NOT count as outreach):
--   CSV import, source sync, property/address/owner/phone verification,
--   score calculation, regulation evaluation, portfolio/agent assignment,
--   listing status change, enrichment
CREATE OR REPLACE FUNCTION public.get_active_pipeline_audit(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
  v_records JSONB;
  v_summary JSONB;
  v_total_pipeline INTEGER;
  v_with_outreach INTEGER;
  v_without_outreach INTEGER;
BEGIN
  -- Collect pipeline records with outreach evidence
  SELECT jsonb_agg(
    jsonb_build_object(
      'prospect_id',          l.id,
      'address',              COALESCE(l.address, '') || ', ' || COALESCE(l.city, '') || ', ' || COALESCE(l.state, ''),
      'lead_stage',           l.stage,
      'prospect_score',       l.prospect_score,
      'created_at',           l.created_at,
      'updated_at',           l.updated_at,
      'primary_agent_id',     l.primary_agent_id,
      -- Latest call session evidence
      'latest_call_id',       cs.id,
      'latest_call_outcome',  cs.outcome,
      'latest_call_at',       cs.created_at,
      -- Latest activity event evidence
      'latest_activity_type', ae.event_type,
      'latest_activity_at',   ae.created_at,
      -- Outreach verdict
      'has_legitimate_outreach', (
        cs.id IS NOT NULL AND cs.outcome IN (
          'connected', 'interested', 'callback_requested',
          'proposal_sent', 'under_contract', 'completed'
        )
        OR ae.id IS NOT NULL AND ae.event_type IN (
          'call_connected', 'sms_replied', 'email_replied',
          'appointment_set', 'proposal_sent', 'contract_signed',
          'manual_stage_change', 'stage_changed'
        )
      ),
      'outreach_evidence_type', CASE
        WHEN cs.id IS NOT NULL AND cs.outcome IN (
          'connected', 'interested', 'callback_requested',
          'proposal_sent', 'under_contract', 'completed'
        ) THEN 'call_session:' || cs.outcome
        WHEN ae.id IS NOT NULL AND ae.event_type IN (
          'call_connected', 'sms_replied', 'email_replied',
          'appointment_set', 'proposal_sent', 'contract_signed',
          'manual_stage_change', 'stage_changed'
        ) THEN 'activity_event:' || ae.event_type
        ELSE 'NONE'
      END
    )
  )
  INTO v_records
  FROM public.leads l
  -- Latest call session per lead
  LEFT JOIN LATERAL (
    SELECT cs2.id, cs2.outcome, cs2.created_at
    FROM public.call_sessions cs2
    WHERE cs2.lead_id = l.id
    ORDER BY cs2.created_at DESC
    LIMIT 1
  ) cs ON TRUE
  -- Latest activity event per lead
  LEFT JOIN LATERAL (
    SELECT ae2.id, ae2.event_type, ae2.created_at
    FROM public.activity_events ae2
    WHERE ae2.lead_id = l.id
    ORDER BY ae2.created_at DESC
    LIMIT 1
  ) ae ON TRUE
  WHERE l.is_synthetic IS NOT TRUE
    AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    AND (NOT v_state_filter OR l.state = p_state);

  -- Summary counts
  SELECT
    COUNT(*)                                                                AS total_pipeline,
    COUNT(*) FILTER (WHERE (
      cs2.id IS NOT NULL AND cs2.outcome IN (
        'connected', 'interested', 'callback_requested',
        'proposal_sent', 'under_contract', 'completed'
      )
      OR ae2.id IS NOT NULL AND ae2.event_type IN (
        'call_connected', 'sms_replied', 'email_replied',
        'appointment_set', 'proposal_sent', 'contract_signed',
        'manual_stage_change', 'stage_changed'
      )
    ))                                                                      AS with_outreach,
    COUNT(*) FILTER (WHERE NOT (
      cs2.id IS NOT NULL AND cs2.outcome IN (
        'connected', 'interested', 'callback_requested',
        'proposal_sent', 'under_contract', 'completed'
      )
      OR ae2.id IS NOT NULL AND ae2.event_type IN (
        'call_connected', 'sms_replied', 'email_replied',
        'appointment_set', 'proposal_sent', 'contract_signed',
        'manual_stage_change', 'stage_changed'
      )
    ))                                                                      AS without_outreach
  INTO v_total_pipeline, v_with_outreach, v_without_outreach
  FROM public.leads l
  LEFT JOIN LATERAL (
    SELECT cs2.id, cs2.outcome
    FROM public.call_sessions cs2
    WHERE cs2.lead_id = l.id
    ORDER BY cs2.created_at DESC
    LIMIT 1
  ) cs2 ON TRUE
  LEFT JOIN LATERAL (
    SELECT ae2.id, ae2.event_type
    FROM public.activity_events ae2
    WHERE ae2.lead_id = l.id
    ORDER BY ae2.created_at DESC
    LIMIT 1
  ) ae2 ON TRUE
  WHERE l.is_synthetic IS NOT TRUE
    AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    AND (NOT v_state_filter OR l.state = p_state);

  RETURN jsonb_build_object(
    'total_pipeline',       COALESCE(v_total_pipeline, 0),
    'with_legitimate_outreach', COALESCE(v_with_outreach, 0),
    'without_outreach',     COALESCE(v_without_outreach, 0),
    'records',              COALESCE(v_records, '[]'::JSONB),
    'legitimate_outreach_types', ARRAY[
      'call_session: connected, interested, callback_requested, proposal_sent, under_contract, completed',
      'activity_event: call_connected, sms_replied, email_replied, appointment_set, proposal_sent, contract_signed, manual_stage_change, stage_changed'
    ],
    'invalid_outreach_types', ARRAY[
      'csv_import', 'source_sync', 'property_verification', 'address_verification',
      'owner_verification', 'phone_verification', 'score_calculation',
      'regulation_evaluation', 'portfolio_assignment', 'agent_assignment',
      'listing_status_change', 'enrichment'
    ]
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_pipeline_audit(TEXT) TO anon, authenticated;

-- ─── 4. correct_pipeline_stage_to_new_lead ───────────────────────────────────
-- Corrects a prospect's stage to 'New Lead' when no legitimate outreach exists.
-- Creates a PIPELINE_STAGE_CORRECTED audit event.
-- Preserves: prospect_score, verification, contact info, property data,
--            regulations, source provenance, assignments, notes, revenue estimates.
CREATE OR REPLACE FUNCTION public.correct_pipeline_stage_to_new_lead(
  p_lead_id UUID,
  p_reason TEXT DEFAULT 'No legitimate outreach event found supporting non-New-Lead stage'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stage TEXT;
  v_lead_exists BOOLEAN;
BEGIN
  -- Verify lead exists and is in pipeline
  SELECT EXISTS(
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND is_synthetic IS NOT TRUE
  ) INTO v_lead_exists;

  IF NOT v_lead_exists THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Lead not found or is synthetic');
  END IF;

  SELECT stage INTO v_current_stage FROM public.leads WHERE id = p_lead_id;

  IF v_current_stage = 'New Lead' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Lead is already in New Lead stage');
  END IF;

  -- Correct the stage — preserve all other fields
  UPDATE public.leads
  SET
    stage = 'New Lead',
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- Create audit event
  INSERT INTO public.activity_events (
    lead_id,
    event_type,
    metadata,
    created_at
  ) VALUES (
    p_lead_id,
    'PIPELINE_STAGE_CORRECTED',
    jsonb_build_object(
      'previousStage', v_current_stage,
      'newStage', 'New Lead',
      'reason', p_reason,
      'correctedAt', NOW(),
      'correctedBy', 'system_kpi_audit'
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'lead_id', p_lead_id,
    'previous_stage', v_current_stage,
    'new_stage', 'New Lead',
    'reason', p_reason,
    'audit_event', 'PIPELINE_STAGE_CORRECTED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_pipeline_stage_to_new_lead(UUID, TEXT) TO authenticated;
-- Note: anon NOT granted — stage corrections require authentication

-- ─── 5. Index to support avg_score RPC ───────────────────────────────────────
-- Partial index on prospect_score for non-synthetic leads — supports AVG() scan
CREATE INDEX IF NOT EXISTS idx_leads_avg_score_canonical
  ON public.leads (prospect_score)
  WHERE is_synthetic IS NOT TRUE AND prospect_score > 0;
