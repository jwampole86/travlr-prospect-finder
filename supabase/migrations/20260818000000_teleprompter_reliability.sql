-- Teleprompter Reliability & Effectiveness Tables
-- Adds: low_confidence_log, suggestion_feedback, call_summaries

-- ── Low Confidence Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teleprompter_low_confidence_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  segment_text text,
  confidence_score numeric(4,3),
  logged_at timestamptz DEFAULT now()
);

ALTER TABLE public.teleprompter_low_confidence_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_low_confidence_log'
    AND policyname = 'Authenticated users can insert low confidence logs'
  ) THEN
    CREATE POLICY "Authenticated users can insert low confidence logs"
      ON public.teleprompter_low_confidence_log
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_low_confidence_log'
    AND policyname = 'Authenticated users can read low confidence logs'
  ) THEN
    CREATE POLICY "Authenticated users can read low confidence logs"
      ON public.teleprompter_low_confidence_log
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── Suggestion Feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teleprompter_suggestion_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  suggestion_id text,
  suggestion_text text NOT NULL,
  next_agent_line text,
  usage_signal text CHECK (usage_signal IN ('used', 'modified', 'ignored')),
  source text CHECK (source IN ('llm', 'objection_library', 'static_fallback')),
  objection_id text,
  script_id text,
  lead_id text,
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE public.teleprompter_suggestion_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_suggestion_feedback'
    AND policyname = 'Authenticated users can insert suggestion feedback'
  ) THEN
    CREATE POLICY "Authenticated users can insert suggestion feedback"
      ON public.teleprompter_suggestion_feedback
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_suggestion_feedback'
    AND policyname = 'Authenticated users can read suggestion feedback'
  ) THEN
    CREATE POLICY "Authenticated users can read suggestion feedback"
      ON public.teleprompter_suggestion_feedback
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── Call Summaries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teleprompter_call_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  lead_id text,
  lead_address text,
  contact_name text,
  script_id text,
  outcome text,
  duration_seconds integer DEFAULT 0,
  agent_name text,
  summary text,
  objections text[] DEFAULT '{}',
  objection_handling text,
  next_step text,
  homeowner_sentiment text CHECK (homeowner_sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  key_topics_covered text[] DEFAULT '{}',
  transcript_length integer DEFAULT 0,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE public.teleprompter_call_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_call_summaries'
    AND policyname = 'Authenticated users can insert call summaries'
  ) THEN
    CREATE POLICY "Authenticated users can insert call summaries"
      ON public.teleprompter_call_summaries
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'teleprompter_call_summaries'
    AND policyname = 'Authenticated users can read call summaries'
  ) THEN
    CREATE POLICY "Authenticated users can read call summaries"
      ON public.teleprompter_call_summaries
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_low_confidence_session ON public.teleprompter_low_confidence_log(session_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_session ON public.teleprompter_suggestion_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_lead ON public.teleprompter_suggestion_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_script ON public.teleprompter_suggestion_feedback(script_id);
CREATE INDEX IF NOT EXISTS idx_call_summaries_session ON public.teleprompter_call_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_call_summaries_lead ON public.teleprompter_call_summaries(lead_id);
