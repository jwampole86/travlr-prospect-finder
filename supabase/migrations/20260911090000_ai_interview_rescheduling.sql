CREATE TABLE IF NOT EXISTS public.interview_schedule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  previous_scheduled_at TIMESTAMPTZ NOT NULL,
  previous_local_date DATE,
  previous_local_time TIME,
  previous_timezone TEXT,
  new_scheduled_at TIMESTAMPTZ NOT NULL,
  new_local_date DATE NOT NULL,
  new_local_time TIME NOT NULL,
  new_timezone TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by_type TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_call_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_schedule_history_interview_idx
  ON public.interview_schedule_history(interview_id, created_at DESC);

ALTER TABLE public.interview_schedule_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_interview_schedule_history" ON public.interview_schedule_history;
CREATE POLICY "authenticated_read_interview_schedule_history"
  ON public.interview_schedule_history FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.reschedule_interview_atomically(
  p_interview_id UUID,
  p_new_scheduled_at TIMESTAMPTZ,
  p_new_local_date DATE,
  p_new_local_time TIME,
  p_new_timezone TEXT,
  p_reason TEXT DEFAULT 'CANDIDATE_REQUESTED_RESCHEDULE',
  p_changed_by_type TEXT DEFAULT 'VAPI_AI_ASSISTANT',
  p_provider_call_id TEXT DEFAULT NULL,
  p_buffer_minutes INTEGER DEFAULT 5
)
RETURNS TABLE(ok BOOLEAN, reason TEXT, scheduled_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_session public.interview_sessions%ROWTYPE;
  conflict_exists BOOLEAN;
BEGIN
  SELECT * INTO current_session
  FROM public.interview_sessions
  WHERE id = p_interview_id
  FOR UPDATE;

  IF current_session.id IS NULL THEN
    RETURN QUERY SELECT false, 'INTERVIEW_NOT_FOUND'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF current_session.status NOT IN ('in_progress', 'scheduled', 'cancelled') THEN
    RETURN QUERY SELECT false, 'INTERVIEW_NOT_RESCHEDULABLE'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF p_new_scheduled_at <= now() + interval '30 minutes' THEN
    RETURN QUERY SELECT false, 'SLOT_TOO_SOON'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.interview_sessions other
    WHERE other.id <> p_interview_id
      AND other.status IN ('scheduled', 'in_progress')
      AND p_new_scheduled_at < other.scheduled_at + make_interval(mins => other.duration_minutes + p_buffer_minutes)
      AND p_new_scheduled_at + make_interval(mins => current_session.duration_minutes + p_buffer_minutes) > other.scheduled_at
  ) INTO conflict_exists;

  IF conflict_exists THEN
    RETURN QUERY SELECT false, 'SLOT_NO_LONGER_AVAILABLE'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO public.interview_schedule_history (
    interview_id, candidate_id, previous_scheduled_at, previous_local_date,
    previous_local_time, previous_timezone, new_scheduled_at, new_local_date,
    new_local_time, new_timezone, reason, changed_by_type, provider_call_id
  ) VALUES (
    current_session.id, current_session.candidate_id, current_session.scheduled_at,
    current_session.scheduled_local_date, current_session.scheduled_local_time,
    current_session.scheduled_timezone, p_new_scheduled_at, p_new_local_date,
    p_new_local_time, p_new_timezone, p_reason, p_changed_by_type,
    COALESCE(p_provider_call_id, current_session.provider_call_id)
  );

  UPDATE public.interview_sessions
  SET scheduled_at = p_new_scheduled_at,
      scheduled_local_date = p_new_local_date,
      scheduled_local_time = p_new_local_time,
      scheduled_timezone = p_new_timezone,
      status = 'scheduled',
      auto_start_enabled = true,
      auto_start_enabled_at = now(),
      execution_status = 'QUEUED',
      execution_claimed_at = NULL,
      execution_started_at = NULL,
      execution_error = NULL,
      last_execution_attempt_at = NULL,
      provider_call_id = NULL,
      started_at = NULL,
      ended_at = NULL,
      duration_seconds = NULL,
      ended_reason = 'CANDIDATE_RESCHEDULED',
      updated_at = now()
  WHERE id = p_interview_id;

  RETURN QUERY SELECT true, 'RESCHEDULED'::TEXT, p_new_scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_interview_atomically(UUID, TIMESTAMPTZ, DATE, TIME, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_interview_atomically(UUID, TIMESTAMPTZ, DATE, TIME, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
