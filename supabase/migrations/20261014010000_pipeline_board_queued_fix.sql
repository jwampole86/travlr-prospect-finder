-- Texts already scheduled with Twilio count as queued even before the engagement table has caught up.
DROP VIEW IF EXISTS public.pipeline_board_leads;
CREATE VIEW public.pipeline_board_leads AS
 WITH e AS (
         SELECT DISTINCT ON (sms_lead_engagement.lead_id) sms_lead_engagement.lead_id,
            sms_lead_engagement.batch,
            sms_lead_engagement.audience,
            sms_lead_engagement.message_sid,
            sms_lead_engagement.variant,
            sms_lead_engagement.generated_by,
            sms_lead_engagement.segments,
            sms_lead_engagement.range_text,
            sms_lead_engagement.state,
            sms_lead_engagement.scheduled_for,
            sms_lead_engagement.twilio_status,
            sms_lead_engagement.twilio_error_code,
            sms_lead_engagement.price_usd,
            sms_lead_engagement.delivered_at,
            sms_lead_engagement.phone_quality,
            sms_lead_engagement.first_click_at,
            sms_lead_engagement.human_clicks,
            sms_lead_engagement.bot_clicks,
            sms_lead_engagement.device,
            sms_lead_engagement.os,
            sms_lead_engagement.click_region,
            sms_lead_engagement.estimate_viewed,
            sms_lead_engagement.time_on_page_s,
            sms_lead_engagement.deepest_step,
            sms_lead_engagement.report_downloaded,
            sms_lead_engagement.chat_questions,
            sms_lead_engagement.website_clicked,
            sms_lead_engagement.estimate_submitted_at,
            sms_lead_engagement.contact_requested_at,
            sms_lead_engagement.reply_at,
            sms_lead_engagement.reply_intent,
            sms_lead_engagement.reply_text,
            sms_lead_engagement.opted_in,
            sms_lead_engagement.opted_out,
            sms_lead_engagement.engagement_score,
            sms_lead_engagement.temperature,
            sms_lead_engagement.final,
            sms_lead_engagement.updated_at,
            sms_lead_engagement.last_activity_at,
            sms_lead_engagement.last_activity
           FROM sms_lead_engagement
          ORDER BY sms_lead_engagement.lead_id, sms_lead_engagement.scheduled_for DESC NULLS LAST
        )
 SELECT l.id,
    l.address,
    l.city,
    l.state,
    l.zip,
    l.lat,
    l.lng,
    l.geocode_source,
    l.beds,
    l.baths,
    l.price,
    l.prospect_score,
    l.estimated_net_monthly,
    l.estimated_gross_monthly,
    COALESCE(NULLIF(l.owner_name, ''::text), NULLIF(l.contact_name, ''::text)) AS owner,
    l.has_phone,
    l.program,
    l.luxury,
    l.source,
    l.stage AS manual_stage,
    l.pipeline_status,
    l.regulation_status,
    l.created_at,
    l.updated_at,
    l.escalated_at,
    l.escalation_reason,
    l.assigned_agent_name,
    l.version,
    e.batch,
    e.audience,
    e.scheduled_for,
    e.twilio_status,
    e.phone_quality,
    e.human_clicks,
    e.estimate_viewed,
    e.deepest_step,
    e.reply_intent,
    e.reply_text,
    e.reply_at,
    e.temperature,
    e.engagement_score,
    e.last_activity,
    e.last_activity_at,
    e.estimate_submitted_at,
    e.contact_requested_at,
    l.primary_agent_id,
    (l.geocode_source IS NOT NULL OR NOT (abs(l.lat - 39.7392::double precision) < 0.0001::double precision AND abs(l.lng + 104.9903::double precision) < 0.0001::double precision) OR lower(l.city) = 'denver'::text) AND l.lat IS NOT NULL AND l.lng IS NOT NULL AS has_location,
        CASE
            WHEN l.stage = 'Live'::lead_stage THEN 'live'::text
            WHEN l.stage = 'Under Contract'::lead_stage THEN 'contract'::text
            WHEN l.stage = 'Not a Fit'::lead_stage OR l.pipeline_status = 'rejected'::pipeline_status OR l.sms_opted_out_at IS NOT NULL OR e.opted_out IS TRUE OR e.temperature = 'opted_out'::text THEN 'closed'::text
            WHEN l.stage = 'human_outreach'::lead_stage OR l.pipeline_status = 'callback_scheduled'::pipeline_status THEN 'human'::text
            WHEN e.temperature = 'hot'::text THEN 'hot'::text
            WHEN e.temperature = 'warm'::text THEN 'engaged'::text
            WHEN e.temperature = 'unreachable'::text THEN 'unreachable'::text
            WHEN e.twilio_status IS NOT NULL AND (e.twilio_status <> ALL (ARRAY['scheduled'::text, 'queued'::text, 'accepted'::text, 'canceled'::text])) THEN 'texted'::text
            WHEN e.twilio_status = ANY (ARRAY['scheduled'::text, 'queued'::text, 'accepted'::text]) THEN 'queued'::text
            WHEN qd.lead_id IS NOT NULL THEN 'queued'
            ELSE 'prospect'::text
        END AS board_stage
   FROM leads l
     LEFT JOIN e ON e.lead_id = l.id
     LEFT JOIN ( SELECT DISTINCT o.lead_id FROM public.outreach_history o WHERE o.channel = 'sms' AND (o.metadata ->> 'kind') = 'estimate_outreach' AND (o.metadata ->> 'twilio_status') = 'scheduled') qd ON qd.lead_id = l.id
  WHERE l.is_synthetic = false;

REVOKE ALL ON public.pipeline_board_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pipeline_board_leads TO service_role;
