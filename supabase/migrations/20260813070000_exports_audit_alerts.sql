-- Migration: Scheduled Exports, Lead Audit Trail, and Extended Alert Types
-- Timestamp: 20260813070000

-- ─── export_schedules ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.export_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Export',
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  file_format text NOT NULL DEFAULT 'csv' CHECK (file_format IN ('csv', 'xlsx')),
  columns text[] NOT NULL DEFAULT ARRAY['address','city','stage','prospect_score','contact_name','contact_phone','estimated_net_monthly']::text[],
  recipient_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_sent_at timestamptz NULL,
  next_send_at timestamptz NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_schedules_user_id ON public.export_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_export_schedules_next_send ON public.export_schedules(next_send_at) WHERE enabled = true;

-- ─── lead_audit_trail ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('field_change', 'stage_progression', 'note_added', 'enrichment_event', 'lead_created', 'lead_deleted')),
  field_name text NULL,
  old_value text NULL,
  new_value text NULL,
  changed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_audit_user_id ON public.lead_audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_audit_lead_id ON public.lead_audit_trail(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_audit_event_type ON public.lead_audit_trail(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_audit_created_at ON public.lead_audit_trail(created_at DESC);

-- ─── Extend app_notifications with new alert types ────────────────────────────
-- Add archived column to app_notifications for inbox management

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS alert_type text NULL;

CREATE INDEX IF NOT EXISTS idx_app_notifications_archived ON public.app_notifications(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_app_notifications_alert_type ON public.app_notifications(user_id, alert_type);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.export_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_audit_trail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_export_schedules" ON public.export_schedules;
CREATE POLICY "users_manage_own_export_schedules"
ON public.export_schedules FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_manage_own_lead_audit_trail" ON public.lead_audit_trail;
CREATE POLICY "users_manage_own_lead_audit_trail"
ON public.lead_audit_trail FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── updated_at trigger for export_schedules ─────────────────────────────────

DROP TRIGGER IF EXISTS export_schedules_updated_at ON public.export_schedules;
CREATE TRIGGER export_schedules_updated_at
  BEFORE UPDATE ON public.export_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
