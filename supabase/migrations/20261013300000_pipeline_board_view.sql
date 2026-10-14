ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS geocode_source TEXT;

-- One row per real lead with the stage it is really in, worked out from the latest campaign text and any manual stage.
-- Service role only; the board and map APIs read it.
CREATE OR REPLACE VIEW public.pipeline_board_leads AS
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
  e.estimate_submitted_at, e.contact_requested_at,
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
