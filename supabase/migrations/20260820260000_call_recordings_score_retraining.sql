-- Migration: Call recordings surface + AI score retraining outcome feedback
-- Adds outcome_feedback and score_weight_signals tables for closed-deal retraining

-- ─── outcome_feedback ────────────────────────────────────────────────────────
-- Records each closed-deal outcome linked to a lead and its prospect score at close.

CREATE TABLE IF NOT EXISTS public.outcome_feedback (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                   text REFERENCES public.leads(id) ON DELETE SET NULL,
  outcome                   text NOT NULL CHECK (outcome IN ('converted', 'lost')),
  prospect_score_at_close   integer,
  region                    text,
  property_type             text,
  deal_value                numeric(10,2),
  agent_id                  uuid,
  closed_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_lead_id
  ON public.outcome_feedback(lead_id);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_region_outcome
  ON public.outcome_feedback(region, outcome);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_closed_at
  ON public.outcome_feedback(closed_at DESC);

-- ─── score_weight_signals ─────────────────────────────────────────────────────
-- Aggregated conversion signals per region + property type.
-- Updated by the outcome-feedback API after each batch of outcomes.

CREATE TABLE IF NOT EXISTS public.score_weight_signals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region                text NOT NULL,
  property_type         text NOT NULL,
  conversion_rate       numeric(5,4) NOT NULL DEFAULT 0,
  avg_converted_score   integer NOT NULL DEFAULT 0,
  avg_lost_score        integer NOT NULL DEFAULT 0,
  suggested_threshold   integer NOT NULL DEFAULT 60,
  sample_count          integer NOT NULL DEFAULT 0,
  last_updated          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, property_type)
);

CREATE INDEX IF NOT EXISTS idx_score_weight_signals_region
  ON public.score_weight_signals(region);

-- ─── Add recording_url / recording_sid to call_sessions if missing ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'call_sessions'
      AND column_name  = 'recording_url'
  ) THEN
    ALTER TABLE public.call_sessions ADD COLUMN recording_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'call_sessions'
      AND column_name  = 'recording_sid'
  ) THEN
    ALTER TABLE public.call_sessions ADD COLUMN recording_sid text;
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.outcome_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_weight_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outcome_feedback' AND policyname = 'outcome_feedback_auth_read'
  ) THEN
    CREATE POLICY outcome_feedback_auth_read
      ON public.outcome_feedback FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outcome_feedback' AND policyname = 'outcome_feedback_auth_insert'
  ) THEN
    CREATE POLICY outcome_feedback_auth_insert
      ON public.outcome_feedback FOR INSERT
      TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'score_weight_signals' AND policyname = 'score_weight_signals_auth_read'
  ) THEN
    CREATE POLICY score_weight_signals_auth_read
      ON public.score_weight_signals FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'score_weight_signals' AND policyname = 'score_weight_signals_auth_upsert'
  ) THEN
    CREATE POLICY score_weight_signals_auth_upsert
      ON public.score_weight_signals FOR ALL
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
