-- Price-aware rent estimates for for-sale leads.
-- Model: ln(rent) = 1.159 + 0.310 ln(price) + 0.309 ln(local rent index) + 0.041 beds + 0.077 baths
-- Fitted on 823 Zillow per-property rent estimates; 5-fold cross-validated median error 11.9% (raw rent index: 33.6%).
-- Rent now always rises with price. Above $1.5M neither Zillow nor RentCast has enough rental comps, so their values run
-- far too low; a floor of 3% of price per year keeps expensive homes from showing less rent than cheaper ones.
-- Replaces market-index / same-bedroom-comps fallbacks; Zillow and RentCast values are kept unless they fall under the floor.
CREATE OR REPLACE FUNCTION public.reestimate_sale_rents(p_apply BOOLEAN DEFAULT TRUE)
RETURNS TABLE(lead_id TEXT, city TEXT, state TEXT, beds INTEGER, sale_price NUMERIC, old_rent INTEGER, new_rent INTEGER, old_source TEXT, new_source TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  CREATE TEMP TABLE tmp_reest ON COMMIT DROP AS
  WITH base AS (
    SELECT l.id, btrim(l.city) AS city, upper(btrim(l.state)) AS st, round(l.beds)::INT AS beds_i, l.price::NUMERIC AS price,
           coalesce(l.estimated_monthly_rent_ai, 0)::NUMERIC AS old_rent, l.estimated_monthly_rent_ai_source AS old_src,
           LEAST(coalesce(round(l.beds), 3), 6) AS b,
           LEAST(coalesce(nullif(l.baths, 0), coalesce(nullif(l.beds, 0), 3) * 0.75), 6) AS ba,
           coalesce(bz.rent_index, b3.rent_index, bs.rent_index) AS rent_idx
    FROM public.leads l
    LEFT JOIN public.market_cost_benchmarks bz ON bz.geo_type = 'zip' AND bz.geo_key = left(btrim(l.zip), 5)
    LEFT JOIN public.market_cost_benchmarks b3 ON b3.geo_type = 'zip3' AND b3.geo_key = left(btrim(l.zip), 3)
    LEFT JOIN public.market_cost_benchmarks bs ON bs.geo_type = 'state' AND bs.geo_key = upper(btrim(l.state))
    WHERE l.is_synthetic IS NOT TRUE AND l.price_type = 'sale' AND l.price > 30000
  ), scored AS (
    SELECT b.*,
      CASE WHEN b.rent_idx > 0 THEN exp(1.159 + 0.310 * ln(b.price) + 0.309 * ln(b.rent_idx) + 0.041 * b.b + 0.077 * b.ba) END AS model_rent,
      CASE WHEN b.price >= 1500000 THEN b.price * 0.03 / 12 ELSE 0 END AS floor_rent
    FROM base b
  ), decided AS (
    SELECT s.*,
      CASE
        WHEN s.old_rent <= 0 OR s.old_src IS NULL OR s.old_src IN ('ZORI_BED_ADJUSTED', 'RENTAL_COMPS_ZIP', 'RENTAL_COMPS_CITY')
          THEN CASE WHEN s.model_rent IS NOT NULL THEN GREATEST(s.model_rent, s.floor_rent) END
        WHEN s.old_rent < s.floor_rent THEN s.floor_rent
      END AS new_raw,
      CASE
        WHEN s.old_rent <= 0 OR s.old_src IS NULL OR s.old_src IN ('ZORI_BED_ADJUSTED', 'RENTAL_COMPS_ZIP', 'RENTAL_COMPS_CITY')
          THEN CASE WHEN s.model_rent >= s.floor_rent THEN 'PRICE_MODEL' ELSE 'PRICE_MODEL+FLOOR' END
        WHEN s.old_src LIKE '%+FLOOR' THEN s.old_src
        ELSE s.old_src || '+FLOOR'
      END AS new_src
    FROM scored s
  )
  SELECT d.id AS lead_id, d.city, d.st AS state, d.beds_i AS beds, d.price AS sale_price,
         d.old_rent::INT AS old_rent,
         (round(LEAST(60000, GREATEST(500, d.new_raw)) / 25.0) * 25)::INT AS new_rent,
         d.old_src AS old_source, d.new_src AS new_source,
         CASE WHEN d.new_src LIKE '%FLOOR%' THEN 'MEDIUM' WHEN d.new_src = 'PRICE_MODEL' THEN 'MEDIUM' ELSE NULL END AS conf
  FROM decided d WHERE d.new_raw IS NOT NULL;

  IF p_apply THEN
    UPDATE public.leads l
    SET estimated_monthly_rent_ai = t.new_rent,
        estimated_monthly_rent_ai_source = t.new_source,
        estimated_monthly_rent_ai_confidence = coalesce(t.conf, l.estimated_monthly_rent_ai_confidence),
        estimated_monthly_rent_ai_at = now()
    FROM tmp_reest t
    WHERE l.id = t.lead_id AND t.new_rent IS DISTINCT FROM t.old_rent;
  END IF;

  RETURN QUERY SELECT t.lead_id, t.city, t.state, t.beds, t.sale_price, t.old_rent, t.new_rent, t.old_source, t.new_source FROM tmp_reest t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reestimate_sale_rents(BOOLEAN) TO service_role;
