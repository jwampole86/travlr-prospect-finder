-- ============================================================
-- Internal Team Chat: channels (DM + group), members, messages
-- Lets admins/agents message each other inside the app instead of
-- relying on outside email for internal team communication.
-- ============================================================

-- ─── 1. chat_channels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  name            TEXT,
  description     TEXT DEFAULT '',
  -- For DMs only: LEAST(uid,uid) || '_' || GREATEST(uid,uid) — prevents duplicate
  -- DM channels between the same two people. NULL for group channels.
  dm_key          TEXT UNIQUE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_archived     BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_last_message_at ON public.chat_channels(last_message_at DESC NULLS LAST);

-- ─── 2. chat_channel_members ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role   TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'member')),
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted         BOOLEAN NOT NULL DEFAULT false,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_members_channel ON public.chat_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON public.chat_channel_members(user_id);

-- ─── 3. chat_messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_id);

-- ─── 4. Helper functions (SECURITY DEFINER to avoid recursive RLS) ────────────
CREATE OR REPLACE FUNCTION public.is_chat_channel_member(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_channel_owner(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid() AND member_role = 'owner'
  );
$$;

-- ─── 5. Trigger: keep chat_channels.last_message_at/preview in sync ───────────
CREATE OR REPLACE FUNCTION public.touch_chat_channel_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.chat_channels
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.body, 140),
      updated_at = now()
  WHERE id = NEW.channel_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_chat_channel_on_message ON public.chat_messages;
CREATE TRIGGER trg_touch_chat_channel_on_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_channel_on_message();

-- ─── 6. RPC: create (or reuse) a DM channel between the caller and another user ─
CREATE OR REPLACE FUNCTION public.create_dm_channel(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
  v_channel_id UUID;
BEGIN
  IF p_other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot create a DM channel with yourself';
  END IF;

  v_key := LEAST(auth.uid()::text, p_other_user_id::text) || '_' || GREATEST(auth.uid()::text, p_other_user_id::text);

  SELECT id INTO v_channel_id FROM public.chat_channels WHERE dm_key = v_key;
  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  INSERT INTO public.chat_channels (type, dm_key, created_by)
  VALUES ('dm', v_key, auth.uid())
  RETURNING id INTO v_channel_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, member_role)
  VALUES (v_channel_id, auth.uid(), 'owner'), (v_channel_id, p_other_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$;

-- ─── 7. RPC: create a group channel with an initial member list ───────────────
CREATE OR REPLACE FUNCTION public.create_group_channel(p_name TEXT, p_description TEXT, p_member_ids UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id UUID;
  v_member_id UUID;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Group channel name is required';
  END IF;

  INSERT INTO public.chat_channels (type, name, description, created_by)
  VALUES ('group', trim(p_name), COALESCE(p_description, ''), auth.uid())
  RETURNING id INTO v_channel_id;

  INSERT INTO public.chat_channel_members (channel_id, user_id, member_role)
  VALUES (v_channel_id, auth.uid(), 'owner')
  ON CONFLICT DO NOTHING;

  FOREACH v_member_id IN ARRAY COALESCE(p_member_ids, ARRAY[]::UUID[])
  LOOP
    IF v_member_id <> auth.uid() THEN
      INSERT INTO public.chat_channel_members (channel_id, user_id, member_role)
      VALUES (v_channel_id, v_member_id, 'member')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_channel_id;
END;
$$;

-- ─── 8. RPC: mark a channel read for the caller ────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_chat_channel_read(p_channel_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.chat_channel_members
  SET last_read_at = now()
  WHERE channel_id = p_channel_id AND user_id = auth.uid();
$$;

-- ─── 9. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- chat_channels: members (or admins) can see/update; direct INSERT only for
-- the creator's own row (actual channel creation goes through the RPCs above
-- so membership rows are added atomically in the same transaction).
DROP POLICY IF EXISTS "chat_channels_select" ON public.chat_channels;
CREATE POLICY "chat_channels_select"
  ON public.chat_channels FOR SELECT TO authenticated
  USING (public.is_chat_channel_member(id) OR public.is_admin_user());

DROP POLICY IF EXISTS "chat_channels_insert" ON public.chat_channels;
CREATE POLICY "chat_channels_insert"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "chat_channels_update" ON public.chat_channels;
CREATE POLICY "chat_channels_update"
  ON public.chat_channels FOR UPDATE TO authenticated
  USING (public.is_chat_channel_owner(id) OR public.is_admin_user())
  WITH CHECK (public.is_chat_channel_owner(id) OR public.is_admin_user());

-- chat_channel_members: any member of a channel can see its full roster;
-- admins can see all. Direct INSERT allowed for self-join or by an existing
-- owner/admin adding someone else; leaving a channel is a self-delete.
DROP POLICY IF EXISTS "chat_channel_members_select" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_select"
  ON public.chat_channel_members FOR SELECT TO authenticated
  USING (public.is_chat_channel_member(channel_id) OR public.is_admin_user());

DROP POLICY IF EXISTS "chat_channel_members_insert" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_insert"
  ON public.chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_chat_channel_owner(channel_id)
    OR public.is_admin_user()
  );

DROP POLICY IF EXISTS "chat_channel_members_update" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_update"
  ON public.chat_channel_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "chat_channel_members_delete" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_delete"
  ON public.chat_channel_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_channel_owner(channel_id) OR public.is_admin_user());

-- chat_messages: only channel members can read/post; senders (or admins) can
-- edit/soft-delete their own messages.
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_channel_member(channel_id) OR public.is_admin_user());

DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_channel_member(channel_id));

DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
CREATE POLICY "chat_messages_update"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin_user())
  WITH CHECK (sender_id = auth.uid() OR public.is_admin_user());

-- ─── 10. Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_channels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_channel_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
