-- Migration: Alert Hub category column, retry queue persistence, lead concurrency control
-- Timestamp: 20260814260000

-- ─── 1. Add category column to app_notifications ─────────────────────────────
-- Maps DB type values to AlertCategory enum used by the Alert Hub UI

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS category TEXT NULL;

-- Backfill existing rows: map type → category
UPDATE public.app_notifications
SET category = CASE
  WHEN type IN ('sync_failure', 'sync_error', 'sync_stalled') THEN 'sync_issue'
  WHEN type IN ('error', 'failed_cadence', 'delivery_error', 'sms_failed') THEN 'delivery_error'
  WHEN type IN ('batch_failure', 'batch_error') THEN 'batch_failure'
  WHEN type IN ('tcpa_violation', 'tcpa_warning') THEN 'tcpa_violation'
  WHEN type IN ('webhook_error', 'webhook_failure') THEN 'webhook_error'
  WHEN type = 'manual_recovery' THEN 'delivery_error'
  ELSE 'delivery_error'  -- safe default for unmapped types
END
WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_notifications_category
  ON public.app_notifications(user_id, category);

-- ─── 2. Add retry_queue table for persisting retry state ─────────────────────

CREATE TABLE IF NOT EXISTS public.retry_queue (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  outreach_id     TEXT REFERENCES public.outreach_history(id) ON DELETE CASCADE,
  lead_id         TEXT NOT NULL,
  lead_name       TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'retrying', 'succeeded', 'exhausted')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  error_code      TEXT,
  error_message   TEXT,
  sequence_name   TEXT,
  agent_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  portfolio       TEXT,
  message_sid     TEXT,
  body_preview    TEXT,
  original_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at    TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_status      ON public.retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_retry_queue_lead_id     ON public.retry_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_agent_id    ON public.retry_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_portfolio   ON public.retry_queue(portfolio);
CREATE INDEX IF NOT EXISTS idx_retry_queue_updated_at  ON public.retry_queue(updated_at DESC);

ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'retry_queue' AND policyname = 'retry_queue_select'
  ) THEN
    CREATE POLICY retry_queue_select ON public.retry_queue
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'retry_queue' AND policyname = 'retry_queue_insert'
  ) THEN
    CREATE POLICY retry_queue_insert ON public.retry_queue
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'retry_queue' AND policyname = 'retry_queue_update'
  ) THEN
    CREATE POLICY retry_queue_update ON public.retry_queue
      FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 3. Add version column to leads for optimistic concurrency control ────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Ensure updated_at exists (it should already, but guard)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for fast version lookups on stage updates
CREATE INDEX IF NOT EXISTS idx_leads_version ON public.leads(id, version);
