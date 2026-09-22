ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS agent_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;