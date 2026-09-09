-- Call Sessions table for Live Call Teleprompter
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_address TEXT,
  lead_state TEXT,
  agent_name TEXT,
  contact_name TEXT,
  portfolio_state TEXT,
  base_script_variant TEXT DEFAULT 'initial_outreach',
  consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  consent_acknowledged_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript JSONB DEFAULT '[]'::jsonb,
  suggestions_count INTEGER DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('questionnaire_sent', 'follow_up_scheduled', 'proposal_conversation', 'not_interested', 'voicemail', 'no_answer', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_sessions_user_id ON public.call_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead_id ON public.call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON public.call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_portfolio_state ON public.call_sessions(portfolio_state);

-- RLS
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own call sessions"
  ON public.call_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_call_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_sessions_updated_at ON public.call_sessions;
CREATE TRIGGER trg_call_sessions_updated_at
  BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_call_sessions_updated_at();
