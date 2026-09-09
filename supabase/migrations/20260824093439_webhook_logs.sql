-- ─── webhook_logs ─────────────────────────────────────────────────────────────
-- Stores raw incoming webhook payloads for audit and debugging.
-- Used by /api/webhooks/base44-estimate and any future inbound webhooks.

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,                        -- e.g. 'base44_estimate'
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- raw incoming body
  status        text NOT NULL DEFAULT 'received',     -- received | processing | matched | created | error
  lead_id       text REFERENCES public.leads(id) ON DELETE SET NULL,
  error_message text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookup by source and status
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON public.webhook_logs (source);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON public.webhook_logs (status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON public.webhook_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_lead_id ON public.webhook_logs (lead_id) WHERE lead_id IS NOT NULL;

-- RLS: only service role and authenticated admins can read/write
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_logs"
  ON public.webhook_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read webhook_logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (true);
