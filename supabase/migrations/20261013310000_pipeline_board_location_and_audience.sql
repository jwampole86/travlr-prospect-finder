-- Leads a person is working or has closed are no longer campaign targets.
CREATE OR REPLACE FUNCTION public.campaign_audience(p_audience text)
 RETURNS TABLE(lead_id text, prospect_score integer, state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT f.lead_id, f.prospect_score, f.state, l.contact_phone, l.owner_name
    FROM public.dashboard_lead_facts f
    JOIN public.leads l ON l.id = f.lead_id
    WHERE coalesce(l.is_synthetic, false) = false
      AND coalesce(l.program, 'str_conversion') <> 'co_host'
      AND l.sms_opted_out_at IS NULL
      AND coalesce(l.stage, 'New Lead') NOT IN ('Not a Fit', 'Under Contract', 'Live', 'human_outreach')
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
$function$;

-- One row per real lead with the stage it is really in, worked out from the latest campaign text and any manual stage.
-- Service role only; the board and map APIs read it.
DROP VIEW IF EXISTS public.pipeline_board_leads;
CREATE VIEW public.pipeline_board_leads AS
WITH e AS (
  SELECT DISTINCT ON (lead_id) * FROM public.sms_lead_engagement ORDER BY lead_id, scheduled_for DESC NULLS LAST
)
SELECT
  l.id, l.address, l.city, l.state, l.zip, l.lat, l.lng, l.geocode_source, l.beds, l.baths, l.price,
  l.prospect_score, l.estimated_net_monthly, l.estimated_gross_monthly,
  COALESCE(NULLIF(l.owner_name, ''), NULLIF(l.contact_name, '')) AS owner,
  l.has_phone, l.program, l.luxury, l.source, l.stage AS manual_stage, l.pipeline_status, l.regulation_status,
  l.created_at, l.updated_at, l.escalated_at, l.escalation_reason, l.assigned_agent_name, l.version,
  e.batch, e.audience, e.scheduled_for, e.twilio_status, e.phone_quality, e.human_clicks, e.estimate_viewed, e.deepest_step,
  e.reply_intent, e.reply_text, e.reply_at, e.temperature, e.engagement_score, e.last_activity, e.last_activity_at,
  e.estimate_submitted_at, e.contact_requested_at, l.primary_agent_id,
  (l.geocode_source IS NOT NULL OR NOT (abs(l.lat - 39.7392) < 0.0001 AND abs(l.lng + 104.9903) < 0.0001) OR lower(l.city) = 'denver') AND l.lat IS NOT NULL AND l.lng IS NOT NULL AS has_location,
  CASE
    WHEN l.stage = 'Live' THEN 'live'
    WHEN l.stage = 'Under Contract' THEN 'contract'
    WHEN l.stage = 'Not a Fit' OR l.pipeline_status = 'rejected' OR l.sms_opted_out_at IS NOT NULL OR e.opted_out IS TRUE OR e.temperature = 'opted_out' THEN 'closed'
    WHEN l.stage = 'human_outreach' OR l.pipeline_status = 'callback_scheduled' THEN 'human'
    WHEN e.temperature = 'hot' THEN 'hot'
    WHEN e.temperature = 'warm' THEN 'engaged'
    WHEN e.temperature = 'unreachable' THEN 'unreachable'
    WHEN e.twilio_status IS NOT NULL AND e.twilio_status NOT IN ('scheduled', 'queued', 'accepted', 'canceled') THEN 'texted'
    WHEN e.twilio_status IN ('scheduled', 'queued', 'accepted') THEN 'queued'
    ELSE 'prospect'
  END AS board_stage
FROM public.leads l
LEFT JOIN e ON e.lead_id = l.id
WHERE l.is_synthetic = false;

REVOKE ALL ON public.pipeline_board_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pipeline_board_leads TO service_role;
