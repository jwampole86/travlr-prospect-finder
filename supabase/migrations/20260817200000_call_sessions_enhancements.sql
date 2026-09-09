-- Enhance call_sessions with structured summary, agent outcome, disposition notes,
-- and additional fields needed for Supabase-persisted dialer + Claude summarization.

-- Add new columns to call_sessions
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS call_summary JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT CHECK (
    call_outcome IN ('interested', 'not_interested', 'callback', 'voicemail', 'no_answer', 'other')
  ),
  ADD COLUMN IF NOT EXISTS disposition_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS call_sid TEXT;

-- Widen the existing outcome column check constraint by dropping and recreating
-- (the original outcome column already exists with different values — we add call_outcome as the new agent-selected field)

-- Index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_call_sessions_phone_number ON public.call_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_sessions_is_in_progress ON public.call_sessions(is_in_progress) WHERE is_in_progress = TRUE;
CREATE INDEX IF NOT EXISTS idx_call_sessions_call_outcome ON public.call_sessions(call_outcome);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created_at ON public.call_sessions(created_at DESC);
