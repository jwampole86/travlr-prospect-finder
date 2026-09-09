-- Migration: Call Outcome Outreach Tracking
-- Adds call duration, outcome (connected/voicemail/no-answer), recording URL,
-- and timestamp tracking per lead contact to call_sessions.
-- Also creates outreach_call_log for per-lead call history.
-- Timestamp: 20260818070000

-- ─── Enhance call_sessions with Twilio tracking fields ─────────────────────

ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS call_sid TEXT,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT CHECK (
    call_outcome IN ('connected', 'voicemail', 'no_answer', 'busy', 'failed',
                     'interested', 'not_interested', 'callback', 'other',
                     'questionnaire_sent', 'follow_up_scheduled', 'proposal_conversation')
  ),
  ADD COLUMN IF NOT EXISTS disposition_notes TEXT,
  ADD COLUMN IF NOT EXISTS recording_sid TEXT,
  ADD COLUMN IF NOT EXISTS is_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS call_summary JSONB,
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

-- Ensure recording_url column exists (may have been added by earlier migration)
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Ensure duration_seconds is present
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- ─── Outreach Call Log — per-lead call history ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.outreach_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.call_sessions(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name TEXT,
  contact_name TEXT,
  phone_number TEXT,
  call_sid TEXT,
  -- Core tracking fields
  outcome TEXT NOT NULL DEFAULT 'other' CHECK (
    outcome IN ('connected', 'voicemail', 'no_answer', 'busy', 'failed',
                'interested', 'not_interested', 'callback', 'other',
                'questionnaire_sent', 'follow_up_scheduled', 'proposal_conversation')
  ),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,
  recording_sid TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Additional context
  script_variant TEXT,
  portfolio_state TEXT,
  disposition_notes TEXT,
  transcript_length INTEGER DEFAULT 0,
  suggestions_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lead-based queries
CREATE INDEX IF NOT EXISTS idx_outreach_call_log_lead_id
  ON public.outreach_call_log(lead_id);

CREATE INDEX IF NOT EXISTS idx_outreach_call_log_agent_id
  ON public.outreach_call_log(agent_id);

CREATE INDEX IF NOT EXISTS idx_outreach_call_log_called_at
  ON public.outreach_call_log(called_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_call_log_outcome
  ON public.outreach_call_log(outcome);

CREATE INDEX IF NOT EXISTS idx_outreach_call_log_session_id
  ON public.outreach_call_log(session_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.outreach_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_call_log_agent_policy" ON public.outreach_call_log;
CREATE POLICY "outreach_call_log_agent_policy"
  ON public.outreach_call_log
  FOR ALL
  USING (
    agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ─── Indexes on call_sessions for new columns ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_call_sessions_call_outcome
  ON public.call_sessions(call_outcome);

CREATE INDEX IF NOT EXISTS idx_call_sessions_is_in_progress
  ON public.call_sessions(is_in_progress) WHERE is_in_progress = TRUE;

CREATE INDEX IF NOT EXISTS idx_call_sessions_call_sid
  ON public.call_sessions(call_sid) WHERE call_sid IS NOT NULL;
