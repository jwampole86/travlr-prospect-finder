-- Migration: Bulk email outreach batch tracking + outreach_history enhancements
-- Timestamp: 20260901040000

-- ─── 1. Bulk Email Batches Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bulk_email_batches (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  template_id     TEXT,
  template_name   TEXT NOT NULL DEFAULT '',
  sender_name     TEXT NOT NULL DEFAULT 'TRAVLR Team',
  sender_email    TEXT NOT NULL DEFAULT 'onboarding@resend.dev',
  total_requested INTEGER NOT NULL DEFAULT 0,
  eligible        INTEGER NOT NULL DEFAULT 0,
  sent            INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  skipped         INTEGER NOT NULL DEFAULT 0,
  skipped_no_email INTEGER NOT NULL DEFAULT 0,
  skipped_dnc     INTEGER NOT NULL DEFAULT 0,
  skipped_opted_out INTEGER NOT NULL DEFAULT 0,
  portfolio       TEXT,
  stage_filter    TEXT[],
  status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  initiated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_email_batches_created_at ON public.bulk_email_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_email_batches_initiated_by ON public.bulk_email_batches(initiated_by);
CREATE INDEX IF NOT EXISTS idx_bulk_email_batches_template_id ON public.bulk_email_batches(template_id);

ALTER TABLE public.bulk_email_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bulk_email_batches' AND policyname = 'bulk_email_batches_select'
  ) THEN
    CREATE POLICY bulk_email_batches_select ON public.bulk_email_batches
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bulk_email_batches' AND policyname = 'bulk_email_batches_insert'
  ) THEN
    CREATE POLICY bulk_email_batches_insert ON public.bulk_email_batches
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bulk_email_batches' AND policyname = 'bulk_email_batches_update'
  ) THEN
    CREATE POLICY bulk_email_batches_update ON public.bulk_email_batches
      FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 2. Add batch_id to outreach_history if not present ──────────────────────
ALTER TABLE public.outreach_history ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES public.bulk_email_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_history_batch_id ON public.outreach_history(batch_id);

-- ─── 3. Add resend_message_id for delivery tracking ──────────────────────────
ALTER TABLE public.outreach_history ADD COLUMN IF NOT EXISTS resend_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_outreach_history_resend_id ON public.outreach_history(resend_message_id) WHERE resend_message_id IS NOT NULL;

-- ─── 4. Ensure app_notifications has category column ─────────────────────────
ALTER TABLE public.app_notifications ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.app_notifications ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'warning'
  CHECK (severity IN ('critical', 'warning', 'info'));

CREATE INDEX IF NOT EXISTS idx_app_notifications_category ON public.app_notifications(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_notifications_type_created ON public.app_notifications(type, created_at DESC);
