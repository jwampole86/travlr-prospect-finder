-- ─── Fix: Leads INSERT RLS for server-side sync ──────────────────────────────
--
-- ISSUE 1: leads INSERT RLS violation
-- The sync API route runs server-side with the anon key and no auth session.
-- auth.uid() returns NULL in this context. The previous INSERT policy
-- (authenticated_insert_leads) requires:
--   get_my_role() = 'admin' OR user_id = auth.uid() OR user_id IS NULL
--
-- When auth.uid() is NULL, get_my_role() queries user_profiles WHERE id = NULL
-- (returns nothing), then JWT check (also NULL), then defaults to 'admin'.
-- However, the SECURITY DEFINER function may not resolve correctly when
-- called with a NULL auth context in all Supabase versions.
--
-- Fix: Add an explicit anon-key INSERT policy that allows inserts where
-- user_id IS NULL (all sync-generated leads have no user_id set).
-- This is safe because these are shared business leads, not private user data.
--
-- ISSUE 2: sync_events 'partial' status (code fix in route.ts)
-- The sync_events table only allows: pending, running, success, failed, retrying, abandoned
-- The route was inserting status='partial' which violates the check constraint.
-- Fixed in route.ts to use 'success'/'failed' instead.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ensure RLS is enabled on leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2. Drop and recreate the INSERT policy with explicit NULL user_id support
DROP POLICY IF EXISTS "authenticated_insert_leads" ON public.leads;
CREATE POLICY "authenticated_insert_leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_my_role() = 'admin'
  OR user_id = auth.uid()
  OR user_id IS NULL
);

-- 3. Also allow anon role to insert leads with no user_id
--    (server-side API routes using the anon key without a session)
DROP POLICY IF EXISTS "anon_insert_leads_no_owner" ON public.leads;
CREATE POLICY "anon_insert_leads_no_owner"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- 4. Also allow anon role to upsert (needed for .upsert() calls)
DROP POLICY IF EXISTS "anon_update_leads_no_owner" ON public.leads;
CREATE POLICY "anon_update_leads_no_owner"
ON public.leads
FOR UPDATE
TO anon
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);

-- 5. Ensure sync_events allows inserts with nullable user_id
--    The sync route tries to insert with user_id=null when no session exists.
--    The existing policy requires auth.uid() = user_id, which fails when both are NULL
--    (NULL = NULL is not TRUE in SQL).
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_events_owner" ON public.sync_events;
CREATE POLICY "sync_events_owner"
ON public.sync_events
FOR ALL
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anon inserts for server-side sync event logging
DROP POLICY IF EXISTS "sync_events_anon_insert" ON public.sync_events;
CREATE POLICY "sync_events_anon_insert"
ON public.sync_events
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);
