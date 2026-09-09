-- ─── Call Quality Scores ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id UUID,
  call_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  -- Quality dimensions (0-100)
  pace_score INTEGER DEFAULT 0 CHECK (pace_score BETWEEN 0 AND 100),
  objection_handling_score INTEGER DEFAULT 0 CHECK (objection_handling_score BETWEEN 0 AND 100),
  close_trigger_score INTEGER DEFAULT 0 CHECK (close_trigger_score BETWEEN 0 AND 100),
  rapport_score INTEGER DEFAULT 0 CHECK (rapport_score BETWEEN 0 AND 100),
  overall_score INTEGER GENERATED ALWAYS AS (
    (pace_score + objection_handling_score + close_trigger_score + rapport_score) / 4
  ) STORED,
  -- Coaching notes
  strengths TEXT[] DEFAULT '{}',
  improvement_areas TEXT[] DEFAULT '{}',
  coaching_notes TEXT,
  ai_feedback TEXT,
  outcome TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.call_quality_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'call_quality_scores' AND policyname = 'Users can manage call quality scores') THEN
    CREATE POLICY "Users can manage call quality scores"
      ON public.call_quality_scores FOR ALL
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_quality_agent ON public.call_quality_scores(agent_name);
CREATE INDEX IF NOT EXISTS idx_call_quality_date ON public.call_quality_scores(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_quality_session ON public.call_quality_scores(session_id);

-- ─── Analytics Export Schedules (extended for call analytics) ─────────────────
-- Add report_type column to export_schedules if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'export_schedules' AND column_name = 'report_type'
  ) THEN
    ALTER TABLE public.export_schedules ADD COLUMN report_type TEXT DEFAULT 'leads';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'export_schedules' AND column_name = 'threshold_config'
  ) THEN
    ALTER TABLE public.export_schedules ADD COLUMN threshold_config JSONB DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'export_schedules' AND column_name = 'date_range'
  ) THEN
    ALTER TABLE public.export_schedules ADD COLUMN date_range TEXT DEFAULT '30d';
  END IF;
END $$;

-- ─── Lead Auto-Assignment Rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  -- Matching criteria
  min_ai_score INTEGER DEFAULT 0,
  max_ai_score INTEGER DEFAULT 100,
  regions TEXT[] DEFAULT '{}',
  expertise_tags TEXT[] DEFAULT '{}',
  lead_stages TEXT[] DEFAULT '{}',
  -- Assignment target
  target_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_agent_name TEXT,
  max_workload INTEGER DEFAULT 50,
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lead_assignment_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignment_rules' AND policyname = 'Users can manage assignment rules') THEN
    CREATE POLICY "Users can manage assignment rules"
      ON public.lead_assignment_rules FOR ALL
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── Lead Assignment Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_assignment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  lead_address TEXT,
  assigned_to_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_agent_name TEXT,
  rule_id UUID REFERENCES public.lead_assignment_rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  ai_score INTEGER,
  region TEXT,
  reason TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lead_assignment_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignment_log' AND policyname = 'Users can view assignment log') THEN
    CREATE POLICY "Users can view assignment log"
      ON public.lead_assignment_log FOR ALL
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignment_log_lead ON public.lead_assignment_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_assignment_log_agent ON public.lead_assignment_log(assigned_to_agent_name);
CREATE INDEX IF NOT EXISTS idx_assignment_log_date ON public.lead_assignment_log(assigned_at DESC);
