-- Follow-up sequences table for multi-step outreach rules
-- Timestamp: 20260814190000

CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  steps JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_owner ON public.follow_up_sequences(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_active ON public.follow_up_sequences(is_active);

ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_follow_up_sequences" ON public.follow_up_sequences;
CREATE POLICY "users_manage_own_follow_up_sequences"
  ON public.follow_up_sequences
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
