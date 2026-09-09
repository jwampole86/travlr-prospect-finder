-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Filter Presets, Team Activity Log, Performance Indexes
-- Timestamp: 20260814140000
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add agent_id to leads for assignment tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- 2. Filter Presets table (per-user saved filter configurations)
CREATE TABLE IF NOT EXISTS public.filter_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  filters     JSONB NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Team Activity Log (enrichment completed, questionnaire qualified, outreach sent, handoff)
CREATE TABLE IF NOT EXISTS public.team_activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  lead_id      TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL, -- 'enrichment_completed' | 'questionnaire_qualified' | 'outreach_sent' | 'lead_assigned' | 'lead_reassigned' | 'stage_changed'
  event_data   JSONB NOT NULL DEFAULT '{}',
  agent_name   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Lead Handoff History (tracks reassignment chain)
CREATE TABLE IF NOT EXISTS public.lead_handoff_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_agent_id   UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  to_agent_id     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  from_agent_name TEXT,
  to_agent_name   TEXT,
  reason          TEXT,
  reassigned_by   UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes on filtered/sorted fields ────────────────────────────────────────

-- leads table — fields used in filter/sort operations
CREATE INDEX IF NOT EXISTS idx_leads_stage           ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_source          ON public.leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_regulation_status ON public.leads(regulation_status);
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score  ON public.leads(prospect_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_city            ON public.leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_created_at      ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_agent_id        ON public.leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_price           ON public.leads(price);
CREATE INDEX IF NOT EXISTS idx_leads_beds            ON public.leads(beds);
CREATE INDEX IF NOT EXISTS idx_leads_days_on_market  ON public.leads(days_on_market);

-- filter_presets
CREATE INDEX IF NOT EXISTS idx_filter_presets_user_id ON public.filter_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_filter_presets_shared  ON public.filter_presets(is_shared) WHERE is_shared = true;

-- team_activity_log
CREATE INDEX IF NOT EXISTS idx_team_activity_user_id   ON public.team_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_lead_id   ON public.team_activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_event_type ON public.team_activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_team_activity_created_at ON public.team_activity_log(created_at DESC);

-- lead_handoff_history
CREATE INDEX IF NOT EXISTS idx_handoff_lead_id       ON public.lead_handoff_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_handoff_to_agent      ON public.lead_handoff_history(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_handoff_created_at    ON public.lead_handoff_history(created_at DESC);

-- lead_assignments (already exists — add missing indexes)
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id  ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_agent_id ON public.lead_assignments(agent_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.filter_presets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_activity_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_handoff_history ENABLE ROW LEVEL SECURITY;

-- filter_presets: users manage their own; shared presets readable by all authenticated
DROP POLICY IF EXISTS "users_manage_own_filter_presets" ON public.filter_presets;
CREATE POLICY "users_manage_own_filter_presets"
  ON public.filter_presets FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_shared_filter_presets" ON public.filter_presets;
CREATE POLICY "users_read_shared_filter_presets"
  ON public.filter_presets FOR SELECT TO authenticated
  USING (is_shared = true);

-- team_activity_log: all authenticated users can read; insert own events
DROP POLICY IF EXISTS "users_read_team_activity" ON public.team_activity_log;
CREATE POLICY "users_read_team_activity"
  ON public.team_activity_log FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_insert_team_activity" ON public.team_activity_log;
CREATE POLICY "users_insert_team_activity"
  ON public.team_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- lead_handoff_history: all authenticated can read
DROP POLICY IF EXISTS "users_read_handoff_history" ON public.lead_handoff_history;
CREATE POLICY "users_read_handoff_history"
  ON public.lead_handoff_history FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_insert_handoff_history" ON public.lead_handoff_history;
CREATE POLICY "users_insert_handoff_history"
  ON public.lead_handoff_history FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── Seed sample team activity log entries ────────────────────────────────────
DO $$
DECLARE
  existing_user_id UUID;
  existing_lead_id UUID;
BEGIN
  SELECT id INTO existing_user_id FROM public.user_profiles LIMIT 1;
  SELECT id INTO existing_lead_id FROM public.leads LIMIT 1;

  IF existing_user_id IS NOT NULL AND existing_lead_id IS NOT NULL THEN
    INSERT INTO public.team_activity_log (user_id, lead_id, event_type, event_data, agent_name, created_at)
    VALUES
      (existing_user_id, existing_lead_id, 'enrichment_completed', jsonb_build_object('stage', 2, 'confidence', 87), 'Sarah Chen', now() - interval '2 hours'),
      (existing_user_id, existing_lead_id, 'outreach_sent', jsonb_build_object('template', 'Initial Outreach', 'channel', 'email'), 'Marcus Rivera', now() - interval '5 hours'),
      (existing_user_id, existing_lead_id, 'questionnaire_qualified', jsonb_build_object('score', 92, 'status', 'Qualified'), 'Priya Patel', now() - interval '1 day'),
      (existing_user_id, existing_lead_id, 'lead_assigned', jsonb_build_object('agent', 'James O''Brien'), 'Admin', now() - interval '2 days'),
      (existing_user_id, existing_lead_id, 'stage_changed', jsonb_build_object('from', 'New Lead', 'to', 'Contacted'), 'Aisha Williams', now() - interval '3 days')
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data skipped: %', SQLERRM;
END $$;
