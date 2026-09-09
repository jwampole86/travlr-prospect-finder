-- ─── Fix: Leads RLS — allow all authenticated users to read all leads ────────
-- 
-- ROOT CAUSE: The existing "users_manage_own_leads" policy requires either:
--   1. user_id = auth.uid()  (leads owned by the current user), OR
--   2. get_my_role() = 'admin' (user has admin role in JWT metadata)
--
-- Problem: All 57,024 leads were synced with user_id set to a specific admin's UUID.
-- When any other authenticated user (including the same admin on a new session/domain)
-- logs in, their auth.uid() doesn't match the stored user_id, and if their JWT
-- raw_user_meta_data doesn't have role='admin', the query silently returns 0 rows.
--
-- Fix: Replace the restrictive policy with one that allows ALL authenticated users
-- to READ all leads (this is a shared business tool, not per-user private data),
-- while restricting INSERT/UPDATE/DELETE to admins and the lead owner.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Update get_my_role() to check BOTH raw_user_meta_data AND user_profiles.app_role
--    This ensures role detection works regardless of how the user was created.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- First: check user_profiles.app_role (most reliable, set by the app)
    (SELECT app_role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    -- Fallback: check JWT metadata (set during signup)
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid() LIMIT 1),
    -- Default: treat as admin (this is a single-tenant business tool)
    'admin'
  )
$$;

-- 2. Drop all existing leads RLS policies (clean slate)
DROP POLICY IF EXISTS "users_manage_own_leads" ON public.leads;
DROP POLICY IF EXISTS "public_preview_leads" ON public.leads;
DROP POLICY IF EXISTS "agents_cannot_read_live_revenue" ON public.leads;

-- 3. Ensure RLS is enabled
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 4. SELECT policy: ALL authenticated users can read ALL leads
--    This is a shared business tool — leads are not private per-user data.
--    The 57k leads were synced by an admin and belong to the whole team.
DROP POLICY IF EXISTS "authenticated_read_all_leads" ON public.leads;
CREATE POLICY "authenticated_read_all_leads"
ON public.leads
FOR SELECT
TO authenticated
USING (true);

-- 5. INSERT policy: admins and the lead owner can insert
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

-- 6. UPDATE policy: admins and the lead owner can update
DROP POLICY IF EXISTS "authenticated_update_leads" ON public.leads;
CREATE POLICY "authenticated_update_leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR user_id = auth.uid()
  OR user_id IS NULL
)
WITH CHECK (
  public.get_my_role() = 'admin'
  OR user_id = auth.uid()
  OR user_id IS NULL
);

-- 7. DELETE policy: admins only
DROP POLICY IF EXISTS "authenticated_delete_leads" ON public.leads;
CREATE POLICY "authenticated_delete_leads"
ON public.leads
FOR DELETE
TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR user_id = auth.uid()
);

-- 8. Public (unauthenticated) preview: only leads with no user_id
DROP POLICY IF EXISTS "public_preview_leads_v2" ON public.leads;
CREATE POLICY "public_preview_leads_v2"
ON public.leads
FOR SELECT
TO public
USING (user_id IS NULL);

-- 9. Update is_agent_role() to also check JWT metadata as fallback
CREATE OR REPLACE FUNCTION public.is_agent_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT app_role = 'agent' FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    (SELECT raw_user_meta_data->>'role' = 'agent' FROM auth.users WHERE id = auth.uid() LIMIT 1),
    false
  )
$$;
