-- Email outreach campaigns to co-host prospects (existing short-term-rental owners). Kept apart from the homeowner text campaigns:
-- a person reviews and sends each email one at a time, and delivery, opens, offer-page views and replies are tracked per message.
CREATE TABLE IF NOT EXISTS public.cohost_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cohost_email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.cohost_email_campaigns(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES public.str_listings(property_id) ON DELETE CASCADE,
  offer_code TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'delivered', 'opened', 'bounced', 'failed', 'opted_out', 'canceled')),
  resend_message_id TEXT,
  sent_by TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT,
  failure_reason TEXT,
  replied_at TIMESTAMPTZ,
  reply_text TEXT,
  opted_out_at TIMESTAMPTZ,
  tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_cohost_email_messages_campaign ON public.cohost_email_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_cohost_email_messages_resend ON public.cohost_email_messages (resend_message_id);
CREATE INDEX IF NOT EXISTS idx_cohost_email_messages_property ON public.cohost_email_messages (property_id);
ALTER TABLE public.cohost_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohost_email_messages ENABLE ROW LEVEL SECURITY;
