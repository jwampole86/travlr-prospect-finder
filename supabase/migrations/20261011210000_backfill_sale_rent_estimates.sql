-- Fills leads.estimated_monthly_rent_ai for for-sale leads that have no rent estimate, using data already in the database.
-- Tier 1: median asking rent of same-bedroom rental leads in the same ZIP (>= 3 comps).
-- Tier 2: median asking rent of same-bedroom rental leads in the same city (>= 5 comps).
-- Tier 3: ZORI market rent index (ZIP, then 3-digit prefix, then state) x a bedroom multiplier learned from the rental comps,
--         scaled up for homes priced far above the area's top-tier value. Lowest confidence.
-- Never overwrites an existing estimate (e.g. a Zillow rentZestimate). p_apply=false returns the estimates without writing.
CREATE OR REPLACE FUNCTION public.backfill_sale_rent_estimates(p_apply BOOLEAN DEFAULT TRUE, p_limit INTEGER DEFAULT 20000)
RETURNS TABLE(lead_id TEXT, city TEXT, state TEXT, beds INTEGER, sale_price NUMERIC, est_rent INTEGER, source TEXT, confidence TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  CREATE TEMP TABLE tmp_rent_est ON COMMIT DROP AS
  WITH comps AS (
    SELECT nullif(left(btrim(l.zip), 5), '') AS zip5,
           upper(btrim(l.state)) AS st,
           lower(btrim(l.city)) AS city_key,
           LEAST(round(l.beds)::INT, 5) AS b,
           l.price::NUMERIC AS rent
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE AND l.price_type = 'rent'
      AND l.price BETWEEN 400 AND 25000 AND l.beds >= 1
  ), zip_med AS (
    SELECT zip5, b, percentile_cont(0.5) WITHIN GROUP (ORDER BY rent) AS med, count(*) AS n
    FROM comps WHERE zip5 IS NOT NULL GROUP BY zip5, b HAVING count(*) >= 3
  ), city_med AS (
    SELECT st, city_key, b, percentile_cont(0.5) WITHIN GROUP (ORDER BY rent) AS med, count(*) AS n
    FROM comps WHERE city_key <> '' GROUP BY st, city_key, b HAVING count(*) >= 5
  ), bed_mult AS (
    SELECT c.b, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.rent / z.rent_index) AS mult
    FROM comps c
    JOIN public.market_cost_benchmarks z ON z.geo_type = 'zip' AND z.geo_key = c.zip5 AND z.rent_index > 0
    GROUP BY c.b HAVING count(*) >= 20
  ), targets AS (
    SELECT l.id, btrim(l.city) AS city, upper(btrim(l.state)) AS st, round(l.beds)::INT AS beds_i, l.price::NUMERIC AS price,
           nullif(left(btrim(l.zip), 5), '') AS zip5,
           lower(btrim(l.city)) AS city_key,
           CASE WHEN l.beds >= 1 THEN LEAST(round(l.beds)::INT, 5) END AS b
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE AND l.price_type = 'sale'
      AND coalesce(l.estimated_monthly_rent_ai, 0) <= 0
    ORDER BY l.id
    LIMIT p_limit
  ), enriched AS (
    SELECT t.*,
           zm.med AS zip_rent, cm.med AS city_rent,
           coalesce(bz.rent_index, b3.rent_index, bs.rent_index) AS rent_index,
           coalesce(bz.home_value_top_tier, b3.home_value_top_tier, bs.home_value_top_tier) AS top_value,
           coalesce(bm.mult, 1.0) AS mult
    FROM targets t
    LEFT JOIN zip_med zm ON zm.zip5 = t.zip5 AND zm.b = t.b
    LEFT JOIN city_med cm ON cm.st = t.st AND cm.city_key = t.city_key AND cm.b = t.b
    LEFT JOIN public.market_cost_benchmarks bz ON bz.geo_type = 'zip' AND bz.geo_key = t.zip5
    LEFT JOIN public.market_cost_benchmarks b3 ON b3.geo_type = 'zip3' AND b3.geo_key = left(t.zip5, 3)
    LEFT JOIN public.market_cost_benchmarks bs ON bs.geo_type = 'state' AND bs.geo_key = t.st
    LEFT JOIN bed_mult bm ON bm.b = t.b
  ), est AS (
    SELECT e.id, e.city, e.st, e.beds_i, e.price,
      CASE
        WHEN e.zip_rent IS NOT NULL THEN e.zip_rent
        WHEN e.city_rent IS NOT NULL THEN e.city_rent
        WHEN e.rent_index > 0 THEN e.rent_index * e.mult
          * CASE WHEN e.top_value > 0 AND e.price > e.top_value THEN LEAST(4, power(e.price / e.top_value, 0.5)) ELSE 1 END
      END AS raw_rent,
      CASE WHEN e.zip_rent IS NOT NULL THEN 'RENTAL_COMPS_ZIP'
           WHEN e.city_rent IS NOT NULL THEN 'RENTAL_COMPS_CITY'
           WHEN e.rent_index > 0 THEN 'ZORI_BED_ADJUSTED' END AS src,
      CASE WHEN e.zip_rent IS NOT NULL OR e.city_rent IS NOT NULL THEN 'MEDIUM' ELSE 'LOW' END AS conf
    FROM enriched e
  )
  SELECT s.id AS lead_id, s.city, s.st AS state, s.beds_i AS beds, s.price AS sale_price,
         (round(LEAST(30000, GREATEST(500, s.raw_rent)) / 25.0) * 25)::INT AS est_rent,
         s.src AS source, s.conf AS confidence
  FROM est s WHERE s.raw_rent IS NOT NULL;

  IF p_apply THEN
    UPDATE public.leads l
    SET estimated_monthly_rent_ai = t.est_rent,
        estimated_monthly_rent_ai_source = t.source,
        estimated_monthly_rent_ai_confidence = t.confidence,
        estimated_monthly_rent_ai_at = now()
    FROM tmp_rent_est t
    WHERE l.id = t.lead_id AND coalesce(l.estimated_monthly_rent_ai, 0) <= 0;
  END IF;

  RETURN QUERY SELECT t.lead_id, t.city, t.state, t.beds, t.sale_price, t.est_rent, t.source, t.confidence FROM tmp_rent_est t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_sale_rent_estimates(BOOLEAN, INTEGER) TO service_role;
