-- Migration: Commission engine, cadence automation, activity timeline, template performance
-- Timestamp: 20260813110000

-- Commission Rules Table
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Standard',
  type TEXT NOT NULL DEFAULT 'flat' CHECK (type IN ('flat', 'percentage', 'hybrid')),
  flat_amount NUMERIC(10,2) DEFAULT 750,
  percentage NUMERIC(5,2) DEFAULT 0,
  residual_percentage NUMERIC(5,2) DEFAULT 0,
  portfolios TEXT[] DEFAULT '{}',
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clawback Rules Table
CREATE TABLE IF NOT EXISTS public.clawback_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_days INTEGER NOT NULL DEFAULT 90,
  clawback_percentage NUMERIC(5,2) NOT NULL DEFAULT 100,
  condition_text TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payout Schedule Config
CREATE TABLE IF NOT EXISTS public.payout_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_type TEXT NOT NULL DEFAULT 'after_clawback' CHECK (schedule_type IN ('immediate', 'biweekly', 'monthly', 'after_clawback')),
  clawback_window_days INTEGER DEFAULT 90,
  round_robin_enabled BOOLEAN DEFAULT true,
  overflow_pool_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lead Assignments (round-robin tracking)
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignment_method TEXT DEFAULT 'round_robin' CHECK (assignment_method IN ('round_robin', 'manual', 'claimed'))
);

-- Ensure agent_id column exists on lead_assignments (idempotent fix for partial prior runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_assignments' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE public.lead_assignments ADD COLUMN agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Activity Timeline Events
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('email_sent', 'email_opened', 'email_replied', 'call_logged', 'note_added', 'stage_changed', 'score_updated', 'enrichment', 'questionnaire')),
  title TEXT NOT NULL,
  detail TEXT,
  actor TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cadence Configuration
CREATE TABLE IF NOT EXISTS public.cadence_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Standard Outreach Cadence',
  auto_pause_on_reply BOOLEAN DEFAULT true,
  stop_at_stage TEXT DEFAULT 'Proposal',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cadence Stages
CREATE TABLE IF NOT EXISTS public.cadence_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id UUID REFERENCES public.cadence_configs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES public.email_templates(id) ON DELETE SET NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  stage_order INTEGER NOT NULL DEFAULT 1,
  auto_send BOOLEAN DEFAULT true,
  stop_after_reply BOOLEAN DEFAULT true
);

-- Lead Cadence Status
CREATE TABLE IF NOT EXISTS public.lead_cadence_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  cadence_id UUID REFERENCES public.cadence_configs(id) ON DELETE CASCADE,
  current_stage_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied')),
  next_send_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, cadence_id)
);

-- Template Performance Stats
CREATE TABLE IF NOT EXISTS public.template_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT REFERENCES public.email_templates(id) ON DELETE CASCADE,
  sends INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_id)
);

-- Duplicate Detection Log
CREATE TABLE IF NOT EXISTS public.dedup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('merged', 'dismissed', 'auto_skipped')),
  primary_lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  merged_lead_ids TEXT[] DEFAULT '{}',
  match_reason TEXT,
  confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clawback_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cadence_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dedup_log ENABLE ROW LEVEL SECURITY;

-- Admin/Agent read access for commission rules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_rules' AND policyname = 'commission_rules_read') THEN
    CREATE POLICY commission_rules_read ON public.commission_rules
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_rules' AND policyname = 'commission_rules_write') THEN
    CREATE POLICY commission_rules_write ON public.commission_rules
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Activity events: agents see only their leads' events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_events' AND policyname = 'activity_events_read') THEN
    EXECUTE $policy$
      CREATE POLICY activity_events_read ON public.activity_events
        FOR SELECT USING (
          EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
          OR EXISTS (
            SELECT 1 FROM public.lead_assignments la
            WHERE la.lead_id = activity_events.lead_id
              AND la.agent_id = auth.uid()
          )
        )
    $policy$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_events' AND policyname = 'activity_events_insert') THEN
    CREATE POLICY activity_events_insert ON public.activity_events
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Lead assignments: agents see their own
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignments' AND policyname = 'lead_assignments_read') THEN
    CREATE POLICY lead_assignments_read ON public.lead_assignments
      FOR SELECT USING (
        agent_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Open read for cadence configs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cadence_configs' AND policyname = 'cadence_configs_read') THEN
    CREATE POLICY cadence_configs_read ON public.cadence_configs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cadence_stages' AND policyname = 'cadence_stages_read') THEN
    CREATE POLICY cadence_stages_read ON public.cadence_stages FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'template_stats' AND policyname = 'template_stats_read') THEN
    CREATE POLICY template_stats_read ON public.template_stats FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dedup_log' AND policyname = 'dedup_log_read') THEN
    CREATE POLICY dedup_log_read ON public.dedup_log FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clawback_rules' AND policyname = 'clawback_rules_read') THEN
    CREATE POLICY clawback_rules_read ON public.clawback_rules FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_config' AND policyname = 'payout_config_read') THEN
    CREATE POLICY payout_config_read ON public.payout_config FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_cadence_status' AND policyname = 'lead_cadence_status_read') THEN
    CREATE POLICY lead_cadence_status_read ON public.lead_cadence_status FOR SELECT USING (true);
  END IF;
END $$;

-- Seed default payout config
INSERT INTO public.payout_config (schedule_type, clawback_window_days, round_robin_enabled, overflow_pool_enabled)
SELECT 'after_clawback', 90, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.payout_config LIMIT 1);

-- Seed default cadence
INSERT INTO public.cadence_configs (name, auto_pause_on_reply, stop_at_stage, active)
SELECT 'Standard Outreach Cadence', true, 'Proposal', true
WHERE NOT EXISTS (SELECT 1 FROM public.cadence_configs LIMIT 1);
