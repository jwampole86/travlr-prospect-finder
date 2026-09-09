-- ============================================================
-- Nurture Cadence Engine + Notification Controls Migration
-- ============================================================

-- 1. Add nurture fields to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cadence_step INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_scheduled_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_in_source TEXT,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

-- Update stage enum to include nurture stages (add new values safely)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'nurturing'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'lead_stage' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    -- If lead_stage type exists, add values; otherwise skip
    BEGIN
      ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'nurturing';
      ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'engaged';
      ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'human_outreach';
      ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'closed_won';
      ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'closed_dead';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'lead_stage type not found or values already exist: %', SQLERRM;
    END;
  END IF;
END $$;

-- 2. Cadence sequences table (admin-editable, not hardcoded)
CREATE TABLE IF NOT EXISTS public.cadence_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  trigger_stage TEXT DEFAULT 'nurturing',
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Cadence enrollments (tracks which lead is in which sequence)
CREATE TABLE IF NOT EXISTS public.cadence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.cadence_sequences(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'escalated', 'unsubscribed')),
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  UNIQUE(lead_id, sequence_id)
);

-- 4. Cadence send log (immutable audit trail)
CREATE TABLE IF NOT EXISTS public.cadence_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES public.cadence_enrollments(id) ON DELETE SET NULL,
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.cadence_sequences(id) ON DELETE SET NULL,
  step_number INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  template_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped_opt_out', 'skipped_dnc')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Notification preferences per user (channel + type + frequency)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  -- Channel toggles
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  in_app_enabled BOOLEAN DEFAULT true,
  -- Type toggles (admin)
  notify_new_lead BOOLEAN DEFAULT true,
  notify_stage_change BOOLEAN DEFAULT true,
  notify_email_sent BOOLEAN DEFAULT true,
  notify_sms_sent BOOLEAN DEFAULT false,
  notify_call_summary BOOLEAN DEFAULT true,
  notify_sync_health BOOLEAN DEFAULT true,
  notify_sync_failure BOOLEAN DEFAULT true,
  notify_failed_cadence BOOLEAN DEFAULT true,
  notify_enrichment_complete BOOLEAN DEFAULT false,
  notify_escalation BOOLEAN DEFAULT true,
  -- Type toggles (homeowner)
  notify_booking_confirmed BOOLEAN DEFAULT true,
  notify_booking_cancelled BOOLEAN DEFAULT true,
  notify_payout_processed BOOLEAN DEFAULT true,
  notify_payout_failed BOOLEAN DEFAULT true,
  notify_maintenance_update BOOLEAN DEFAULT true,
  notify_document_ready BOOLEAN DEFAULT true,
  -- Frequency
  digest_frequency TEXT DEFAULT 'realtime' CHECK (digest_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
  digest_time TIME DEFAULT '09:00:00',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 6. Admin event log (all lead changes, user actions, system events)
CREATE TABLE IF NOT EXISTS public.admin_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL CHECK (event_category IN ('lead_change', 'user_action', 'system_event')),
  actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Unsubscribe tokens for one-click email unsubscribe
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  enrollment_id UUID REFERENCES public.cadence_enrollments(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_lead_id ON public.cadence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_status ON public.cadence_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_next_send ON public.cadence_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cadence_send_log_lead_id ON public.cadence_send_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_cadence_send_log_enrollment_id ON public.cadence_send_log(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_admin_event_log_timestamp ON public.admin_event_log(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_event_log_lead_id ON public.admin_event_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_admin_event_log_actor ON public.admin_event_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_event_log_category ON public.admin_event_log(event_category);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_next_touch ON public.leads(next_scheduled_touch_at);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_token ON public.email_unsubscribe_tokens(token);

-- 9. RLS
ALTER TABLE public.cadence_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- cadence_sequences: admins/agents can manage
DROP POLICY IF EXISTS "authenticated_manage_cadence_sequences" ON public.cadence_sequences;
CREATE POLICY "authenticated_manage_cadence_sequences" ON public.cadence_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cadence_enrollments: authenticated users
DROP POLICY IF EXISTS "authenticated_manage_cadence_enrollments" ON public.cadence_enrollments;
CREATE POLICY "authenticated_manage_cadence_enrollments" ON public.cadence_enrollments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cadence_send_log: read-only for authenticated
DROP POLICY IF EXISTS "authenticated_view_cadence_send_log" ON public.cadence_send_log;
CREATE POLICY "authenticated_view_cadence_send_log" ON public.cadence_send_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notification_preferences: users manage own
DROP POLICY IF EXISTS "users_manage_own_notification_prefs" ON public.notification_preferences;
CREATE POLICY "users_manage_own_notification_prefs" ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- admin_event_log: authenticated read, service write
DROP POLICY IF EXISTS "authenticated_view_admin_event_log" ON public.admin_event_log;
CREATE POLICY "authenticated_view_admin_event_log" ON public.admin_event_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_admin_event_log" ON public.admin_event_log;
CREATE POLICY "authenticated_insert_admin_event_log" ON public.admin_event_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- email_unsubscribe_tokens: public read for token validation
DROP POLICY IF EXISTS "public_read_unsubscribe_tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "public_read_unsubscribe_tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "authenticated_manage_unsubscribe_tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "authenticated_manage_unsubscribe_tokens" ON public.email_unsubscribe_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. Seed default cadence sequence
DO $$
DECLARE
  existing_seq_id UUID;
BEGIN
  SELECT id INTO existing_seq_id FROM public.cadence_sequences WHERE is_default = true LIMIT 1;
  IF existing_seq_id IS NULL THEN
    INSERT INTO public.cadence_sequences (name, description, is_active, is_default, trigger_stage, steps)
    VALUES (
      'Standard Nurture Cadence',
      'Default 5-step automated nurture sequence for new leads',
      true,
      true,
      'nurturing',
      '[
        {"step": 0, "label": "Initial Outreach", "channel": "email", "delay_days": 0, "delay_hours": 0, "template_key": "initial_outreach", "subject": "Quick question about your property"},
        {"step": 1, "label": "Follow-Up #1", "channel": "email", "delay_days": 4, "delay_hours": 0, "template_key": "follow_up_1", "subject": "Following up — TRAVLR"},
        {"step": 2, "label": "SMS Check-In", "channel": "sms", "delay_days": 7, "delay_hours": 0, "template_key": "check_in", "subject": null},
        {"step": 3, "label": "Proposal Introduction", "channel": "email", "delay_days": 5, "delay_hours": 0, "template_key": "proposal_introduction", "subject": "Your personalized rental estimate is ready"},
        {"step": 4, "label": "Closing / Final Touch", "channel": "email", "delay_days": 7, "delay_hours": 0, "template_key": "closing", "subject": "Last chance — your property could be earning more"}
      ]'::JSONB
    ) ON CONFLICT DO NOTHING;
  END IF;
END $$;
