-- ─── TRAVLR Interview Mode Phase 2 ───────────────────────────────────────────
-- Adds: consistency_reports, pipeline_status_audit, interview_records,
--       candidate_qa_results, scorecard average calculation, pipeline fields

-- ─── 1. ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_status_enum') THEN
    CREATE TYPE public.pipeline_status_enum AS ENUM (
      'READY_TO_INTERVIEW',
      'INTERVIEWED',
      'FOLLOW_UP',
      'HOLD',
      'MOVE_FORWARD',
      'NOT_MOVING_FORWARD',
      'HIRED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consistency_status_enum') THEN
    CREATE TYPE public.consistency_status_enum AS ENUM (
      'VALIDATED',
      'PARTIALLY_VALIDATED',
      'NOT_YET_VALIDATED',
      'NEEDS_CLARIFICATION'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qa_status_enum') THEN
    CREATE TYPE public.qa_status_enum AS ENUM (
      'PASS',
      'WARN',
      'FAIL'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_type_enum') THEN
    CREATE TYPE public.interview_type_enum AS ENUM (
      'FIRST',
      'SECOND',
      'FINAL',
      'OTHER'
    );
  END IF;
END $$;

-- ─── 2. ADD PIPELINE FIELDS TO CANDIDATES ────────────────────────────────────

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'READY_TO_INTERVIEW',
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS first_interview_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_interview_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_interview_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_interview_type TEXT DEFAULT 'FIRST',
  ADD COLUMN IF NOT EXISTS interview_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_scorecard_average NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS average_score_across_interviews NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS top_strength TEXT,
  ADD COLUMN IF NOT EXISTS main_area_to_validate TEXT,
  ADD COLUMN IF NOT EXISTS consistency_report_status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS assigned_interviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- ─── 3. INTERVIEW RECORDS TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  interview_type TEXT DEFAULT 'FIRST',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  scorecard_id UUID,
  notes_summary TEXT,
  consistency_report_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON public.candidate_interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_completed ON public.candidate_interviews(completed_at DESC NULLS LAST);

-- ─── 4. CONSISTENCY REPORTS TABLE ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_consistency_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interview_id UUID REFERENCES public.candidate_interviews(id) ON DELETE SET NULL,
  scorecard_id UUID REFERENCES public.candidate_scorecards(id) ON DELETE SET NULL,

  -- Versioning
  resume_version INTEGER DEFAULT 1,
  prompt_version TEXT DEFAULT '1.0',
  model TEXT DEFAULT 'claude-sonnet-4-6',
  report_version INTEGER DEFAULT 1,

  -- Report content (structured JSON)
  executive_summary TEXT,
  validated_claims JSONB DEFAULT '[]'::jsonb,
  partially_validated_claims JSONB DEFAULT '[]'::jsonb,
  not_yet_validated JSONB DEFAULT '[]'::jsonb,
  needs_clarification JSONB DEFAULT '[]'::jsonb,
  new_information JSONB DEFAULT '[]'::jsonb,
  unanswered_questions JSONB DEFAULT '[]'::jsonb,
  role_gaps JSONB DEFAULT '[]'::jsonb,
  strongest_interview_evidence JSONB DEFAULT '[]'::jsonb,
  next_step_topics JSONB DEFAULT '[]'::jsonb,
  second_interview_questions JSONB DEFAULT '[]'::jsonb,

  -- Status
  generation_status TEXT DEFAULT 'PENDING' CHECK (generation_status IN ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED')),
  generation_error TEXT,

  -- Admin edits
  admin_edits JSONB DEFAULT '{}'::jsonb,

  -- Audit
  generated_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consistency_reports_candidate ON public.candidate_consistency_reports(candidate_id);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_status ON public.candidate_consistency_reports(generation_status);

-- ─── 5. PIPELINE STATUS AUDIT TABLE ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_pipeline_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_candidate ON public.candidate_pipeline_audit(candidate_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_changed_at ON public.candidate_pipeline_audit(changed_at DESC);

-- ─── 6. CANDIDATE QA RESULTS TABLE ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_qa_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ DEFAULT now(),

  -- QA metrics
  resume_parsed BOOLEAN DEFAULT false,
  specific_questions_count INTEGER DEFAULT 0,
  evidence_backed_count INTEGER DEFAULT 0,
  missing_evidence_count INTEGER DEFAULT 0,
  near_duplicate_count INTEGER DEFAULT 0,
  cross_candidate_leakage BOOLEAN DEFAULT false,
  personalization_pct NUMERIC(5,2) DEFAULT 0,
  qa_status TEXT DEFAULT 'PENDING' CHECK (qa_status IN ('PENDING', 'PASS', 'WARN', 'FAIL')),

  -- Detail
  core_questions_count INTEGER DEFAULT 0,
  candidate_specific_questions JSONB DEFAULT '[]'::jsonb,
  duplicate_matches JSONB DEFAULT '[]'::jsonb,
  leakage_details JSONB DEFAULT '[]'::jsonb,
  warn_reasons JSONB DEFAULT '[]'::jsonb,
  fail_reasons JSONB DEFAULT '[]'::jsonb,

  -- Versioning
  prompt_version TEXT DEFAULT '2.0',
  resume_version INTEGER DEFAULT 1,
  model TEXT DEFAULT 'claude-sonnet-4-6',

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_results_candidate ON public.candidate_qa_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_qa_results_run_at ON public.candidate_qa_results(run_at DESC);

-- ─── 7. SCORECARD AVERAGE CALCULATION FUNCTION ───────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_scorecard_average(p_scorecard_id UUID)
RETURNS NUMERIC(4,2) LANGUAGE plpgsql AS $$
DECLARE
  v_avg NUMERIC(4,2);
BEGIN
  SELECT ROUND(
    (
      COALESCE(vacation_rental_knowledge, 0) * CASE WHEN vacation_rental_knowledge IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(property_management_knowledge, 0) * CASE WHEN property_management_knowledge IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(luxury_homeowner_communication, 0) * CASE WHEN luxury_homeowner_communication IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(outbound_calling_ability, 0) * CASE WHEN outbound_calling_ability IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(consultative_sales, 0) * CASE WHEN consultative_sales IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(discovery_questioning, 0) * CASE WHEN discovery_questioning IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(objection_handling, 0) * CASE WHEN objection_handling IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(closing_ability, 0) * CASE WHEN closing_ability IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(follow_up_discipline, 0) * CASE WHEN follow_up_discipline IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(crm_pipeline_management, 0) * CASE WHEN crm_pipeline_management IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(relationship_building, 0) * CASE WHEN relationship_building IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(professional_communication, 0) * CASE WHEN professional_communication IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(self_motivation, 0) * CASE WHEN self_motivation IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(remote_work_discipline, 0) * CASE WHEN remote_work_discipline IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(coachability, 0) * CASE WHEN coachability IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(operational_understanding, 0) * CASE WHEN operational_understanding IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(business_development, 0) * CASE WHEN business_development IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(judgment, 0) * CASE WHEN judgment IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(organization, 0) * CASE WHEN organization IS NOT NULL THEN 1 ELSE 0 END +
      COALESCE(overall_fit, 0) * CASE WHEN overall_fit IS NOT NULL THEN 1 ELSE 0 END
    )::NUMERIC /
    NULLIF(
      (CASE WHEN vacation_rental_knowledge IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN property_management_knowledge IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN luxury_homeowner_communication IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN outbound_calling_ability IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN consultative_sales IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN discovery_questioning IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN objection_handling IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN closing_ability IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN follow_up_discipline IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN crm_pipeline_management IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN relationship_building IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN professional_communication IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN self_motivation IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN remote_work_discipline IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN coachability IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN operational_understanding IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN business_development IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN judgment IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN organization IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN overall_fit IS NOT NULL THEN 1 ELSE 0 END),
      0
    ), 2
  )
  INTO v_avg
  FROM public.candidate_scorecards
  WHERE id = p_scorecard_id;

  RETURN v_avg;
END;
$$;

-- ─── 8. UPDATED_AT TRIGGERS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_interviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS interviews_updated_at ON public.candidate_interviews;
CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON public.candidate_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_interviews_updated_at();

CREATE OR REPLACE FUNCTION public.update_consistency_reports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS consistency_reports_updated_at ON public.candidate_consistency_reports;
CREATE TRIGGER consistency_reports_updated_at
  BEFORE UPDATE ON public.candidate_consistency_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_consistency_reports_updated_at();

-- ─── 9. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_consistency_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_pipeline_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_qa_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_interviews" ON public.candidate_interviews;
CREATE POLICY "authenticated_manage_interviews"
ON public.candidate_interviews FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_consistency_reports" ON public.candidate_consistency_reports;
CREATE POLICY "authenticated_manage_consistency_reports"
ON public.candidate_consistency_reports FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_pipeline_audit" ON public.candidate_pipeline_audit;
CREATE POLICY "authenticated_manage_pipeline_audit"
ON public.candidate_pipeline_audit FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_qa_results" ON public.candidate_qa_results;
CREATE POLICY "authenticated_manage_qa_results"
ON public.candidate_qa_results FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ─── 10. BACKFILL PIPELINE STATUS FROM CANDIDATE STATUS ──────────────────────

UPDATE public.candidates
SET pipeline_status = CASE
  WHEN candidate_status = 'READY_TO_INTERVIEW' THEN 'READY_TO_INTERVIEW'
  WHEN candidate_status = 'INTERVIEW_SCHEDULED' THEN 'READY_TO_INTERVIEW'
  WHEN candidate_status = 'INTERVIEWED' THEN 'INTERVIEWED'
  WHEN candidate_status = 'FOLLOW_UP' THEN 'FOLLOW_UP'
  WHEN candidate_status = 'SECOND_INTERVIEW' THEN 'FOLLOW_UP'
  WHEN candidate_status = 'HOLD' THEN 'HOLD'
  WHEN candidate_status = 'NOT_MOVING_FORWARD' THEN 'NOT_MOVING_FORWARD'
  WHEN candidate_status = 'HIRED' THEN 'HIRED'
  ELSE 'READY_TO_INTERVIEW'
END
WHERE pipeline_status IS NULL OR pipeline_status = 'READY_TO_INTERVIEW';
