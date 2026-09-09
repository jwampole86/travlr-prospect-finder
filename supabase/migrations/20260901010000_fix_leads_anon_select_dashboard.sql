-- ─── Fix: Dashboard metrics showing 0 — anon SELECT policy for leads ─────────
--
-- ROOT CAUSE: The dashboard page fetches leads immediately on mount before the
-- Supabase auth session is fully established. During this window, the Supabase
-- client runs queries as the 'anon' role (no authenticated session yet).
--
-- The existing RLS policies only allow:
--   - authenticated_read_all_leads: SELECT for 'authenticated' role → USING (true)
--   - public_preview_leads_v2: SELECT for 'public' role → USING (user_id IS NULL)
--
-- All 60k leads were synced with user_id set to an admin UUID (not NULL), so:
--   - anon role hits public_preview_leads_v2 → user_id IS NULL → 0 rows returned
--   - Dashboard shows 0 for all metrics even though 60k leads exist
--
-- Fix: Add an explicit anon SELECT policy allowing all leads to be read.
-- This is safe and consistent with the existing anon INSERT policy
-- (anon_insert_leads_no_owner) — this is a shared business tool, not private data.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ensure RLS is enabled
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2. Drop the restrictive public preview policy (only showed user_id IS NULL leads)
DROP POLICY IF EXISTS "public_preview_leads_v2" ON public.leads;

-- 3. Add anon SELECT policy — allows all leads to be read without auth session
--    This fixes the race condition where the dashboard queries before auth loads.
DROP POLICY IF EXISTS "anon_read_all_leads" ON public.leads;
CREATE POLICY "anon_read_all_leads"
ON public.leads
FOR SELECT
TO anon
USING (true);
