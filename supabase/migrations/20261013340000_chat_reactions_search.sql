-- Emoji reactions on team chat messages, visible only to members of the message's channel.
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS chat_message_reactions_channel_idx ON public.chat_message_reactions (channel_id);
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_reactions_select ON public.chat_message_reactions;
CREATE POLICY chat_reactions_select ON public.chat_message_reactions FOR SELECT TO authenticated USING (public.is_chat_channel_member(channel_id));
DROP POLICY IF EXISTS chat_reactions_insert ON public.chat_message_reactions;
CREATE POLICY chat_reactions_insert ON public.chat_message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_channel_member(channel_id)
              AND EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.channel_id = chat_message_reactions.channel_id));
DROP POLICY IF EXISTS chat_reactions_delete ON public.chat_message_reactions;
CREATE POLICY chat_reactions_delete ON public.chat_message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Search across the channels the caller belongs to.
CREATE OR REPLACE FUNCTION public.search_chat_messages(p_query TEXT, p_limit INTEGER DEFAULT 30)
RETURNS TABLE (id UUID, channel_id UUID, sender_id UUID, sender_name TEXT, body TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.channel_id, m.sender_id, up.full_name, m.body, m.created_at
  FROM public.chat_messages m
  JOIN public.chat_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = auth.uid()
  LEFT JOIN public.user_profiles up ON up.id = m.sender_id
  WHERE m.deleted_at IS NULL AND char_length(trim(p_query)) >= 2
    AND m.body ILIKE '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ORDER BY m.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 30), 50);
$$;
REVOKE ALL ON FUNCTION public.search_chat_messages(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_chat_messages(TEXT, INTEGER) TO authenticated;
