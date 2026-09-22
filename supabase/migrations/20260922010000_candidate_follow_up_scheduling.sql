ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'initial_interview'
    CHECK (session_type IN ('initial_interview', 'candidate_follow_up')),
  ADD COLUMN IF NOT EXISTS source_interview_id UUID REFERENCES public.interview_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interviewer_email TEXT;

CREATE INDEX IF NOT EXISTS interview_sessions_source_interview_idx
  ON public.interview_sessions (source_interview_id);
