-- Migration: live_revenue_fallback_rpc + getUser auth fix
-- Purpose: Add a fallback RPC for live revenue that works even if the primary
--          get_live_revenue_aggregate is unavailable. Also documents the
--          getUser() vs getSession() auth fix.
--
-- ROOT CAUSE ANALYSIS:
--   The primary timeout cause was getSession() in SSR context making a
--   network round-trip to Supabase Auth to re-validate the session.
--   This adds 200-4000ms of latency per request.
--   Fix: Use getUser() which validates the JWT from the cookie locally.
--
-- FALLBACK RPC:
--   Identical logic to get_live_revenue_aggregate but with a different name.
--   Used when the primary RPC is unavailable.

-- ─── 1. Fallback RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_live_revenue_fallback(p_state text DEFAULT NULL)
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

GRANT EXECUTE ON FUNCTION get_live_revenue_fallback(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_live_revenue_fallback(text) TO service_role;
GRANT EXECUTE ON FUNCTION get_live_revenue_fallback(text) TO anon;

-- Also ensure primary RPC has anon grant (needed for anon-key client calls)
GRANT EXECUTE ON FUNCTION get_live_revenue_aggregate(text) TO anon;

-- ─── 2. Ensure partial index exists ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_live_revenue_v2
  ON leads (state, contract_monthly_revenue, deal_revenue, estimated_net_monthly)
  WHERE deal_closed = true
    AND is_synthetic IS DISTINCT FROM true;

-- ─── 3. Verify ───────────────────────────────────────────────────────────────
-- SELECT get_live_revenue_fallback(NULL);
-- Expected: one row with a numeric value (0 if no won deals — legitimate).
