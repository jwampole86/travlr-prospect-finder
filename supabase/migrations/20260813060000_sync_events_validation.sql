-- Migration: sync_events and sync_validation_errors tables
-- Supports: lead enrichment, email send, and source sync validation with exponential backoff retry

-- ─── sync_events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (operation_type IN ('lead_enrichment', 'email_send', 'source_sync')),
  operation_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'retrying', 'abandoned')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 7,
  next_retry_at timestamptz NULL,
  last_error text NULL,
  error_code text NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_events_user_id_idx ON public.sync_events(user_id);
CREATE INDEX IF NOT EXISTS sync_events_status_idx ON public.sync_events(status);
CREATE INDEX IF NOT EXISTS sync_events_next_retry_idx ON public.sync_events(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS sync_events_operation_type_idx ON public.sync_events(operation_type);

-- ─── sync_validation_errors ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_validation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (operation_type IN ('lead_enrichment', 'email_send', 'source_sync')),
  operation_id text NOT NULL,
  error_code text NOT NULL,
  error_message text NOT NULL,
  field text NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_validation_errors_user_id_idx ON public.sync_validation_errors(user_id);
CREATE INDEX IF NOT EXISTS sync_validation_errors_resolved_idx ON public.sync_validation_errors(resolved);
CREATE INDEX IF NOT EXISTS sync_validation_errors_operation_type_idx ON public.sync_validation_errors(operation_type);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_validation_errors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sync_events' AND policyname = 'sync_events_owner'
  ) THEN
    CREATE POLICY sync_events_owner ON public.sync_events
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sync_validation_errors' AND policyname = 'sync_validation_errors_owner'
  ) THEN
    CREATE POLICY sync_validation_errors_owner ON public.sync_validation_errors
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_events_updated_at'
  ) THEN
    CREATE TRIGGER sync_events_updated_at
      BEFORE UPDATE ON public.sync_events
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
