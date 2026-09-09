-- Add onboarding_completed flag to user_profiles for walkthrough persistence
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding
  ON public.user_profiles (id, onboarding_completed);
