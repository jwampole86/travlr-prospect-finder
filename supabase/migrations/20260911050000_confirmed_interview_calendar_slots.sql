-- Confirmed Interview Calendar slot updates. Awaiting-response candidates remain unchanged.
UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T20:00:00Z'::timestamptz,
    duration_minutes = 25,
    notes = 'Confirmed Friday: 4:00 PM ET / 2:00 PM MST',
    updated_at = now()
WHERE candidate_name = 'Kelli Winkel';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-14T18:30:00Z'::timestamptz,
    duration_minutes = 25,
    notes = 'Confirmed Monday: 2:30 PM ET / 12:30 PM MST',
    updated_at = now()
WHERE candidate_name = 'Margo Johnson';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T17:30:00Z'::timestamptz,
    duration_minutes = 25,
    notes = 'Confirmed Friday: 1:30 PM ET / 11:30 AM MST',
    updated_at = now()
WHERE candidate_name = 'Darlene Ciao';

UPDATE public.interview_sessions
SET scheduled_at = '2026-09-11T18:30:00Z'::timestamptz,
    duration_minutes = 25,
    notes = 'Confirmed Friday: 2:30 PM ET / 12:30 PM MST (pending)',
    updated_at = now()
WHERE candidate_name = 'Brett Allen';