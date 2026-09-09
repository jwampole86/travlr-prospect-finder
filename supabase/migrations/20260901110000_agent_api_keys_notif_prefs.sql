-- Migration: agent_api_keys table + notification_preferences column + admin agent dashboard helpers
-- Timestamp: 20260901110000

-- ── agent_api_keys ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_api_keys' AND policyname = 'agent_api_keys_own'
  ) THEN
    CREATE POLICY agent_api_keys_own ON public.agent_api_keys
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── notification_preferences column on user_profiles ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_profiles'
      AND column_name  = 'notification_preferences'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN notification_preferences jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ── agent_profiles: add deactivated_at column if missing ─────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'agent_profiles'
      AND column_name  = 'deactivated_at'
  ) THEN
    ALTER TABLE public.agent_profiles
      ADD COLUMN deactivated_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- ── agent_profiles: add last_active_at column if missing ─────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'agent_profiles'
      AND column_name  = 'last_active_at'
  ) THEN
    ALTER TABLE public.agent_profiles
      ADD COLUMN last_active_at timestamptz DEFAULT NULL;
  END IF;
END $$;
