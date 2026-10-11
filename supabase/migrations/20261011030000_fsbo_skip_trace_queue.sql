-- Queue + result tracking for the automatic skip-trace step on new FSBO imports.
-- Status: PENDING | RUNNING | FOUND | NO_MATCH | ERROR
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS skip_trace_status TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS skip_traced_at TIMESTAMPTZ;
-- Match type, confidence, alternates, emails, and whether a found phone matched the listing's own phone.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS skip_trace_result JSONB;

CREATE INDEX IF NOT EXISTS idx_leads_skip_trace_pending
  ON public.leads (created_at)
  WHERE skip_trace_status IN ('PENDING', 'RUNNING');
