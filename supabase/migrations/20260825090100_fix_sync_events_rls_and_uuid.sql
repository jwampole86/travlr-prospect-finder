-- Migration: Fix sync_events RLS for server-side API route inserts
-- Problem 1: sync_events.user_id is NOT NULL but API route has no auth session
-- Problem 2: RLS policy blocks inserts where user_id IS NULL
-- Solution: Make user_id nullable + add policy for server-side (unauthenticated) inserts

-- ─── Make user_id nullable in sync_events ─────────────────────────────────────
ALTER TABLE public.sync_events
  ALTER COLUMN user_id DROP NOT NULL;

-- ─── Drop old restrictive policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS "sync_events_owner" ON public.sync_events;

-- ─── New policies ─────────────────────────────────────────────────────────────
-- Authenticated users can manage their own rows
DROP POLICY IF EXISTS "sync_events_authenticated_owner" ON public.sync_events;
CREATE POLICY "sync_events_authenticated_owner"
  ON public.sync_events
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Server-side API routes (anon role, no session) can insert rows with null user_id
DROP POLICY IF EXISTS "sync_events_server_insert" ON public.sync_events;
CREATE POLICY "sync_events_server_insert"
  ON public.sync_events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- ─── Make user_id nullable in sync_validation_errors too (same pattern) ───────
ALTER TABLE public.sync_validation_errors
  ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "sync_validation_errors_owner" ON public.sync_validation_errors;

DROP POLICY IF EXISTS "sync_validation_errors_authenticated_owner" ON public.sync_validation_errors;
CREATE POLICY "sync_validation_errors_authenticated_owner"
  ON public.sync_validation_errors
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "sync_validation_errors_server_insert" ON public.sync_validation_errors;
CREATE POLICY "sync_validation_errors_server_insert"
  ON public.sync_validation_errors
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
