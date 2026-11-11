-- "Est. Net/Mo" used to depend only on bedrooms and state, so every 3-bedroom home in a state showed the same number whatever it cost,
-- and it ran about 1.7x above AirDNA's figures (median, on homes held out of the fit). This is the calibrated model from src/lib/strEstimate.ts,
-- fitted to AirDNA's figures for our own leads: it follows price and bedrooms, and blends in AirDNA's figures for the home where we have them.
-- Keep the two in step: any change to the coefficients goes in both places.
CREATE OR REPLACE FUNCTION public.refresh_str_estimates(p_limit INTEGER DEFAULT 5000)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH batch AS (
    SELECT id FROM public.leads
    WHERE is_synthetic IS NOT TRUE
      AND (calculation_version IS NULL OR calculation_version LIKE 'travlr-v1%')
    ORDER BY id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  inputs AS (
    SELECT l.id,
      (lower(coalesce(l.price_type::text, '')) = 'sale') AS is_sale,
      CASE WHEN l.price IS NOT NULL
             AND ((lower(coalesce(l.price_type::text, '')) = 'sale' AND l.price BETWEEN 50000 AND 50000000)
               OR (lower(coalesce(l.price_type::text, '')) <> 'sale' AND l.price BETWEEN 300 AND 30000))
           THEN l.price::double precision END AS price,
      CASE WHEN l.beds > 0 THEN least(6, greatest(1, round(l.beds::numeric)))::double precision END AS known_beds,
      CASE WHEN l.airdna_adr > 0 AND l.airdna_occupancy > 0 THEN l.airdna_adr::double precision END AS air_adr,
      l.airdna_occupancy::double precision AS air_occ,
      CASE lower(coalesce(l.airdna_confidence, ''))
        WHEN 'high' THEN 1.0 WHEN 'med' THEN 0.8 WHEN 'medium' THEN 0.8 ELSE 0.5 END AS air_w
    FROM public.leads l JOIN batch b ON b.id = l.id
  ),
  modelled AS (
    SELECT i.*,
      CASE
        WHEN i.price IS NULL THEN 3.8392 + 0.4129 * coalesce(i.known_beds, 3)
        WHEN i.is_sale THEN -0.8028 + 0.3938 * ln(i.price) + 0.2306 * coalesce(i.known_beds, 3)
        ELSE 1.6982 + 0.3864 * ln(i.price) + 0.1471 * coalesce(i.known_beds, 0)
      END AS ln_adr
    FROM inputs i
  ),
  occupancy AS (
    SELECT m.*, exp(m.ln_adr) AS m_adr,
      CASE
        WHEN m.price IS NULL THEN 57.0
        WHEN m.is_sale THEN 107.52 - 8.26 * m.ln_adr - 1.293 * coalesce(m.known_beds, 3)
        ELSE 90.049 - 6.081 * m.ln_adr + 0.432 * coalesce(m.known_beds, 0)
      END AS m_occ
    FROM modelled m
  ),
  blended AS (
    SELECT o.id,
      CASE WHEN o.air_adr IS NOT NULL THEN o.air_w * o.air_adr + (1 - o.air_w) * o.m_adr ELSE o.m_adr END AS adr,
      CASE WHEN o.air_adr IS NOT NULL THEN o.air_w * o.air_occ + (1 - o.air_w) * o.m_occ ELSE o.m_occ END AS occ
    FROM occupancy o
  ),
  final AS (
    SELECT b.id,
      round(least(1500::numeric, greatest(60::numeric, b.adr::numeric)))::integer AS adr,
      round(least(80::numeric, greatest(35::numeric, b.occ::numeric)))::integer AS occ
    FROM blended b
  ),
  priced AS (
    SELECT f.*, round(f.adr::numeric * 30 * f.occ / 100)::integer AS gross FROM final f
  )
  UPDATE public.leads l
  SET estimated_adr = p.adr,
      estimated_occupancy = p.occ,
      estimated_gross_monthly = p.gross,
      estimated_net_monthly = round(p.gross::numeric * 0.65)::integer,
      calculation_version = 'avyro-v2.0',
      calculated_at = now(),
      -- picked up by the next rescore, which reads the new estimate
      score_refreshed_at = NULL
  FROM priced p
  WHERE l.id = p.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_str_estimates(INTEGER) TO service_role;
