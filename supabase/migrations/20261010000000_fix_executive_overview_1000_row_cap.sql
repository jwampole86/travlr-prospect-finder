-- ============================================================
-- Migration: 20261010000000_fix_executive_overview_1000_row_cap
--
-- PURPOSE:
--   Executive Overview page showed "1,000 Total Leads" instead of the real
--   ~164,000 total.
--
-- ROOT CAUSE:
--   src/app/executive-overview/page.tsx fetched the ENTIRE leads table
--   client-side via a plain `supabase.from('leads').select('state, stage')`
--   with no count/range handling, then counted rows in JS
--   (`leadsData.length`) and grouped them per-state in JS for the
--   "Portfolio Health" breakdown. PostgREST caps any unbounded .select()
--   at 1000 rows by default (Supabase's db-max-rows setting) — so both
--   the "Total Leads" KPI and the per-portfolio breakdown were silently
--   truncated to whatever the first 1000 rows happened to contain.
--
-- FIX:
--   Add get_portfolio_state_breakdown() — a SECURITY DEFINER RPC that
--   aggregates per-state total/active counts server-side from the already
--   fast, already-synced public.dashboard_lead_facts table (same table
--   get_dashboard_summary/get_stage_breakdown/get_regulation_breakdown
--   already use). Returns one row per state (tiny result set), never
--   subject to the row cap. The page's overall "Total Leads" KPI now
--   calls the existing, already-correct get_dashboard_summary('all')
--   RPC instead of counting raw rows client-side.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_portfolio_state_breakdown()
RETURNS TABLE(state TEXT, total_leads BIGINT, active_leads BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    f.state,
    count(*)::BIGINT AS total_leads,
    count(*) FILTER (
      WHERE f.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
    )::BIGINT AS active_leads
  FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND f.state IS NOT NULL
  GROUP BY f.state;
$$;

GRANT EXECUTE ON FUNCTION public.get_portfolio_state_breakdown() TO anon, authenticated;

COMMENT ON FUNCTION public.get_portfolio_state_breakdown() IS
  'Per-state total/active lead counts for the Executive Overview "Portfolio Health" '
  'breakdown. Aggregates server-side from dashboard_lead_facts so results are never '
  'subject to PostgREST''s 1000-row default cap, unlike the old client-side '
  '.select(''state, stage'') + JS .length/.filter approach it replaces.';
