-- Audience rules that protect people, not just leads:
--  * a phone that opted out (STOP or NO), a phone flagged as the wrong person, and an owner who opted out are never texted again, on any property
--  * a phone already texted is texted again only for the same owner's different property (never the same property twice)
--  * one lead per phone in the pool, so the counts are people and one campaign never texts a number twice
CREATE OR REPLACE FUNCTION public.campaign_audience(p_audience TEXT)
RETURNS TABLE (lead_id TEXT, prospect_score INTEGER, state TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT l.id,
           nullif(right(regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g'), 10), '') AS ph,
           nullif(lower(regexp_replace(trim(coalesce(l.owner_name, '')), '\s+', ' ', 'g')), '') AS ok
    FROM public.leads l
  ),
  refused AS (
    SELECT n.ph, n.ok, true AS owner_refused FROM public.leads l JOIN norm n ON n.id = l.id WHERE l.sms_opted_out_at IS NOT NULL
    UNION ALL
    SELECT n.ph, n.ok, true FROM public.sms_lead_engagement e JOIN norm n ON n.id = e.lead_id WHERE e.opted_out OR e.reply_intent IN ('no', 'stop')
    UNION ALL
    SELECT n.ph, NULL, false FROM public.sms_lead_engagement e JOIN norm n ON n.id = e.lead_id WHERE e.reply_intent = 'wrong_contact' OR e.phone_quality = 'wrong_person'
  ),
  blocked_phone AS (
    SELECT ph FROM refused WHERE ph IS NOT NULL
    UNION
    SELECT right(regexp_replace(s.phone_e164, '\D', '', 'g'), 10) FROM public.sms_suppressions s
  ),
  blocked_owner AS (SELECT DISTINCT ok FROM refused WHERE owner_refused AND ok IS NOT NULL),
  texted AS (
    SELECT right(regexp_replace(coalesce(o.metadata->>'to', ''), '\D', '', 'g'), 10) AS ph, n.ok
    FROM public.outreach_history o JOIN norm n ON n.id = o.lead_id
    WHERE o.channel = 'sms' AND o.metadata->>'kind' = 'estimate_outreach'
  ),
  pool AS (
    SELECT f.lead_id, f.prospect_score, f.state, n.ph, n.ok
    FROM public.dashboard_lead_facts f
    JOIN public.leads l ON l.id = f.lead_id
    JOIN norm n ON n.id = f.lead_id
    WHERE coalesce(l.is_synthetic, false) = false
      AND coalesce(l.program, 'str_conversion') <> 'co_host'
      AND l.sms_opted_out_at IS NULL
      AND coalesce(l.address, '') !~ ',\s*[A-Za-z]{2}\s+\d{5}\s*$'
      AND NOT EXISTS (
        SELECT 1 FROM public.outreach_history o
        WHERE o.lead_id = f.lead_id AND o.channel = 'sms' AND o.metadata->>'kind' = 'estimate_outreach'
      )
      AND (n.ph IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_phone b WHERE b.ph = n.ph))
      AND (n.ok IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_owner b WHERE b.ok = n.ok))
      AND (n.ph IS NULL OR NOT EXISTS (SELECT 1 FROM texted t WHERE t.ph = n.ph AND (t.ok IS NULL OR n.ok IS NULL OR t.ok <> n.ok)))
      AND CASE p_audience
        WHEN 'fully-verified' THEN l.fully_verified IS TRUE
        WHEN 'luxury-phone' THEN f.luxury AND f.phone_available AND coalesce(l.price_type::text, '') <> 'rent'
        WHEN 'high-score' THEN f.phone_available AND f.has_address AND f.prospect_score >= 70
        WHEN 'allowed-markets' THEN f.phone_available AND f.has_address AND f.regulation_status = 'Allowed'
        WHEN 'broad' THEN f.phone_available AND f.has_address AND f.has_price AND f.has_beds
        ELSE false
      END
  ),
  ranked AS (
    SELECT p.*, row_number() OVER (PARTITION BY coalesce(p.ph, p.lead_id) ORDER BY p.prospect_score DESC, p.lead_id) AS rn FROM pool p
  )
  SELECT r.lead_id, r.prospect_score, r.state FROM ranked r WHERE r.rn = 1 ORDER BY r.prospect_score DESC, r.lead_id;
$$;

REVOKE ALL ON FUNCTION public.campaign_audience(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_audience(TEXT) TO service_role;
