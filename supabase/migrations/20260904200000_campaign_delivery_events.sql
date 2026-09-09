-- ─── Campaign Delivery Events ─────────────────────────────────────────────────
-- Logs every email and SMS delivery attempt with status, timestamp, and errors.
-- Enables per-campaign success rate calculation and delivery audit trail.

CREATE TABLE IF NOT EXISTS public.campaign_delivery_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient           TEXT NOT NULL,
  lead_id             TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  status              TEXT NOT NULL CHECK (status IN ('delivered', 'failed', 'bounced', 'opened', 'clicked', 'queued')),
  error_message       TEXT,
  provider_message_id TEXT,
  provider_name       TEXT,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-campaign lookups
CREATE INDEX IF NOT EXISTS idx_campaign_delivery_events_campaign_id
  ON public.campaign_delivery_events (campaign_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_delivery_events_status
  ON public.campaign_delivery_events (status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_delivery_events_lead_id
  ON public.campaign_delivery_events (lead_id)
  WHERE lead_id IS NOT NULL;

-- RLS
ALTER TABLE public.campaign_delivery_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_delivery_events'
    AND policyname = 'authenticated_all_campaign_delivery_events'
  ) THEN
    CREATE POLICY authenticated_all_campaign_delivery_events
      ON public.campaign_delivery_events
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ─── Add success_rate computed column helper view ──────────────────────────────
-- View: campaign_success_rates — pre-computes success rate per campaign
CREATE OR REPLACE VIEW public.campaign_success_rates AS
SELECT
  ec.id                                                          AS campaign_id,
  ec.campaign_name,
  ec.total_sent,
  ec.total_failed,
  ec.total_skipped,
  ec.status,
  ec.created_at,
  CASE
    WHEN (ec.total_sent + ec.total_failed) = 0 THEN NULL
    ELSE ROUND(
      (ec.total_sent::numeric / (ec.total_sent + ec.total_failed)::numeric) * 100,
      1
    )
  END                                                            AS success_rate_pct,
  COUNT(cde.id)                                                  AS total_events,
  COUNT(cde.id) FILTER (WHERE cde.status = 'delivered')         AS events_delivered,
  COUNT(cde.id) FILTER (WHERE cde.status = 'failed')            AS events_failed,
  COUNT(cde.id) FILTER (WHERE cde.status = 'bounced')           AS events_bounced,
  COUNT(cde.id) FILTER (WHERE cde.status = 'opened')            AS events_opened,
  COUNT(cde.id) FILTER (WHERE cde.status = 'clicked')           AS events_clicked
FROM public.email_campaigns ec
LEFT JOIN public.campaign_delivery_events cde ON cde.campaign_id = ec.id
GROUP BY ec.id, ec.campaign_name, ec.total_sent, ec.total_failed, ec.total_skipped, ec.status, ec.created_at;
