-- Migration: get_live_revenue_aggregate RPC
-- Purpose: Replace two parallel PostgREST queries with a single server-side
--          SQL aggregate. Called by /api/dashboard/live-revenue using the
--          service role key (bypasses RLS entirely).
--
-- LIVE REVENUE BUSINESS RULE (canonical TRAVLR definition):
--   deal_closed = true AND is_synthetic IS DISTINCT FROM true
--   Revenue priority: contract_monthly_revenue > deal_revenue > estimated_net_monthly
--
-- EXECUTION PLAN TARGET:
--   Index scan on idx_leads_deal_closed_revenue (partial index below)
--   → aggregate over a tiny subset (typically < 50 rows)
--   → ONE row returned
--   → < 20ms execution time
--
-- NO JOINS. NO ROW MULTIPLICATION. NO CLIENT-SIDE REDUCE.

-- ─── 1. Drop old function if it exists ───────────────────────────────────────
DROP FUNCTION IF EXISTS get_live_revenue_aggregate(text);

-- ─── 2. Create the aggregate function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_live_revenue_aggregate(p_state text DEFAULT NULL)
RETURNS TABLE(live_revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN contract_monthly_revenue IS NOT NULL AND contract_monthly_revenue > 0
          THEN contract_monthly_revenue
        WHEN deal_revenue IS NOT NULL AND deal_revenue > 0
          THEN deal_revenue
        ELSE COALESCE(estimated_net_monthly::numeric, 0)
      END
    ),
    0
  ) AS live_revenue
  FROM leads
  WHERE deal_closed = true
    AND is_synthetic IS DISTINCT FROM true
    AND (p_state IS NULL OR state = p_state);
$$;

-- Grant execute to authenticated users (called server-side with service role,
-- but grant is required for the function to be callable via RPC).
GRANT EXECUTE ON FUNCTION get_live_revenue_aggregate(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_live_revenue_aggregate(text) TO service_role;

-- ─── 3. Partial index for the live revenue filter ────────────────────────────
-- Only indexes the tiny subset of rows where deal_closed = true AND
-- is_synthetic IS DISTINCT FROM true. Covers the exact WHERE clause above.
-- Includes the three revenue columns so the aggregate is index-only.
CREATE INDEX IF NOT EXISTS idx_leads_live_revenue_v2
  ON leads (state, contract_monthly_revenue, deal_revenue, estimated_net_monthly)
  WHERE deal_closed = true
    AND is_synthetic IS DISTINCT FROM true;

-- ─── 4. Verify ───────────────────────────────────────────────────────────────
-- SELECT get_live_revenue_aggregate(NULL);
-- Expected: one row with a numeric value (0 if no won deals — legitimate).
