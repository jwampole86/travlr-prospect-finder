-- Typical occupancy of established homes (a full year listed, 10+ reviews, 60+ booked nights) by market and size, for the Co-Host Pipeline.
CREATE OR REPLACE FUNCTION public.str_market_occupancy()
RETURNS TABLE (market TEXT, band TEXT, median_pct NUMERIC, n INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.market,
         CASE WHEN s.bedrooms IS NULL OR s.bedrooms <= 3 THEN '3' WHEN s.bedrooms = 4 THEN '4' WHEN s.bedrooms = 5 THEN '5' ELSE '6+' END,
         (percentile_cont(0.5) WITHIN GROUP (ORDER BY s.occupancy_pct))::numeric,
         count(*)::int
  FROM public.str_listings s
  WHERE s.days_available_ltm >= 180 AND s.reviews >= 10 AND (s.occupancy_pct / 100) * s.days_available_ltm >= 60 AND s.revenue_ltm > 0
  GROUP BY 1, 2
  HAVING count(*) >= 8;
$$;
REVOKE ALL ON FUNCTION public.str_market_occupancy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.str_market_occupancy() TO service_role;
