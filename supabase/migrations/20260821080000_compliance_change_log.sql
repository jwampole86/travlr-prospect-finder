-- Migration: Extend compliance_audit_log for full compliance change log support
-- Timestamp: 20260821080000

-- Add missing columns to compliance_audit_log if they don't exist
ALTER TABLE public.compliance_audit_log
  ADD COLUMN IF NOT EXISTS lead_address TEXT,
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'compliance_flag',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS old_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS regulation_status TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for fast filtering by event_type, actor_email, and timestamp
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_event_type
  ON public.compliance_audit_log(event_type);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_actor_email
  ON public.compliance_audit_log(actor_email);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_created_at
  ON public.compliance_audit_log(created_at DESC);

-- RLS: allow authenticated users to read all compliance log entries (managers need full visibility)
ALTER TABLE public.compliance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_compliance_audit_log" ON public.compliance_audit_log;
CREATE POLICY "authenticated_read_compliance_audit_log"
  ON public.compliance_audit_log
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_compliance_audit_log" ON public.compliance_audit_log;
CREATE POLICY "authenticated_insert_compliance_audit_log"
  ON public.compliance_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
