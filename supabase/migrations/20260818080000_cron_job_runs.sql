-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: cron_job_runs tracking table
-- Tracks background cron job execution history for monitoring and debugging
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cron_job_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name                text NOT NULL,
  run_id                  text NOT NULL,
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  status                  text NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'success', 'partial', 'failed')),
  leads_scanned           integer NOT NULL DEFAULT 0,
  scores_recalculated     integer NOT NULL DEFAULT 0,
  reenrichment_triggered  integer NOT NULL DEFAULT 0,
  property_data_refreshed integer NOT NULL DEFAULT 0,
  error_count             integer NOT NULL DEFAULT 0,
  errors                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_name    ON public.cron_job_runs (job_name);
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_started_at  ON public.cron_job_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_status      ON public.cron_job_runs (status);

-- RLS
ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cron_job_runs' AND policyname = 'cron_job_runs_auth_read'
  ) THEN
    CREATE POLICY cron_job_runs_auth_read
      ON public.cron_job_runs
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cron_job_runs' AND policyname = 'cron_job_runs_service_write'
  ) THEN
    CREATE POLICY cron_job_runs_service_write
      ON public.cron_job_runs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END;
$$;

-- Add score_refreshed_at column to leads if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'score_refreshed_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN score_refreshed_at timestamptz;
  END IF;
END;
$$;

-- Add enrichment_queued_at column to leads if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'enrichment_queued_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN enrichment_queued_at timestamptz;
  END IF;
END;
$$;
