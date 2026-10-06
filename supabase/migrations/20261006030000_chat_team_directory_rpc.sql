-- ============================================================
-- Internal Team Chat: team directory RPC
-- user_profiles RLS only allows reading your own row (or all rows if you're
-- an admin) — too narrow for a "start new message" picker where any agent
-- needs to browse other team members. Expose only the safe-to-share fields
-- via a SECURITY DEFINER function instead of broadening user_profiles RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_chat_team_directory()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  app_role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT up.id, up.full_name, up.email, up.avatar_url, up.app_role
  FROM public.user_profiles up
  WHERE up.app_role IN ('admin', 'agent')
    AND (up.is_active IS NULL OR up.is_active = true)
    AND up.id <> auth.uid()
  ORDER BY up.full_name;
$$;

-- Only authenticated internal team members may call this (not homeowners —
-- enforced by the app_role filter above, but also gate the function itself).
REVOKE ALL ON FUNCTION public.list_chat_team_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_team_directory() TO authenticated;
