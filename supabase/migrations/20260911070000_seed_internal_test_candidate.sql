DO $$
DECLARE
  test_candidate_id uuid;
  test_session_id uuid;
  test_scheduled_at timestamptz := now() + interval '1 hour';
BEGIN
  SELECT id INTO test_candidate_id
  FROM public.candidates
  WHERE full_name = 'TEST'
  LIMIT 1;

  IF test_candidate_id IS NULL THEN
    INSERT INTO public.candidates (
      first_name,
      last_name,
      full_name,
      phone,
      professional_summary,
      work_experience,
      skills,
      relevant_systems,
      strengths,
      concerns,
      resume_highlights,
      candidate_status
    ) VALUES (
      'TEST',
      '',
      'TEST',
      '+19498758622',
      'Internal TRAVLR AI interview test candidate. Do not evaluate or advance.',
      '[{"title":"Internal test candidate","evidence":["Use only to verify Vapi call routing, transcript capture, and admin summaries."]}]'::jsonb,
      '["Test candidate","Vapi AI interview"]'::jsonb,
      '["TRAVLR Prospect Finder"]'::jsonb,
      '["Internal testing only"]'::jsonb,
      '["Do not use for hiring decisions"]'::jsonb,
      '["Internal test record"]'::jsonb,
      'READY_TO_INTERVIEW'
    )
    RETURNING id INTO test_candidate_id;
  ELSE
    UPDATE public.candidates
    SET phone = '+19498758622',
        professional_summary = 'Internal TRAVLR AI interview test candidate. Do not evaluate or advance.',
        updated_at = now()
    WHERE id = test_candidate_id;
  END IF;

  SELECT id INTO test_session_id
  FROM public.interview_sessions
  WHERE candidate_name = 'TEST'
  ORDER BY created_at DESC
  LIMIT 1;

  IF test_session_id IS NULL THEN
    INSERT INTO public.interview_sessions (
      candidate_id,
      candidate_name,
      role_id,
      role_title,
      scheduled_at,
      scheduled_local_date,
      scheduled_local_time,
      scheduled_timezone,
      duration_minutes,
      status,
      auto_start_enabled,
      execution_status,
      notes
    ) VALUES (
      test_candidate_id,
      'TEST',
      'homeowner_outreach_agent',
      'TRAVLR AI Interview Test',
      test_scheduled_at,
      (test_scheduled_at AT TIME ZONE 'America/Denver')::date,
      (test_scheduled_at AT TIME ZONE 'America/Denver')::time,
      'America/Denver',
      25,
      'scheduled',
      false,
      null,
      'Internal test only. Auto-start disabled. Choose Start > AI Interview Assistant to place a test call to +19498758622.'
    );
  END IF;
END $$;
