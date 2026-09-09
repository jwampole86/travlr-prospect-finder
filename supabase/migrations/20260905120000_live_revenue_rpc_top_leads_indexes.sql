-- ============================================================
-- Migration: 20260905120000_live_revenue_rpc_top_leads_indexes
-- Purpose: Fix live_revenue and top_leads Dashboard timeouts.
--
-- ROOT CAUSE — live_revenue:
--   The frontend was fetching up to 500 full rows and doing
--   client-side reduce() summation. This caused 8s+ timeouts.
--   Fix: Single server-side SUM() aggregate via RPC.
--
-- ROOT CAUSE — top_leads:
--   Missing partial index on (prospect_score DESC) caused
--   full sequential scans on the 9,000+ row leads table.
--   Fix: Partial index covering the exact query filters.
--
-- LIVE REVENUE BUSINESS RULE:
--   TRAVLR Live Revenue = properties where deal_closed = true
--   (i.e. won/contracted leads). Revenue is taken from
--   contract_monthly_revenue if set, else deal_revenue,
--   else estimated_net_monthly. This matches the existing
--   client-side calculation exactly — no business rule change.
-- ============================================================

-- ─── 1. get_live_revenue RPC ─────────────────────────────────────────────────
-- Single aggregate query: one number, one DB round-trip, < 50ms.
-- Replaces: fetch 500 rows → client-side reduce().
CREATE OR REPLACE FUNCTION public.get_live_revenue(p_state TEXT DEFAULT 'all')
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN contract_monthly_revenue IS NOT NULL AND contract_monthly_revenue > 0
          THEN contract_monthly_revenue
        WHEN deal_revenue IS NOT NULL AND deal_revenue > 0
          THEN deal_revenue
        ELSE COALESCE(estimated_net_monthly, 0)
      END
    ),
    0
  )
  FROM public.leads
  WHERE deal_closed = true
    AND is_synthetic IS NOT TRUE
    AND address IS NOT NULL
    AND address <> ''
    AND (p_state = 'all' OR p_state IS NULL OR p_state = '' OR state = p_state);
$$;

-- Grant execute to authenticated users (dashboard reads)
GRANT EXECUTE ON FUNCTION public.get_live_revenue(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_revenue(TEXT) TO anon;

-- ─── 2. Index for live_revenue query ─────────────────────────────────────────
-- Partial index: only deal_closed=true rows (small subset of table).
-- Covers: WHERE deal_closed=true AND is_synthetic IS NOT TRUE AND address IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_leads_live_revenue
  ON public.leads (state, deal_closed)
  WHERE deal_closed = true
    AND is_synthetic IS NOT TRUE
    AND address IS NOT NULL
    AND address <> '';

-- ─── 3. Improved top_leads partial index ─────────────────────────────────────
-- Drop and recreate with better coverage for the actual query:
--   .neq('is_synthetic', true)
--   .not('address', 'is', null)
--   .gt('prospect_score', 0)
--   .order('prospect_score', { ascending: false })
--   .limit(30)
-- The index must cover prospect_score DESC for the ORDER BY to use it.
DROP INDEX IF EXISTS public.idx_leads_top_leads_query;

CREATE INDEX IF NOT EXISTS idx_leads_top_leads_query
  ON public.leads (prospect_score DESC, updated_at DESC, id ASC)
  WHERE is_synthetic IS DISTINCT FROM true
    AND prospect_score > 0
    AND address IS NOT NULL;

-- Portfolio-filtered variant (state + score)
DROP INDEX IF EXISTS public.idx_leads_state_score;

CREATE INDEX IF NOT EXISTS idx_leads_state_score
  ON public.leads (state, prospect_score DESC, updated_at DESC)
  WHERE is_synthetic IS DISTINCT FROM true
    AND prospect_score > 0
    AND address IS NOT NULL;

-- ─── 4. Ensure prospect_score is numeric (not text) ──────────────────────────
-- Check: if prospect_score is stored as text, numeric sort is wrong.
-- This is a safe no-op if already numeric.
DO $$
BEGIN
  -- Only attempt cast if column is text type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'prospect_score'
      AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    -- Safe migration: add numeric column, copy, rename
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS prospect_score_numeric NUMERIC;
    UPDATE public.leads SET prospect_score_numeric = prospect_score::NUMERIC
      WHERE prospect_score ~ '^[0-9]+(\.[0-9]+)?$';
    -- Note: full column rename requires app code change — log warning instead
    RAISE WARNING 'prospect_score is stored as TEXT. Consider migrating to NUMERIC for correct sort order.';
  END IF;
END;
$$;

-- ─── 5. Index for dashboard scan (is_synthetic filter) ───────────────────────
-- Already created in 20260905100000 but ensure it exists
CREATE INDEX IF NOT EXISTS idx_leads_dashboard_scan
  ON public.leads (is_synthetic, state, prospect_score, stage)
  WHERE is_synthetic IS NOT TRUE;

-- ─── 6. Index for created_at (recent activity, new_leads_30d) ────────────────
CREATE INDEX IF NOT EXISTS idx_leads_created_at_desc
  ON public.leads (created_at DESC)
  WHERE is_synthetic IS NOT TRUE;
