-- Migration: QA coaching flags, landing page submission fields, and lead source type
-- Timestamp: 20260818010000

-- ── 1. Add QA coaching columns to call_sessions ────────────────────────────────

ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS qa_flag TEXT CHECK (qa_flag IN ('excellently_handled', 'needs_coaching', 'escalate_for_review')),
  ADD COLUMN IF NOT EXISTS coaching_notes TEXT;

-- ── 2. Add landing page submission fields to leads ─────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_source_type TEXT DEFAULT 'sync_imported' CHECK (lead_source_type IN ('sync_imported', 'self_submitted')),
  ADD COLUMN IF NOT EXISTS lead_status_tag TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_submission JSONB;

-- ── 3. Index for self-submitted leads ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_lead_source_type ON public.leads (lead_source_type);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status_tag ON public.leads (lead_status_tag);
CREATE INDEX IF NOT EXISTS idx_call_sessions_qa_flag ON public.call_sessions (qa_flag) WHERE qa_flag IS NOT NULL;

-- ── 4. RLS: call_sessions qa columns follow existing row-level security ─────────
-- No new policies needed — existing call_sessions RLS covers new columns.

-- ── 5. Comment documentation ──────────────────────────────────────────────────

COMMENT ON COLUMN public.call_sessions.qa_flag IS 'QA coaching flag: excellently_handled | needs_coaching | escalate_for_review';
COMMENT ON COLUMN public.call_sessions.coaching_notes IS 'Manager/QA coaching notes for this call session';
COMMENT ON COLUMN public.leads.lead_source_type IS 'How the lead entered the system: sync_imported (from listing platforms) or self_submitted (via landing page)';
COMMENT ON COLUMN public.leads.lead_status_tag IS 'Human-readable status tag, e.g. Inbound — Self-Qualified';
COMMENT ON COLUMN public.leads.landing_page_submission IS 'Full landing page submission payload including estimate shown, contact capture, questionnaire answers, and Claude summary';
