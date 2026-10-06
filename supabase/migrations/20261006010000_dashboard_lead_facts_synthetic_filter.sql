-- ============================================================
-- Migration: 20261006010000_dashboard_lead_facts_synthetic_filter
--
-- PURPOSE:
--   Fix the KPI Monitor "6 critical divergences" (Total Leads, High
--   Priority, Avg Score, Action Needed, Unassigned Priority, STR-Eligible
--   all showed Dashboard > DB Count).
--
-- ROOT CAUSE:
--   Migration 20260922110000_dashboard_lead_facts.sql introduced the
--   denormalized public.dashboard_lead_facts table (synced from
--   public.leads via an AFTER INSERT/UPDATE trigger) to speed up
--   get_dashboard_summary / get_canonical_avg_score / get_stage_breakdown /
--   get_regulation_breakdown. That table has NO is_synthetic column and
--   the sync trigger copies EVERY lead row, including is_synthetic=true
--   placeholder leads. All four RPCs read from dashboard_lead_facts with
--   no synthetic filter, so every Dashboard metric now includes the 3,138
--   synthetic leads that get_canonical_kpi_counts() (which queries
--   public.leads directly with "is_synthetic IS NOT TRUE") correctly
--   excludes. Verified live: leads total=166,909, is_synthetic=true
--   count=3,138, 166909-3138=163,771 (exactly the reported "DB Count").
--
-- FIX:
--   1. Add dashboard_lead_facts.is_synthetic, synced by the trigger and
--      backfilled from public.leads.
--   2. Add "AND NOT f.is_synthetic" to every RPC that reads from
--      dashboard_lead_facts.
-- ============================================================

-- ─── 1. Add is_synthetic column + backfill ───────────────────────────────────
ALTER TABLE public.dashboard_lead_facts
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false;

UPDATE public.dashboard_lead_facts f
SET is_synthetic = COALESCE(l.is_synthetic, false)
FROM public.leads l
WHERE f.lead_id = l.id
  AND f.is_synthetic IS DISTINCT FROM COALESCE(l.is_synthetic, false);

CREATE INDEX IF NOT EXISTS dashboard_lead_facts_is_synthetic_idx
  ON public.dashboard_lead_facts(is_synthetic);

-- ─── 2. Sync trigger: carry is_synthetic through ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_dashboard_lead_fact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dashboard_lead_facts (
    lead_id, state, stage, regulation_status, prospect_score,
    has_address, has_price, has_beds, verified_owner, verified_address,
    verified_number, phone_available, assigned, luxury, priority_tier,
    created_at_text, is_synthetic
  ) VALUES (
    NEW.id, NEW.state, coalesce(NEW.stage::TEXT, 'New Lead'), coalesce(NEW.regulation_status::TEXT, 'Unknown'), coalesce(NEW.prospect_score, 0),
    coalesce(NEW.address, '') <> '', coalesce(NEW.price, 0) > 0, coalesce(NEW.beds, 0) > 0,
    NEW.verified_owner IS TRUE, coalesce(NEW.verified_address, '') NOT IN ('', 'false'), NEW.verified_number IS TRUE,
    coalesce(NEW.contact_phone, '') <> '', NEW.primary_agent_id IS NOT NULL, NEW.luxury IS TRUE, coalesce(NEW.priority_tier, 3),
    NEW.created_at, coalesce(NEW.is_synthetic, false)
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    state = EXCLUDED.state, stage = EXCLUDED.stage, regulation_status = EXCLUDED.regulation_status,
    prospect_score = EXCLUDED.prospect_score, has_address = EXCLUDED.has_address,
    has_price = EXCLUDED.has_price, has_beds = EXCLUDED.has_beds,
    verified_owner = EXCLUDED.verified_owner, verified_address = EXCLUDED.verified_address,
    verified_number = EXCLUDED.verified_number, phone_available = EXCLUDED.phone_available,
    assigned = EXCLUDED.assigned, luxury = EXCLUDED.luxury,
    priority_tier = EXCLUDED.priority_tier, created_at_text = EXCLUDED.created_at_text,
    is_synthetic = EXCLUDED.is_synthetic;
  RETURN NEW;
END;
$$;

-- ─── 3. RPCs: exclude synthetic leads (restores pre-20260922110000 behavior) ──
CREATE OR REPLACE FUNCTION public.get_stage_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(stage TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT f.stage, count(*)::BIGINT FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR f.state = p_state)
  GROUP BY f.stage;
$$;

CREATE OR REPLACE FUNCTION public.get_regulation_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(regulation_status TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT f.regulation_status, count(*)::BIGINT FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR f.state = p_state)
  GROUP BY f.regulation_status;
$$;

CREATE OR REPLACE FUNCTION public.get_canonical_avg_score(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'avg_score', coalesce(round(avg(f.prospect_score) FILTER (WHERE f.prospect_score > 0)), 0),
    'scored_count', count(*) FILTER (WHERE f.prospect_score > 0),
    'total_count', count(*)
  ) FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state);
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_prospects', count(*),
    'active_leads', count(*) FILTER (WHERE f.has_address AND f.has_price AND f.has_beds AND f.stage NOT IN ('Not a Fit', 'Live') AND f.prospect_score > 0),
    'high_priority', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage NOT IN ('Not a Fit', 'Live')),
    'fully_verified', count(*) FILTER (WHERE f.verified_owner AND f.verified_address AND f.verified_number),
    'verified_owner', count(*) FILTER (WHERE f.verified_owner),
    'verified_number', count(*) FILTER (WHERE f.verified_number),
    'phone_available', count(*) FILTER (WHERE f.phone_available),
    'assigned_leads', count(*) FILTER (WHERE f.assigned),
    'unassigned_priority', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage NOT IN ('Not a Fit', 'Live') AND NOT f.assigned),
    'action_needed', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage = 'New Lead'),
    'active_pipeline', count(*) FILTER (WHERE f.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')),
    'new_leads_30d', count(*) FILTER (WHERE f.stage = 'New Lead' AND f.created_at_text >= (now() - interval '30 days')::TEXT),
    'avg_score', coalesce(round(avg(f.prospect_score) FILTER (WHERE f.prospect_score > 0)), 0),
    'str_eligible', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted')),
    'fully_allowed', count(*) FILTER (WHERE f.regulation_status = 'Allowed'),
    'regulation_friendly', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted') AND f.has_address AND f.has_price AND f.has_beds AND f.stage <> 'Not a Fit'),
    'luxury_prospects', count(*) FILTER (WHERE f.luxury),
    'luxury_fully_verified', count(*) FILTER (WHERE f.luxury AND f.verified_owner AND f.verified_address AND f.verified_number),
    'luxury_verified_number', count(*) FILTER (WHERE f.luxury AND f.verified_number),
    'luxury_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND f.stage NOT IN ('Not a Fit', 'Live')),
    'luxury_unassigned_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND NOT f.assigned AND f.stage NOT IN ('Not a Fit', 'Live')),
    'active_portfolios', (SELECT count(DISTINCT pr.id) FROM public.portfolio_registry pr WHERE pr.is_active IS TRUE)
  ) FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state);
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_regulation_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canonical_avg_score(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(TEXT) TO anon, authenticated;
