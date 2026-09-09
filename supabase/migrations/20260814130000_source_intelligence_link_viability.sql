-- Source Intelligence & Link Viability Migration
-- Adds link_viability_checks table, source_sync_stats view, and link_status columns

-- 1. Add link_status columns to leads if not present
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS link_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_check_error TEXT;

-- 2. Create link_viability_checks table
CREATE TABLE IF NOT EXISTS public.link_viability_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  listing_url TEXT,
  link_status TEXT NOT NULL DEFAULT 'Active',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT,
  is_craigslist BOOLEAN DEFAULT FALSE,
  rematch_attempted BOOLEAN DEFAULT FALSE,
  rematch_found BOOLEAN DEFAULT FALSE,
  rematch_url TEXT,
  rematch_confidence INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_viability_lead_id ON public.link_viability_checks(lead_id);
CREATE INDEX IF NOT EXISTS idx_link_viability_source_key ON public.link_viability_checks(source_key);
CREATE INDEX IF NOT EXISTS idx_link_viability_checked_at ON public.link_viability_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_link_viability_link_status ON public.link_viability_checks(link_status);

ALTER TABLE public.link_viability_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_link_viability_checks" ON public.link_viability_checks;
CREATE POLICY "authenticated_manage_link_viability_checks"
  ON public.link_viability_checks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. Create source_intelligence_runs table (tracks each background job run)
CREATE TABLE IF NOT EXISTS public.source_intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_key TEXT NOT NULL,
  total_checked INTEGER DEFAULT 0,
  active_count INTEGER DEFAULT 0,
  stale_count INTEGER DEFAULT 0,
  reposted_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  triggered_by TEXT DEFAULT 'scheduler',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_intelligence_runs_source_key ON public.source_intelligence_runs(source_key);
CREATE INDEX IF NOT EXISTS idx_source_intelligence_runs_run_at ON public.source_intelligence_runs(run_at);

ALTER TABLE public.source_intelligence_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_source_intelligence_runs" ON public.source_intelligence_runs;
CREATE POLICY "authenticated_manage_source_intelligence_runs"
  ON public.source_intelligence_runs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Indexes on leads for link checking
CREATE INDEX IF NOT EXISTS idx_leads_link_status ON public.leads(link_status);
CREATE INDEX IF NOT EXISTS idx_leads_link_last_checked ON public.leads(link_last_checked_at);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
