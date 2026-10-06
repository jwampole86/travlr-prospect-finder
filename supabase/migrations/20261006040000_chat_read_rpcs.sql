-- ============================================================
-- Internal Team Chat: read RPCs (channel list with unread counts,
-- paginated messages with resolved sender names, and a total unread count
-- for the nav badge). Each bypasses the self-only user_profiles RLS via
-- SECURITY DEFINER, but still enforces chat membership via auth.uid() checks.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_my_chat_channels()
RETURNS TABLE (
  channel_id UUID,
  type TEXT,
  name TEXT,
  description TEXT,
  other_user_id UUID,
  other_user_name TEXT,
  other_user_avatar TEXT,
  member_count BIGINT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id AS channel_id,
    c.type,
    c.name,
    c.description,
    other_member.user_id AS other_user_id,
    up.full_name AS other_user_name,
    up.avatar_url AS other_user_avatar,
    (SELECT count(*) FROM public.chat_channel_members cm2 WHERE cm2.channel_id = c.id) AS member_count,
    c.last_message_at,
    c.last_message_preview,
    (
      SELECT count(*) FROM public.chat_messages m
      WHERE m.channel_id = c.id
        AND m.deleted_at IS NULL
        AND m.sender_id <> auth.uid()
        AND m.created_at > my_member.last_read_at
    ) AS unread_count,
    c.created_at
  FROM public.chat_channels c
  JOIN public.chat_channel_members my_member
    ON my_member.channel_id = c.id AND my_member.user_id = auth.uid()
  LEFT JOIN public.chat_channel_members other_member
    ON other_member.channel_id = c.id AND other_member.user_id <> auth.uid() AND c.type = 'dm'
  LEFT JOIN public.user_profiles up ON up.id = other_member.user_id
  WHERE c.is_archived = false
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_chat_messages(p_channel_id UUID, p_before TIMESTAMPTZ DEFAULT NULL, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  sender_id UUID,
  sender_name TEXT,
  sender_avatar TEXT,
  body TEXT,
  metadata JSONB,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT m.id, m.channel_id, m.sender_id, up.full_name, up.avatar_url,
         m.body, m.metadata, m.edited_at, m.deleted_at, m.created_at
  FROM public.chat_messages m
  LEFT JOIN public.user_profiles up ON up.id = m.sender_id
  WHERE m.channel_id = p_channel_id
    AND public.is_chat_channel_member(p_channel_id)
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 50), 200);
$$;

CREATE OR REPLACE FUNCTION public.get_my_chat_unread_count()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(unread), 0) FROM (
    SELECT (
      SELECT count(*) FROM public.chat_messages m
      WHERE m.channel_id = cm.channel_id
        AND m.deleted_at IS NULL
        AND m.sender_id <> auth.uid()
        AND m.created_at > cm.last_read_at
    ) AS unread
    FROM public.chat_channel_members cm
    JOIN public.chat_channels c ON c.id = cm.channel_id AND c.is_archived = false
    WHERE cm.user_id = auth.uid() AND cm.muted = false
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.list_my_chat_channels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_chat_messages(UUID, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_chat_unread_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_chat_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_chat_messages(UUID, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chat_unread_count() TO authenticated;
