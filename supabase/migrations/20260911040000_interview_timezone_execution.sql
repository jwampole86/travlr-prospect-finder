ALTER TABLE public.interview_sessions
  ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_local_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_local_time TIME,
  ADD COLUMN IF NOT EXISTS scheduled_timezone TEXT,
  ADD COLUMN IF NOT EXISTS auto_start_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_start_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_start_enabled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_error TEXT,
  ADD COLUMN IF NOT EXISTS last_execution_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS interview_sessions_auto_execution_idx
  ON public.interview_sessions (auto_start_enabled, scheduled_at, execution_status);

UPDATE public.interview_sessions
SET scheduled_local_date = (scheduled_at AT TIME ZONE 'America/Denver')::date,
    scheduled_local_time = (scheduled_at AT TIME ZONE 'America/Denver')::time,
    scheduled_timezone = COALESCE(scheduled_timezone, 'America/Denver')
WHERE scheduled_local_date IS NULL OR scheduled_local_time IS NULL OR scheduled_timezone IS NULL;

-- Preserve the candidate-local meaning of the existing calendar slots. These
-- values are explicit because the original seed stored UTC instants and notes,
-- but did not store an IANA timezone.
UPDATE public.interview_sessions
SET scheduled_local_date = (scheduled_at AT TIME ZONE timezone_name)::date,
    scheduled_local_time = (scheduled_at AT TIME ZONE timezone_name)::time,
    scheduled_timezone = timezone_name
FROM (
  VALUES
    ('Kelli Winkel', 'America/New_York'),
    ('Caitlyn Sorrells', 'America/Chicago'),
    ('Karissa Crooks', 'America/New_York'),
    ('Jessica Thrasher', 'America/New_York'),
    ('Gina Mattivello', 'America/New_York'),
    ('Margo Johnson', 'America/New_York'),
    ('Darlene Ciao', 'America/Los_Angeles'),
    ('Brett Allen', 'America/New_York')
) AS timezone_map(candidate_name, timezone_name)
WHERE public.interview_sessions.candidate_name = timezone_map.candidate_name;

UPDATE public.interview_sessions AS sessions
SET candidate_id = candidates.id
FROM public.candidates AS candidates
WHERE sessions.candidate_id IS NULL
  AND sessions.candidate_name = candidates.full_name;

UPDATE public.interview_sessions AS sessions
SET candidate_id = candidates.id
FROM public.candidates AS candidates
WHERE sessions.candidate_id IS NULL
  AND sessions.candidate_name = 'Gina Mattivello'
  AND candidates.full_name = 'Gina L. Mattivello';