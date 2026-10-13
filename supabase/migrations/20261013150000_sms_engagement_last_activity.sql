-- When the homeowner last did anything (clicked, viewed, replied, submitted) and what it was, so lists can be sorted by recency.
ALTER TABLE public.sms_lead_engagement
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity TEXT;
CREATE INDEX IF NOT EXISTS idx_sms_lead_engagement_activity ON public.sms_lead_engagement (batch, last_activity_at DESC NULLS LAST);
