-- Keep the September 10-11 Outreach & BD interview schedule aligned with confirmed times.

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-10T15:00:00Z'::timestamptz,
    notes = 'Thursday: 10:00 AM Central / 11:00 AM Eastern',
    updated_at = now()
WHERE candidate_name = 'Kelli Winkel';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-10T16:30:00Z'::timestamptz,
    notes = 'Thursday: 11:30 AM Central / 12:30 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Caitlyn Sorrells';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-10T17:00:00Z'::timestamptz,
    notes = 'Thursday: 1:00 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Karissa Crooks';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-10T18:00:00Z'::timestamptz,
    notes = 'Thursday: 2:00 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Jessica Thrasher';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-10T20:00:00Z'::timestamptz,
    notes = 'Thursday: 4:00 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Gina Mattivello';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T17:30:00Z'::timestamptz,
    notes = 'Friday: 10:30 AM Pacific / 1:30 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Darlene Ciao';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T18:30:00Z'::timestamptz,
    notes = 'Friday: 2:30 PM Eastern',
    updated_at = now()
WHERE candidate_name = 'Brett Allen';

INSERT INTO public.interview_sessions
  (candidate_name, role_id, role_title, scheduled_at, duration_minutes, status, notes)
SELECT
  'Margo Johnson',
  'candidate_margo_johnson',
  'Margo Johnson — Prospect Finder',
  '2026-09-11T13:30:00Z'::timestamptz,
  60,
  'scheduled',
  'Friday: 9:30 AM Eastern'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.interview_sessions
  WHERE candidate_name = 'Margo Johnson'
    AND scheduled_at::date = '2026-09-11'::date
);