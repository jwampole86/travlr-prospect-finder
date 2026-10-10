-- ============================================================
-- Migration: 20261010090000_lead_city_breakdown_rpc
--
-- PURPOSE: Supports prioritizing which cities to research/add real STR
-- regulation coverage for — returns lead counts per (city, state) so the
-- highest-volume uncovered cities can be tackled first instead of guessing.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_lead_city_breakdown()
RETURNS TABLE(city TEXT, state TEXT, lead_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT l.city, l.state, count(*)::BIGINT AS lead_count
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND l.city IS NOT NULL AND l.city <> ''
    AND l.state IS NOT NULL AND l.state <> ''
  GROUP BY l.city, l.state
  ORDER BY lead_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_city_breakdown() TO authenticated;

COMMENT ON FUNCTION public.get_lead_city_breakdown() IS
  'Per-(city, state) lead counts — used to prioritize real STR-regulation research '
  'coverage expansion by lead volume instead of guessing which cities matter.';
