-- ─── Migration: Fix agent_invites RLS so Admins can insert ───────────────────
--
-- Problem: The existing "Admins can manage all invites" policy queries
-- public.user_profiles to check app_role. When the API route uses the anon key
-- (because SUPABASE_SERVICE_ROLE_KEY is not set), auth.uid() is NULL and the
-- subquery returns no rows → INSERT is blocked.
--
-- Fix:
--   1. Drop the old policies.
--   2. Create a helper function that checks admin role from auth.users metadata
--      (avoids any potential recursion and works with the JWT directly).
--   3. Re-create the admin policy using that function.
--   4. Keep the public SELECT policy for invite-token lookups.
--   5. Add an explicit INSERT policy for the service_role so the API route
--      can always insert when using the service role key.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Helper: is_admin_user() ────────────────────────────────────────────────
-- Checks both auth.users metadata AND user_profiles.app_role so either path works.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND app_role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND (
        raw_user_meta_data->>'role' = 'admin'
        OR raw_app_meta_data->>'role' = 'admin'
      )
  );
$$;

-- ── 2. Drop old policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all invites" ON public.agent_invites;
DROP POLICY IF EXISTS "Public can read invite by token" ON public.agent_invites;
DROP POLICY IF EXISTS "Service role can manage all invites" ON public.agent_invites;
DROP POLICY IF EXISTS "Admins can insert invites" ON public.agent_invites;
DROP POLICY IF EXISTS "Admins can select invites" ON public.agent_invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.agent_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.agent_invites;

-- ── 3. Admin: full access via helper function ─────────────────────────────────
CREATE POLICY "Admins can manage all invites"
  ON public.agent_invites
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ── 4. Public SELECT for invite-token lookups (unauthenticated setup page) ────
CREATE POLICY "Public can read invite by token"
  ON public.agent_invites
  FOR SELECT
  USING (true);

-- ── 5. Ensure RLS is enabled ──────────────────────────────────────────────────
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;
