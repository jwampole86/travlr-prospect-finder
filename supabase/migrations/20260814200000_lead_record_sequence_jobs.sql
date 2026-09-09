-- Migration: Lead Record + Sequence Job Infrastructure
-- Adds: sequence_enrollments, scheduled_sends, outreach_history enhancements

-- ─── sequence_enrollments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id       uuid NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  enrolled_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  current_step      integer NOT NULL DEFAULT 0,
  next_send_at      timestamptz,
  last_sent_at      timestamptz,
  completed_at      timestamptz,
  enroll_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, sequence_id)
);

-- ─── scheduled_sends ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  lead_id         text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id     uuid REFERENCES public.follow_up_sequences(id) ON DELETE SET NULL,
  step_number     integer NOT NULL DEFAULT 0,
  channel         text NOT NULL CHECK (channel IN ('email', 'sms', 'call')),
  template_id     uuid,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
  error_message   text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── outreach_history enhancements ───────────────────────────────────────────
DO $$
BEGIN
  -- Add channel column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outreach_history' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.outreach_history ADD COLUMN channel text DEFAULT 'email';
  END IF;

  -- Add sequence_step_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outreach_history' AND column_name = 'sequence_step_id'
  ) THEN
    ALTER TABLE public.outreach_history ADD COLUMN sequence_step_id uuid;
  END IF;

  -- Add metadata column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outreach_history' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.outreach_history ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ─── leads: last_contacted_at ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_contacted_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN last_contacted_at timestamptz;
  END IF;
END $$;

-- ─── auto_enroll_trigger on follow_up_sequences ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follow_up_sequences' AND column_name = 'auto_enroll_trigger'
  ) THEN
    ALTER TABLE public.follow_up_sequences ADD COLUMN auto_enroll_trigger jsonb DEFAULT NULL;
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_lead_id ON public.sequence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_sequence_id ON public.sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_status ON public.sequence_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_send ON public.sequence_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_lead_id ON public.scheduled_sends(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_status ON public.scheduled_sends(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_scheduled_at ON public.scheduled_sends(scheduled_at) WHERE status = 'pending';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sequence_enrollments_all" ON public.sequence_enrollments;
CREATE POLICY "sequence_enrollments_all" ON public.sequence_enrollments
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scheduled_sends_all" ON public.scheduled_sends;
CREATE POLICY "scheduled_sends_all" ON public.scheduled_sends
  FOR ALL USING (true) WITH CHECK (true);
