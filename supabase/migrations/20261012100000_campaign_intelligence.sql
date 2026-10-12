-- Campaign intelligence: everything an outreach text teaches us, kept per lead so future text/email campaigns and the CRM can use it.
-- All tables are written by server code (service role) only; RLS is on with no policies, so browsers cannot read or write them.

-- Every hit on a short link, bots included, so click counts can be cleaned of link-preview and carrier scanners.
CREATE TABLE IF NOT EXISTS public.sms_link_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_bot BOOLEAN NOT NULL DEFAULT false,
  bot_reason TEXT,
  device TEXT,
  os TEXT,
  browser TEXT,
  user_agent TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  referrer TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_link_events_lead ON public.sms_link_events (lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_sms_link_events_code ON public.sms_link_events (code);

-- What the homeowner did on the estimate page after tapping the link.
CREATE TABLE IF NOT EXISTS public.estimate_journey_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estimate_journey_lead ON public.estimate_journey_events (lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_estimate_journey_session ON public.estimate_journey_events (session_id, created_at);

-- One row per lead per campaign: the delivery, engagement and outcome record the Campaigns tab and the CRM read.
CREATE TABLE IF NOT EXISTS public.sms_lead_engagement (
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  batch TEXT NOT NULL,
  audience TEXT,
  message_sid TEXT,
  variant TEXT,
  generated_by TEXT,
  segments INT,
  range_text TEXT,
  state TEXT,
  scheduled_for TIMESTAMPTZ,
  twilio_status TEXT,
  twilio_error_code TEXT,
  price_usd NUMERIC(8,4),
  delivered_at TIMESTAMPTZ,
  phone_quality TEXT,
  first_click_at TIMESTAMPTZ,
  human_clicks INT NOT NULL DEFAULT 0,
  bot_clicks INT NOT NULL DEFAULT 0,
  device TEXT,
  os TEXT,
  click_region TEXT,
  estimate_viewed BOOLEAN NOT NULL DEFAULT false,
  time_on_page_s INT,
  deepest_step TEXT,
  report_downloaded BOOLEAN NOT NULL DEFAULT false,
  chat_questions INT NOT NULL DEFAULT 0,
  website_clicked BOOLEAN NOT NULL DEFAULT false,
  estimate_submitted_at TIMESTAMPTZ,
  contact_requested_at TIMESTAMPTZ,
  reply_at TIMESTAMPTZ,
  reply_intent TEXT,
  reply_text TEXT,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  opted_out BOOLEAN NOT NULL DEFAULT false,
  engagement_score INT NOT NULL DEFAULT 0,
  temperature TEXT NOT NULL DEFAULT 'untouched',
  final BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, batch)
);
CREATE INDEX IF NOT EXISTS idx_sms_lead_engagement_batch ON public.sms_lead_engagement (batch, temperature);

-- Point-in-time reports and the AI-written takeaways, so campaigns can be compared over time.
CREATE TABLE IF NOT EXISTS public.campaign_insight_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report JSONB NOT NULL,
  insights JSONB,
  model TEXT
);
CREATE INDEX IF NOT EXISTS idx_campaign_insight_snapshots_batch ON public.campaign_insight_snapshots (batch, created_at DESC);

ALTER TABLE public.sms_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_lead_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_insight_snapshots ENABLE ROW LEVEL SECURITY;
