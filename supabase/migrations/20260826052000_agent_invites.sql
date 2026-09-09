-- ─── Migration: Agent Invite System ──────────────────────────────────────────

-- ── 1. agent_invites table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_invites (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email                text NOT NULL,
  first_name           text NOT NULL,
  last_name            text NOT NULL,
  assigned_portfolios  text[] DEFAULT '{}',
  role                 text NOT NULL DEFAULT 'agent',
  status               text NOT NULL DEFAULT 'invited', -- 'invited' | 'expired' | 'completed'
  invited_by           uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  completed_at         timestamptz,
  agent_user_id        uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_invites_token ON public.agent_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_agent_invites_email ON public.agent_invites(email);
CREATE INDEX IF NOT EXISTS idx_agent_invites_status ON public.agent_invites(status);
CREATE INDEX IF NOT EXISTS idx_agent_invites_invited_by ON public.agent_invites(invited_by);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_invites' AND policyname = 'Admins can manage all invites'
  ) THEN
    CREATE POLICY "Admins can manage all invites"
      ON public.agent_invites FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid() AND app_role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid() AND app_role = 'admin'
        )
      );
  END IF;
END $$;

-- Anyone can read a single invite by token (for the setup page — anon access needed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_invites' AND policyname = 'Public can read invite by token'
  ) THEN
    CREATE POLICY "Public can read invite by token"
      ON public.agent_invites FOR SELECT
      USING (true);
  END IF;
END $$;

-- ── 3. Auto-expire: mark invites as expired when expires_at passes ────────────
CREATE OR REPLACE FUNCTION public.expire_agent_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agent_invites
  SET status = 'expired'
  WHERE status = 'invited'
    AND expires_at < now();
END;
$$;

-- ── 4. Add app_role column to user_profiles if not present ───────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS app_role text NOT NULL DEFAULT 'admin';

-- ── 5. Update handle_new_user trigger to capture role from metadata ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, app_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
        app_role  = COALESCE(EXCLUDED.app_role, public.user_profiles.app_role);
  RETURN NEW;
END;
$$;

-- Re-attach trigger if needed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
