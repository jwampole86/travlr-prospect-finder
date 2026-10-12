-- STR income for expensive homes was bedroom-based and capped near $12K/mo, so after rents became price-aware a $2M+ home could show
-- less short-term income than long-term rent. Short-term income is never below 1.4x the long-term rent estimate for the same home
-- (observed ratio is 1.5x at $1-2M and 2.2x+ below $1M). ADR is raised with it so ADR x occupancy x 30 still equals gross; net stays 65% of gross.
CREATE OR REPLACE FUNCTION public.align_str_revenue_with_rent(p_apply BOOLEAN DEFAULT TRUE)
RETURNS TABLE(lead_id TEXT, sale_price NUMERIC, rent INTEGER, old_gross INTEGER, new_gross INTEGER, new_adr INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  CREATE TEMP TABLE tmp_str_align ON COMMIT DROP AS
  SELECT l.id AS lead_id, l.price::NUMERIC AS sale_price, l.estimated_monthly_rent_ai::INT AS rent,
         l.estimated_gross_monthly::INT AS old_gross,
         round(l.estimated_monthly_rent_ai * 1.4)::INT AS new_gross,
         round(l.estimated_monthly_rent_ai * 1.4 / (30 * coalesce(nullif(l.estimated_occupancy, 0), 70) / 100.0))::INT AS new_adr
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE AND l.price_type = 'sale'
    AND l.estimated_monthly_rent_ai > 0 AND l.estimated_gross_monthly > 0
    AND l.estimated_gross_monthly < l.estimated_monthly_rent_ai * 1.4;

  IF p_apply THEN
    UPDATE public.leads l
    SET estimated_gross_monthly = t.new_gross,
        estimated_net_monthly = round(t.new_gross * 0.65),
        estimated_adr = t.new_adr,
        calculation_version = 'travlr-v1.1-rent-aligned',
        calculated_at = now()
    FROM tmp_str_align t WHERE l.id = t.lead_id;
  END IF;

  RETURN QUERY SELECT t.lead_id, t.sale_price, t.rent, t.old_gross, t.new_gross, t.new_adr FROM tmp_str_align t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.align_str_revenue_with_rent(BOOLEAN) TO service_role;
