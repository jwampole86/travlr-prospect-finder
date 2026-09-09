-- ─── Link Clicks Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,
  lead_id         text REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id     text,
  sequence_name   text,
  agent_id        uuid,
  original_url    text NOT NULL,
  clicked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  portfolio       text
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_token ON public.link_clicks(token);
CREATE INDEX IF NOT EXISTS idx_link_clicks_lead_id ON public.link_clicks(lead_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_sequence_id ON public.link_clicks(sequence_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_agent_id ON public.link_clicks(agent_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON public.link_clicks(clicked_at);

-- ─── Agent Portfolio Assignments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_portfolio_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id   uuid NOT NULL,
  portfolio_key   text NOT NULL,
  assigned_by     uuid,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_user_id, portfolio_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_portfolio_agent ON public.agent_portfolio_assignments(agent_user_id);

-- ─── Add role column to user_profiles if not exists ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'app_role'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN app_role text NOT NULL DEFAULT 'admin'
      CHECK (app_role IN ('admin', 'agent'));
  END IF;
END $$;

-- ─── RLS: link_clicks ─────────────────────────────────────────────────────────
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "link_clicks_select" ON public.link_clicks;
CREATE POLICY "link_clicks_select" ON public.link_clicks
  FOR SELECT USING (
    -- admins see all; agents see only their own
    auth.uid() IS NOT NULL AND (
      (SELECT app_role FROM public.user_profiles WHERE id = auth.uid()) = 'admin'
      OR agent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "link_clicks_insert" ON public.link_clicks;
CREATE POLICY "link_clicks_insert" ON public.link_clicks
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "link_clicks_update" ON public.link_clicks;
CREATE POLICY "link_clicks_update" ON public.link_clicks
  FOR UPDATE USING (true);

-- ─── RLS: agent_portfolio_assignments ────────────────────────────────────────
ALTER TABLE public.agent_portfolio_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apa_select" ON public.agent_portfolio_assignments;
CREATE POLICY "apa_select" ON public.agent_portfolio_assignments
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      (SELECT app_role FROM public.user_profiles WHERE id = auth.uid()) = 'admin'
      OR agent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "apa_all_admin" ON public.agent_portfolio_assignments;
CREATE POLICY "apa_all_admin" ON public.agent_portfolio_assignments
  FOR ALL USING (
    (SELECT app_role FROM public.user_profiles WHERE id = auth.uid()) = 'admin'
  );
