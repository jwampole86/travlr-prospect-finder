-- Short-term gross is 1.9x-2.6x long-term rent for homes under $1M. Both scale with value, so premium homes use a 1.8x floor
-- (the earlier 1.4x floor left expensive homes with almost no advantage over renting, which is not what the data shows).
CREATE OR REPLACE FUNCTION public.align_str_revenue_with_rent(p_apply BOOLEAN DEFAULT TRUE)
RETURNS TABLE(lead_id TEXT, sale_price NUMERIC, rent INTEGER, old_gross INTEGER, new_gross INTEGER, new_adr INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  CREATE TEMP TABLE tmp_str_align ON COMMIT DROP AS
  SELECT l.id AS lead_id, l.price::NUMERIC AS sale_price, l.estimated_monthly_rent_ai::INT AS rent,
         l.estimated_gross_monthly::INT AS old_gross,
         round(l.estimated_monthly_rent_ai * 1.8)::INT AS new_gross,
         round(l.estimated_monthly_rent_ai * 1.8 / (30 * coalesce(nullif(l.estimated_occupancy, 0), 70) / 100.0))::INT AS new_adr
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE AND l.price_type = 'sale'
    AND l.estimated_monthly_rent_ai > 0 AND l.estimated_gross_monthly > 0
    AND l.estimated_gross_monthly < l.estimated_monthly_rent_ai * 1.8;

  IF p_apply THEN
    UPDATE public.leads l
    SET estimated_gross_monthly = t.new_gross,
        estimated_net_monthly = round(t.new_gross * 0.65),
        estimated_adr = t.new_adr,
        calculation_version = 'travlr-v1.2-rent-aligned',
        calculated_at = now()
    FROM tmp_str_align t WHERE l.id = t.lead_id;
  END IF;

  RETURN QUERY SELECT t.lead_id, t.sale_price, t.rent, t.old_gross, t.new_gross, t.new_adr FROM tmp_str_align t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.align_str_revenue_with_rent(BOOLEAN) TO service_role;
