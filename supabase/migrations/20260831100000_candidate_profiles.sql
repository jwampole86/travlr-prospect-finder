-- Candidate Profiles: store interview notes, responses, scores, follow-up status
-- Linked to interview sessions from the teleprompter interview mode

CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  candidate_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_title TEXT NOT NULL,
  interview_date TIMESTAMPTZ DEFAULT now(),
  duration_seconds INTEGER DEFAULT 0,
  overall_score TEXT CHECK (overall_score IN ('strong_yes', 'yes', 'maybe', 'no')) DEFAULT NULL,
  notes TEXT DEFAULT '',
  follow_up_status TEXT NOT NULL DEFAULT 'pending' CHECK (follow_up_status IN ('pending', 'scheduled', 'completed', 'rejected', 'hired')),
  questions_covered INTEGER DEFAULT 0,
  questions_total INTEGER DEFAULT 0,
  transcript JSONB DEFAULT '[]'::jsonb,
  ai_suggestions JSONB DEFAULT '[]'::jsonb,
  question_checklist JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_created_by ON public.candidate_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_role_id ON public.candidate_profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_follow_up_status ON public.candidate_profiles(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_interview_date ON public.candidate_profiles(interview_date DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_overall_score ON public.candidate_profiles(overall_score);

ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_candidate_profiles" ON public.candidate_profiles;
CREATE POLICY "authenticated_manage_candidate_profiles"
ON public.candidate_profiles
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_candidate_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_profiles_updated_at ON public.candidate_profiles;
CREATE TRIGGER candidate_profiles_updated_at
  BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_candidate_profiles_updated_at();
