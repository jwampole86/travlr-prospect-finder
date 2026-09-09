-- ─── TRAVLR Candidate Resume & Interview Upgrade ─────────────────────────────
-- Adds: candidates table, resume storage, interview notes, scorecard, audit events

-- ─── 1. ENUMS ─────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.candidate_status_enum CASCADE;
CREATE TYPE public.candidate_status_enum AS ENUM (
  'RESUME_UPLOADED',
  'PROCESSING',
  'READY_TO_INTERVIEW',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'FOLLOW_UP',
  'SECOND_INTERVIEW',
  'HOLD',
  'NOT_MOVING_FORWARD',
  'HIRED'
);

DROP TYPE IF EXISTS public.interview_priority_enum CASCADE;
CREATE TYPE public.interview_priority_enum AS ENUM (
  'HIGHEST',
  'VERY_HIGH',
  'HIGH',
  'VERY_STRONG',
  'STRONG_SECONDARY',
  'SOLID_MID_TIER',
  'STANDARD'
);

DROP TYPE IF EXISTS public.experience_strength_enum CASCADE;
CREATE TYPE public.experience_strength_enum AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'NONE',
  'UNKNOWN'
);

-- ─── 2. CANDIDATES TABLE ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,

  -- Resume file
  resume_file_name TEXT,
  resume_file_path TEXT,
  resume_raw_text TEXT,
  resume_parsed_at TIMESTAMPTZ,
  resume_version INTEGER DEFAULT 1,

  -- Professional summary
  professional_summary TEXT,
  current_title TEXT,
  current_company TEXT,

  -- Structured resume data (JSONB)
  work_experience JSONB DEFAULT '[]'::jsonb,
  education JSONB DEFAULT '[]'::jsonb,
  skills JSONB DEFAULT '[]'::jsonb,
  certifications JSONB DEFAULT '[]'::jsonb,
  relevant_systems JSONB DEFAULT '[]'::jsonb,

  -- Years of experience
  years_total_experience NUMERIC(4,1),
  years_sales_experience NUMERIC(4,1),
  years_property_management_experience NUMERIC(4,1),
  years_vacation_rental_experience NUMERIC(4,1),
  years_business_development_experience NUMERIC(4,1),
  years_phone_sales_experience NUMERIC(4,1),

  -- Boolean experience flags
  vacation_rental_experience BOOLEAN DEFAULT false,
  property_management_experience BOOLEAN DEFAULT false,
  luxury_experience BOOLEAN DEFAULT false,
  homeowner_facing_experience BOOLEAN DEFAULT false,
  outbound_calling_experience BOOLEAN DEFAULT false,
  closing_experience BOOLEAN DEFAULT false,
  crm_experience BOOLEAN DEFAULT false,
  lead_generation_experience BOOLEAN DEFAULT false,
  operations_experience BOOLEAN DEFAULT false,
  leadership_experience BOOLEAN DEFAULT false,

  -- Evidence-based classifications (JSONB array of {category, strength, evidence[]})
  experience_classifications JSONB DEFAULT '[]'::jsonb,

  -- Strengths / concerns / highlights
  strengths JSONB DEFAULT '[]'::jsonb,
  concerns JSONB DEFAULT '[]'::jsonb,
  resume_highlights JSONB DEFAULT '[]'::jsonb,

  -- Ranking & priority
  candidate_rank INTEGER,
  interview_priority public.interview_priority_enum DEFAULT 'STANDARD',

  -- Anthropic analysis
  anthropic_analysis JSONB,
  analysis_version INTEGER DEFAULT 0,
  analysis_generated_at TIMESTAMPTZ,

  -- Interview script
  interview_script JSONB,
  interview_script_version INTEGER DEFAULT 0,
  script_generated_at TIMESTAMPTZ,
  script_prompt_version TEXT DEFAULT '1.0',
  script_model TEXT DEFAULT 'claude-sonnet-4-6',

  -- Status
  candidate_status public.candidate_status_enum DEFAULT 'RESUME_UPLOADED',

  -- Seed / evaluation context (admin-editable)
  seed_fit_notes TEXT,
  seed_concerns TEXT,

  -- Duplicate detection
  possible_duplicate_of UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  duplicate_status TEXT DEFAULT 'UNIQUE' CHECK (duplicate_status IN ('UNIQUE', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE', 'MERGED')),

  -- Audit
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. INTERVIEW NOTES TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_interview_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  question_id TEXT,
  question_text TEXT,
  note_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. INTERVIEW SCORECARD TABLE ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interview_date TIMESTAMPTZ DEFAULT now(),

  -- 20 competency scores (1-10)
  vacation_rental_knowledge INTEGER CHECK (vacation_rental_knowledge BETWEEN 1 AND 10),
  property_management_knowledge INTEGER CHECK (property_management_knowledge BETWEEN 1 AND 10),
  luxury_homeowner_communication INTEGER CHECK (luxury_homeowner_communication BETWEEN 1 AND 10),
  outbound_calling_ability INTEGER CHECK (outbound_calling_ability BETWEEN 1 AND 10),
  consultative_sales INTEGER CHECK (consultative_sales BETWEEN 1 AND 10),
  discovery_questioning INTEGER CHECK (discovery_questioning BETWEEN 1 AND 10),
  objection_handling INTEGER CHECK (objection_handling BETWEEN 1 AND 10),
  closing_ability INTEGER CHECK (closing_ability BETWEEN 1 AND 10),
  follow_up_discipline INTEGER CHECK (follow_up_discipline BETWEEN 1 AND 10),
  crm_pipeline_management INTEGER CHECK (crm_pipeline_management BETWEEN 1 AND 10),
  relationship_building INTEGER CHECK (relationship_building BETWEEN 1 AND 10),
  professional_communication INTEGER CHECK (professional_communication BETWEEN 1 AND 10),
  self_motivation INTEGER CHECK (self_motivation BETWEEN 1 AND 10),
  remote_work_discipline INTEGER CHECK (remote_work_discipline BETWEEN 1 AND 10),
  coachability INTEGER CHECK (coachability BETWEEN 1 AND 10),
  operational_understanding INTEGER CHECK (operational_understanding BETWEEN 1 AND 10),
  business_development INTEGER CHECK (business_development BETWEEN 1 AND 10),
  judgment INTEGER CHECK (judgment BETWEEN 1 AND 10),
  organization INTEGER CHECK (organization BETWEEN 1 AND 10),
  overall_fit INTEGER CHECK (overall_fit BETWEEN 1 AND 10),

  -- Post-interview AI summary
  ai_summary JSONB,
  ai_summary_generated_at TIMESTAMPTZ,

  -- Interviewer notes
  interviewer_notes TEXT,
  hire_recommendation TEXT CHECK (hire_recommendation IN ('STRONG_YES', 'YES', 'MAYBE', 'NO', 'PENDING')),

  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 5. CANDIDATE AUDIT EVENTS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 6. INDEXES ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON public.candidates(full_name);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON public.candidates(email);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates(candidate_status);
CREATE INDEX IF NOT EXISTS idx_candidates_rank ON public.candidates(candidate_rank ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_candidates_priority ON public.candidates(interview_priority);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_notes_candidate ON public.candidate_interview_notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_scorecards_candidate ON public.candidate_scorecards(candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_candidate ON public.candidate_audit_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON public.candidate_audit_events(event_type);

-- ─── 7. UPDATED_AT TRIGGERS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_candidates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS candidates_updated_at ON public.candidates;
CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_candidates_updated_at();

CREATE OR REPLACE FUNCTION public.update_candidate_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS candidate_notes_updated_at ON public.candidate_interview_notes;
CREATE TRIGGER candidate_notes_updated_at
  BEFORE UPDATE ON public.candidate_interview_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_candidate_notes_updated_at();

CREATE OR REPLACE FUNCTION public.update_candidate_scorecards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS candidate_scorecards_updated_at ON public.candidate_scorecards;
CREATE TRIGGER candidate_scorecards_updated_at
  BEFORE UPDATE ON public.candidate_scorecards
  FOR EACH ROW EXECUTE FUNCTION public.update_candidate_scorecards_updated_at();

-- ─── 8. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_interview_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_candidates" ON public.candidates;
CREATE POLICY "authenticated_manage_candidates"
ON public.candidates FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_interview_notes" ON public.candidate_interview_notes;
CREATE POLICY "authenticated_manage_interview_notes"
ON public.candidate_interview_notes FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_scorecards" ON public.candidate_scorecards;
CREATE POLICY "authenticated_manage_scorecards"
ON public.candidate_scorecards FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_candidate_audit" ON public.candidate_audit_events;
CREATE POLICY "authenticated_manage_candidate_audit"
ON public.candidate_audit_events FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ─── 9. SEED 8 CANDIDATES ─────────────────────────────────────────────────────

DO $$
BEGIN
  -- Kelli Winkel
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Kelli', 'Winkel', 'Kelli Winkel', 1, 'HIGHEST',
    'READY_TO_INTERVIEW',
    '20+ years luxury vacation rental/property management experience. Direct business-development experience recruiting homeowners into vacation-rental programs. Strong full-cycle sales / consultative selling / homeowner relationship experience.',
    'Remote / Florida location is fine but validate availability and expectations.',
    true, true, true, true, true, true, true, true, true
  ) ON CONFLICT DO NOTHING;

  -- Brett Allen
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Brett', 'Allen', 'Brett Allen', 2, 'VERY_HIGH',
    'READY_TO_INTERVIEW',
    'Excellent STR operations and leadership background. Deep understanding of high-end short-term rental operations and owners.',
    'More operations-heavy than pure outbound homeowner acquisition.',
    true, true, true, true, false, false, true, true, true
  ) ON CONFLICT DO NOTHING;

  -- Gina L. Mattivello
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Gina', 'Mattivello', 'Gina L. Mattivello', 3, 'VERY_HIGH',
    'READY_TO_INTERVIEW',
    'Outstanding phone-based sales experience. High-volume outbound calling. Discovery. Objection handling. Pipeline management. Phone closing.',
    'Less direct luxury STR/homeowner experience.',
    false, false, false, false, true, true, true, false, false
  ) ON CONFLICT DO NOTHING;

  -- Karissa Crooks
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Karissa', 'Crooks', 'Karissa Crooks', 4, 'HIGH',
    'READY_TO_INTERVIEW',
    'Vacation-rental/property-management experience. Owner lead CRM experience. Owner onboarding. Revenue management. Real-estate/new-home sales experience.',
    'Validate comfort with sustained high-volume outbound prospecting.',
    true, true, false, true, false, true, true, false, true
  ) ON CONFLICT DO NOTHING;

  -- Caitlyn Sorrells
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Caitlyn', 'Sorrells', 'Caitlyn Sorrells', 5, 'HIGH',
    'READY_TO_INTERVIEW',
    'Corporate housing/property management. Lead generation. B2B calls. Inventory building. Owner/guest relationship experience. Multi-line phone experience.',
    'Background may be more operational/administrative than pure business development.',
    false, true, false, true, true, false, true, true, true
  ) ON CONFLICT DO NOTHING;

  -- Margo Johnson
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Margo', 'Johnson', 'Margo Johnson', 6, 'VERY_STRONG',
    'READY_TO_INTERVIEW',
    'Very strong outbound business development. High-call-volume experience. Full-cycle B2B sales. CRM expertise. Real-estate industry exposure.',
    'Less luxury vacation-rental/homeowner-specific experience.',
    false, false, false, false, true, true, true, false, false
  ) ON CONFLICT DO NOTHING;

  -- Jessica Thrasher
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Jessica', 'Thrasher', 'Jessica Thrasher', 7, 'STRONG_SECONDARY',
    'READY_TO_INTERVIEW',
    'Real estate. Property management. Cold calling. Client needs analysis. Marketing.',
    'Outbound homeowner acquisition has not been the primary focus of her career.',
    false, true, false, true, true, false, false, false, false
  ) ON CONFLICT DO NOTHING;

  -- Darlene Ciao
  INSERT INTO public.candidates (
    first_name, last_name, full_name, candidate_rank, interview_priority,
    candidate_status, seed_fit_notes, seed_concerns,
    vacation_rental_experience, property_management_experience, luxury_experience,
    homeowner_facing_experience, outbound_calling_experience, closing_experience,
    crm_experience, leadership_experience, operations_experience
  ) VALUES (
    'Darlene', 'Ciao', 'Darlene Ciao', 8, 'SOLID_MID_TIER',
    'READY_TO_INTERVIEW',
    'Phone sales. Consultative selling. Client outreach. Retention. Inside sales. Prospecting. CRM experience.',
    'Less luxury real-estate / STR-specific experience.',
    false, false, false, false, true, true, true, false, false
  ) ON CONFLICT DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Candidate seed failed: %', SQLERRM;
END $$;
