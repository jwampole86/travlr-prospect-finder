-- Delivery webhooks look rows up by Resend message id.
CREATE INDEX IF NOT EXISTS idx_outreach_history_resend_message_id
  ON public.outreach_history (resend_message_id) WHERE resend_message_id IS NOT NULL;

-- Homeowner report emails are found by lead and kind when a send needs retrying or a bounce needs follow-up.
CREATE INDEX IF NOT EXISTS idx_outreach_history_lead_kind
  ON public.outreach_history (lead_id, ((metadata ->> 'kind')), created_at DESC);
