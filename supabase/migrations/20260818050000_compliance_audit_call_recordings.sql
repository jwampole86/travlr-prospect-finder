-- Migration: Compliance Audit Log + call_sessions recording fields
-- Timestamp: 20260818050000

-- ─── Ensure call_sessions has recording/transcript fields ───────────────────

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS script_compliance_score INTEGER,
  ADD COLUMN IF NOT EXISTS outcome TEXT;

-- ─── Compliance Audit Log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'call')),
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  recipient_name TEXT,
  recipient_phone TEXT,
  recipient_email TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opt_in_status TEXT NOT NULL DEFAULT 'unknown' CHECK (opt_in_status IN ('opted_in', 'opted_out', 'unknown')),
  opt_in_timestamp TIMESTAMPTZ,
  carrier_code TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'sent',
  unsubscribe_event BOOLEAN NOT NULL DEFAULT FALSE,
  unsubscribe_at TIMESTAMPTZ,
  message_preview TEXT,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_compliance_audit_sent_at ON compliance_audit_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_channel ON compliance_audit_log(channel);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_opt_in ON compliance_audit_log(opt_in_status);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_unsub ON compliance_audit_log(unsubscribe_event) WHERE unsubscribe_event = TRUE;
CREATE INDEX IF NOT EXISTS idx_compliance_audit_lead_id ON compliance_audit_log(lead_id);

-- RLS
ALTER TABLE compliance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_audit_admin_all" ON compliance_audit_log;
CREATE POLICY "compliance_audit_admin_all"
  ON compliance_audit_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'agent')
    )
  );
