-- RPC functions for dashboard aggregate counts
-- These replace client-side row fetches that were capped at 1000 rows

-- Stage breakdown aggregate: returns count per stage for real leads
CREATE OR REPLACE FUNCTION public.get_stage_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(stage TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(l.stage::TEXT, 'Unknown') AS stage,
    COUNT(*)::BIGINT AS cnt
  FROM public.leads l
  WHERE l.is_synthetic = false
    AND (p_state IS NULL OR p_state = 'all' OR l.state = p_state)
  GROUP BY l.stage;
$$;

-- Regulation breakdown aggregate: returns count per regulation_status for real leads
CREATE OR REPLACE FUNCTION public.get_regulation_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(regulation_status TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(l.regulation_status::TEXT, 'Unknown') AS regulation_status,
    COUNT(*)::BIGINT AS cnt
  FROM public.leads l
  WHERE l.is_synthetic = false
    AND (p_state IS NULL OR p_state = 'all' OR l.state = p_state)
  GROUP BY l.regulation_status;
$$;
