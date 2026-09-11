UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T17:45:00Z'::timestamptz,
    scheduled_local_date = '2026-09-11'::date,
    scheduled_local_time = '10:45:00'::time,
    scheduled_timezone = 'America/Los_Angeles',
    duration_minutes = 25,
    notes = 'Rescheduled Friday: 11:45 AM MDT / 10:45 AM PDT',
    updated_at = now()
WHERE candidate_name = 'Darlene Ciao';
