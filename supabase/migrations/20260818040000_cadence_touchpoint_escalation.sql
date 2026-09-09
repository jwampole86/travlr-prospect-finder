-- Migration: Cadence touchpoint logging, escalation tracking, and performance columns
-- Timestamp: 20260818040000

-- Add escalation tracking columns to leads if not present
ALTER TABLE leads ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

-- Add metadata column to cadence_send_log for manual outreach context
ALTER TABLE cadence_send_log ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add completed_at to cadence_enrollments if not present
ALTER TABLE cadence_enrollments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE cadence_enrollments ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE cadence_enrollments ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE cadence_enrollments ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

-- Add email to user_profiles for escalation email notifications
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Index for fast escalated leads lookup
CREATE INDEX IF NOT EXISTS idx_leads_stage_escalated ON leads (stage, escalated_at DESC)
  WHERE stage = 'human_outreach';

-- Index for cadence_send_log by lead for per-lead drill-down
CREATE INDEX IF NOT EXISTS idx_cadence_send_log_lead_id ON cadence_send_log (lead_id, sent_at DESC);

-- Index for cadence_enrollments by sequence for metrics
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_sequence ON cadence_enrollments (sequence_id, status);
