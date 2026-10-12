-- The luxury-with-phone audience no longer includes rental listings: the number on a rental may belong to a tenant or an agent,
-- not the owner we are offering a conversion estimate to. Everything else is unchanged from the address-check version.
CREATE OR REPLACE FUNCTION public.campaign_audience(p_audience TEXT)
RETURNS TABLE (lead_id TEXT, prospect_score INTEGER, state TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.lead_id, f.prospect_score, f.state
  FROM public.dashboard_lead_facts f
  JOIN public.leads l ON l.id = f.lead_id
  WHERE coalesce(l.is_synthetic, false) = false
    AND coalesce(l.program, 'str_conversion') <> 'co_host'
    AND l.sms_opted_out_at IS NULL
    AND coalesce(l.address, '') !~ ',\s*[A-Za-z]{2}\s+\d{5}\s*$'
    AND NOT EXISTS (
      SELECT 1 FROM public.outreach_history o
      WHERE o.lead_id = f.lead_id AND o.channel = 'sms' AND o.metadata->>'kind' = 'estimate_outreach'
    )
    AND CASE p_audience
      WHEN 'fully-verified' THEN l.fully_verified IS TRUE
      WHEN 'luxury-phone' THEN f.luxury AND f.phone_available AND coalesce(l.price_type::text, '') <> 'rent'
      WHEN 'high-score' THEN f.phone_available AND f.has_address AND f.prospect_score >= 70
      WHEN 'allowed-markets' THEN f.phone_available AND f.has_address AND f.regulation_status = 'Allowed'
      WHEN 'broad' THEN f.phone_available AND f.has_address AND f.has_price AND f.has_beds
      ELSE false
    END
  ORDER BY f.prospect_score DESC, f.lead_id;
$$;

REVOKE ALL ON FUNCTION public.campaign_audience(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_audience(TEXT) TO service_role;
