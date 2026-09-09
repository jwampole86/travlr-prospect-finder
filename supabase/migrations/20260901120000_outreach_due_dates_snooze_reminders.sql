-- Migration: Add due dates, snooze-until, and reminder fields to outreach_logs
-- Also adds agent_workload_board view helper

-- Add new columns to outreach_logs
ALTER TABLE public.outreach_logs
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Index for due date queries (agents checking upcoming tasks)
CREATE INDEX IF NOT EXISTS idx_outreach_logs_due_date ON public.outreach_logs(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_logs_snooze_until ON public.outreach_logs(snooze_until) WHERE snooze_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_logs_agent_due ON public.outreach_logs(agent_id, due_date) WHERE is_completed = false;
