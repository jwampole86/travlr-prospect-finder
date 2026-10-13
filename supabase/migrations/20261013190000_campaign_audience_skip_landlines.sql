-- Also leaves out numbers already screened as landline or invalid, so pools count only people we can text.
-- Same rules as before.
CREATE OR REPLACE FUNCTION public.campaign_audience(p_audience TEXT)
RETURNS TABLE (lead_id TEXT, prospect_score INTEGER, state TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT f.lead_id, f.prospect_score, f.state, l.contact_phone, l.owner_name
    FROM public.dashboard_lead_facts f
    JOIN public.leads l ON l.id = f.lead_id
    WHERE coalesce(l.is_synthetic, false) = false
      AND coalesce(l.program, 'str_conversion') <> 'co_host'
      AND l.sms_opted_out_at IS NULL
      AND NOT (coalesce(l.tags, ARRAY[]::text[]) && ARRAY['sms:phone:landline', 'sms:phone:invalid'])
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
  ),
  pool AS (
    SELECT b.lead_id, b.prospect_score, b.state,
           nullif(right(regexp_replace(coalesce(b.contact_phone, ''), '\D', '', 'g'), 10), '') AS ph,
           nullif(lower(regexp_replace(trim(coalesce(b.owner_name, '')), '\s+', ' ', 'g')), '') AS ok
    FROM base b
  ),
  refused AS (
    SELECT right(regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g'), 10) AS ph,
           nullif(lower(regexp_replace(trim(coalesce(l.owner_name, '')), '\s+', ' ', 'g')), '') AS ok, true AS owner_refused
    FROM public.leads l WHERE l.sms_opted_out_at IS NOT NULL
    UNION ALL
    SELECT right(regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g'), 10),
           nullif(lower(regexp_replace(trim(coalesce(l.owner_name, '')), '\s+', ' ', 'g')), ''), true
    FROM public.sms_lead_engagement e JOIN public.leads l ON l.id = e.lead_id WHERE e.opted_out OR e.reply_intent IN ('no', 'stop')
    UNION ALL
    SELECT right(regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g'), 10), NULL, false
    FROM public.sms_lead_engagement e JOIN public.leads l ON l.id = e.lead_id WHERE e.reply_intent = 'wrong_contact' OR e.phone_quality = 'wrong_person'
  ),
  blocked_phone AS (
    SELECT ph FROM refused WHERE ph <> ''
    UNION
    SELECT right(regexp_replace(s.phone_e164, '\D', '', 'g'), 10) FROM public.sms_suppressions s
  ),
  blocked_owner AS (SELECT DISTINCT ok FROM refused WHERE owner_refused AND ok IS NOT NULL),
  texted AS (
    SELECT right(regexp_replace(coalesce(o.metadata->>'to', ''), '\D', '', 'g'), 10) AS ph,
           nullif(lower(regexp_replace(trim(coalesce(l.owner_name, '')), '\s+', ' ', 'g')), '') AS ok
    FROM public.outreach_history o JOIN public.leads l ON l.id = o.lead_id
    WHERE o.channel = 'sms' AND o.metadata->>'kind' = 'estimate_outreach'
  ),
  allowed AS (
    SELECT p.* FROM pool p
    WHERE (p.ph IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_phone b WHERE b.ph = p.ph))
      AND (p.ok IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_owner b WHERE b.ok = p.ok))
      AND (p.ph IS NULL OR NOT EXISTS (SELECT 1 FROM texted t WHERE t.ph = p.ph AND (t.ok IS NULL OR p.ok IS NULL OR t.ok <> p.ok)))
  ),
  ranked AS (
    SELECT a.*, row_number() OVER (PARTITION BY coalesce(a.ph, a.lead_id) ORDER BY a.prospect_score DESC, a.lead_id) AS rn FROM allowed a
  )
  SELECT r.lead_id, r.prospect_score, r.state FROM ranked r WHERE r.rn = 1 ORDER BY r.prospect_score DESC, r.lead_id;
$$;

REVOKE ALL ON FUNCTION public.campaign_audience(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_audience(TEXT) TO service_role;
