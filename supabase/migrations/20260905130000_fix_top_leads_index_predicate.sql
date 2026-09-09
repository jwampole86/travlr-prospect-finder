-- ============================================================
-- Migration: 20260905130000_fix_top_leads_index_predicate
-- Purpose: Fix the index predicate mismatch that caused top_leads
--          to never use the partial index → full sequential scan → timeout.
--
-- ROOT CAUSE:
--   The Supabase JS client generates .neq('is_synthetic', true) as:
--     WHERE is_synthetic != true
--   This EXCLUDES NULL rows (real leads with is_synthetic = NULL).
--
--   The partial index was built with:
--     WHERE is_synthetic IS DISTINCT FROM true
--   This INCLUDES NULL rows.
--
--   PostgreSQL will NOT use a partial index unless the query predicate
--   EXACTLY matches (or is implied by) the index predicate.
--   Result: full sequential scan on 9,000+ rows → 10s+ timeout.
--
-- FIX:
--   1. Create a server-side RPC (exec_sql_top_leads) that uses the
--      EXACT predicate: IS DISTINCT FROM true
--      This is called by /api/dashboard/top-leads route.
--
--   2. Recreate the partial index with a predicate that also covers
--      is_synthetic = false (not just NULL), so both the RPC and
--      any direct queries benefit from the index.
--
--   3. Add a partial index for live_revenue that covers only
--      deal_closed = true rows (tiny subset → instant aggregate).
--
-- PERFORMANCE TARGETS:
--   top_leads: < 50ms SQL, < 200ms API
--   live_revenue: < 20ms SQL, < 100ms API
-- ============================================================

-- ─── 1. Drop old indexes that had wrong predicates ────────────────────────────
DROP INDEX IF EXISTS public.idx_leads_top_leads_query;
DROP INDEX IF EXISTS public.idx_leads_state_score;
DROP INDEX IF EXISTS public.idx_leads_live_revenue;

-- ─── 2. Recreate top_leads index with correct predicate ──────────────────────
-- Covers: WHERE is_synthetic IS DISTINCT FROM true (includes NULL + false)
-- ORDER BY prospect_score DESC, id ASC
-- This is the EXACT predicate used by exec_sql_top_leads RPC below.
CREATE INDEX IF NOT EXISTS idx_leads_top_leads_v2
  ON public.leads (prospect_score DESC, id ASC)
  WHERE (is_synthetic IS DISTINCT FROM true)
    AND prospect_score > 0
    AND address IS NOT NULL
    AND address <> '';

-- Portfolio-filtered variant (state + score)
CREATE INDEX IF NOT EXISTS idx_leads_state_score_v2
  ON public.leads (state, prospect_score DESC, id ASC)
  WHERE (is_synthetic IS DISTINCT FROM true)
    AND prospect_score > 0
    AND address IS NOT NULL
    AND address <> '';

-- ─── 3. live_revenue index — only deal_closed=true rows ──────────────────────
-- This is a tiny subset of the table → aggregate is instant.
CREATE INDEX IF NOT EXISTS idx_leads_live_revenue_v2
  ON public.leads (state, deal_closed)
  WHERE deal_closed = true
    AND (is_synthetic IS DISTINCT FROM true);

-- ─── 4. exec_sql_top_leads RPC ───────────────────────────────────────────────
-- Called by /api/dashboard/top-leads route (service role key).
-- Uses IS DISTINCT FROM true to match idx_leads_top_leads_v2 exactly.
-- Returns only the 17 columns the Dashboard card needs.
-- No joins, no activity, no regulations, no teleprompter data.
-- Reads existing prospect_score — no recalculation.
CREATE OR REPLACE FUNCTION public.exec_sql_top_leads(
  p_state TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  beds INT,
  baths INT,
  price INT,
  stage TEXT,
  regulation_status TEXT,
  prospect_score INT,
  estimated_net_monthly INT,
  listing_url TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  source TEXT,
  created_at TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.id,
    l.address,
    l.city,
    l.state,
    l.zip,
    l.beds,
    l.baths,
    l.price,
    l.stage,
    l.regulation_status,
    l.prospect_score,
    l.estimated_net_monthly,
    l.listing_url,
    l.contact_name,
    l.contact_phone,
    l.source,
    l.created_at
  FROM public.leads l
  WHERE l.is_synthetic IS DISTINCT FROM true
    AND l.prospect_score > 0
    AND l.address IS NOT NULL
    AND l.address <> ''
    AND l.stage NOT IN ('Not a Fit')
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
  ORDER BY l.prospect_score DESC, l.id ASC
  LIMIT LEAST(p_limit, 30);
$$;

-- Grant to authenticated and service role
GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO anon;

-- ─── 5. get_live_revenue — recreate with correct predicate ───────────────────
-- Uses IS DISTINCT FROM true to match idx_leads_live_revenue_v2.
-- Returns ONE number. No joins. No row fetching.
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
    AND (is_synthetic IS DISTINCT FROM true)
    AND address IS NOT NULL
    AND address <> ''
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR state = p_state);
$$;

GRANT EXECUTE ON FUNCTION public.get_live_revenue(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_revenue(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_live_revenue(TEXT) TO anon;

-- ─── 6. ANALYZE to update planner statistics ─────────────────────────────────
ANALYZE public.leads;
