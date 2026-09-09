-- ─── Email Campaigns Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  template_id TEXT REFERENCES public.email_templates(id) ON DELETE SET NULL,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  filters_used JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON public.email_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON public.email_campaigns(created_by);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_email_campaigns" ON public.email_campaigns;
CREATE POLICY "authenticated_manage_email_campaigns"
  ON public.email_campaigns FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Sync Alert Config Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_alert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  threshold_value NUMERIC,
  slack_webhook_url TEXT,
  alert_email TEXT,
  notify_slack BOOLEAN DEFAULT false,
  notify_email BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_alert_config_type ON public.sync_alert_config(alert_type);

ALTER TABLE public.sync_alert_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_sync_alert_config" ON public.sync_alert_config;
CREATE POLICY "authenticated_manage_sync_alert_config"
  ON public.sync_alert_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Sync Alert Events Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  portfolio TEXT,
  severity TEXT DEFAULT 'warning',
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_alert_events_created_at ON public.sync_alert_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_alert_events_acknowledged ON public.sync_alert_events(acknowledged);
CREATE INDEX IF NOT EXISTS idx_sync_alert_events_type ON public.sync_alert_events(alert_type);

ALTER TABLE public.sync_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_sync_alert_events" ON public.sync_alert_events;
CREATE POLICY "authenticated_manage_sync_alert_events"
  ON public.sync_alert_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Auto-Assign Rules: Add portfolio + stage + availability columns ──────────
ALTER TABLE public.lead_assignment_rules
  ADD COLUMN IF NOT EXISTS portfolios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability_start TIME,
  ADD COLUMN IF NOT EXISTS availability_end TIME,
  ADD COLUMN IF NOT EXISTS availability_days TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS score_threshold INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN DEFAULT true;

-- ─── Lead Assignment Log: Add override tracking ───────────────────────────────
ALTER TABLE public.lead_assignment_log
  ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS portfolio TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS score INTEGER;

CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_is_override ON public.lead_assignment_log(is_override);

-- ─── Seed default sync alert configs ─────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.sync_alert_config (alert_type, enabled, threshold_value, notify_slack, notify_email)
  VALUES
    ('provider_unavailable', true, NULL, false, true),
    ('verification_failure_rate', true, 10.0, false, true),
    ('suspicious_zero_result', true, NULL, false, true)
  ON CONFLICT DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed sync_alert_config failed: %', SQLERRM;
END $$;
