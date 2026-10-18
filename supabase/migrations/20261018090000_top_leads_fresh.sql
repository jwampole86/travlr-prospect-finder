-- Top Scored Leads is for leads still worth reaching out to. It kept showing the same highest-scoring homes (ties broken by id) even
-- after they had been texted or had opted out, and returned at most 30 rows, so the list barely moved. Now texted leads are left out
-- for 30 days, opted-out phones are left out, ties go to the newest lead, and the API gets a larger pool to re-rank.
CREATE OR REPLACE FUNCTION public.exec_sql_top_leads(p_state text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id text, address text, city text, state text, zip text, beds integer, baths integer, price integer, stage text, regulation_status text, prospect_score integer, estimated_net_monthly integer, listing_url text, contact_name text, contact_phone text, source text, created_at text, luxury boolean, price_type text, estimated_gross_monthly integer, estimated_monthly_rent_ai integer, is_fsbo boolean, is_furnished boolean, is_apartment_community boolean, verified_owner boolean, verified_number boolean, verified_address text, has_phone boolean, property_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    l.id, l.address, l.city, l.state, l.zip, l.beds, l.baths, l.price, l.stage, l.regulation_status,
    l.prospect_score, l.estimated_net_monthly, l.listing_url, l.contact_name, l.contact_phone, l.source, l.created_at,
    l.luxury, l.price_type::TEXT, l.estimated_gross_monthly::INT, l.estimated_monthly_rent_ai::INT,
    l.is_fsbo, l.is_furnished, l.is_apartment_community,
    l.verified_owner, l.verified_number, l.verified_address::TEXT, l.has_phone, l.property_type::TEXT
  FROM public.leads l
  WHERE l.is_synthetic IS DISTINCT FROM true
    AND l.prospect_score > 0
    AND l.address IS NOT NULL
    AND l.address <> ''
    AND l.stage IN ('New Lead', 'Contacted', 'Interested', 'nurturing', 'engaged')
    AND l.sms_opted_out_at IS NULL
    AND (l.last_contacted_at IS NULL OR l.last_contacted_at < now() - interval '30 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.outreach_history o
      WHERE o.lead_id = l.id AND o.channel = 'sms' AND o.sent_at > now() - interval '30 days'
    )
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
  ORDER BY l.prospect_score DESC, l.created_at DESC NULLS LAST, l.id ASC
  LIMIT LEAST(p_limit, 300);
$function$;
