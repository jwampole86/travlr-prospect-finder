-- ─── Seed initial Outreach & BD Agent interview schedule ─────────────────────
-- Adds the 7 candidate interviews already scheduled for Sept 10-11, 2026.

INSERT INTO public.interview_sessions
  (candidate_name, role_id, role_title, scheduled_at, duration_minutes, status, notes)
VALUES
  ('Kelli Winkel', 'candidate_kelli_winkel', 'Kelli Winkel — Prospect Finder',
   '2026-09-10T10:00:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 10:00 AM CST'),

  ('Karissa Crooks', 'candidate_karissa_crooks', 'Karissa Crooks — Prospect Finder',
   '2026-09-10T12:00:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 12:00 PM CST (1:00 PM EST)'),

  ('Caitlyn Sorrells', 'candidate_caitlyn_sorrells', 'Caitlyn Sorrells — Prospect Finder',
   '2026-09-10T13:30:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 1:30 PM CST'),

  ('Jessica Thrasher', 'candidate_jessica_thrasher', 'Jessica Thrasher — Prospect Finder',
   '2026-09-10T14:00:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 2:00 PM — time zone TBD, assumed Central. Confirm with candidate.'),

  ('Gina Mattivello', 'candidate_gina_mattivello', 'Gina L. Mattivello — Prospect Finder',
   '2026-09-10T16:00:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 4:00 PM — time zone TBD, assumed Central. Confirm with candidate.'),

  ('Darlene Ciao', 'candidate_darlene_ciao', 'Darlene Ciao — Prospect Finder',
   '2026-09-11T10:30:00-08:00'::timestamptz, 60, 'scheduled', 'Scheduled 10:30 AM PST'),

  ('Brett Allen', 'candidate_brett_allen', 'Brett Allen — Prospect Finder',
   '2026-09-11T13:00:00-06:00'::timestamptz, 60, 'scheduled', 'Scheduled 1:00 PM — time zone TBD, assumed Central. Confirm with candidate.');
