-- AI candidate interviews are expected to take 20-25 minutes.
-- Keep a 25-minute numeric block for calendar integrations.
ALTER TABLE public.interview_sessions
  ALTER COLUMN duration_minutes SET DEFAULT 25;