-- ============================================================
-- Internal Team Chat: channel member roster RPC (names/avatars for a
-- given channel's members — needed for group chat headers/roster lists).
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_chat_channel_roster(p_channel_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  app_role TEXT,
  member_role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cm.user_id, up.full_name, up.avatar_url, up.app_role, cm.member_role, cm.joined_at
  FROM public.chat_channel_members cm
  LEFT JOIN public.user_profiles up ON up.id = cm.user_id
  WHERE cm.channel_id = p_channel_id
    AND public.is_chat_channel_member(p_channel_id)
  ORDER BY cm.joined_at;
$$;

REVOKE ALL ON FUNCTION public.list_chat_channel_roster(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_channel_roster(UUID) TO authenticated;
