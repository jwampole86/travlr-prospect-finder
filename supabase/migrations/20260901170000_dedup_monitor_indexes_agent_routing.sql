-- ─── Migration: Dedup Monitor Indexes + Agent Routing ────────────────────────
-- Adds performance indexes for dedup-heavy queries, agent routing by confidence
-- band, and regression detection support.

-- 1. Composite index: source + created_at (data freshness queries)
CREATE INDEX IF NOT EXISTS idx_leads_source_created_at
  ON public.leads (source, created_at DESC);

-- 2. Composite index: confidence_band + prospect_score (hot-first queue sorting)
CREATE INDEX IF NOT EXISTS idx_leads_band_score
  ON public.leads (confidence_band, prospect_score DESC);

-- 3. Index: assigned_agent_id + pipeline_status (per-agent conversion queries)
CREATE INDEX IF NOT EXISTS idx_leads_agent_pipeline
  ON public.leads (assigned_agent_id, pipeline_status);

-- 4. Index: prospect_score DESC (score band scans)
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score_desc
  ON public.leads (prospect_score DESC);

-- 5. Index: is_synthetic + created_at (filter synthetic during regression scan)
CREATE INDEX IF NOT EXISTS idx_leads_synthetic_created
  ON public.leads (is_synthetic, created_at DESC);

-- 6. Partial index: open/unassigned hot leads (agent queue fast path)
CREATE INDEX IF NOT EXISTS idx_leads_hot_unassigned
  ON public.leads (prospect_score DESC, created_at DESC)
  WHERE prospect_score >= 80 AND assigned_agent_id IS NULL;

-- 7. Composite index: address + city + state (dedup fingerprint lookups)
-- Only create if the unique constraint index doesn't already cover this
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'leads'
      AND indexname = 'idx_leads_address_city_state_lookup'
  ) THEN
    CREATE INDEX idx_leads_address_city_state_lookup
      ON public.leads (
        lower(trim(address)),
        lower(trim(city)),
        lower(trim(state))
      );
  END IF;
END $$;

-- 8. Add regression_flagged column for ops alerting (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'regression_flagged'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN regression_flagged boolean DEFAULT false;
    CREATE INDEX idx_leads_regression_flagged ON public.leads (regression_flagged, created_at DESC)
      WHERE regression_flagged = true;
  END IF;
END $$;

-- 9. Add regression_type column for categorizing flags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'regression_type'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN regression_type text DEFAULT NULL;
  END IF;
END $$;

-- 10. Create dedup_monitor_cache table for caching expensive dedup aggregates
CREATE TABLE IF NOT EXISTS public.dedup_monitor_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE public.dedup_monitor_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dedup_monitor_cache_authenticated"
  ON public.dedup_monitor_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dedup_monitor_cache_key
  ON public.dedup_monitor_cache (cache_key, expires_at DESC);

-- 11. Create agent_routing_metrics table for persisting per-agent band routing stats
CREATE TABLE IF NOT EXISTS public.agent_routing_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  agent_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  hot_assigned integer NOT NULL DEFAULT 0,
  warm_assigned integer NOT NULL DEFAULT 0,
  cold_assigned integer NOT NULL DEFAULT 0,
  actual_conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_predicted_score numeric(5,1) NOT NULL DEFAULT 0,
  score_delta numeric(5,2) NOT NULL DEFAULT 0,
  signed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, period_start, period_end)
);

ALTER TABLE public.agent_routing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_routing_metrics_authenticated"
  ON public.agent_routing_metrics
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_agent_routing_metrics_agent
  ON public.agent_routing_metrics (agent_id, period_start DESC);

-- 12. Create sync_regression_events table for persistent regression tracking
CREATE TABLE IF NOT EXISTS public.sync_regression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text REFERENCES public.leads(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  regression_type text NOT NULL CHECK (regression_type IN ('new_duplicate', 'low_quality', 'cross_market', 'stale_source')),
  address text,
  city text,
  state text,
  score integer,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 're_dedup_triggered', 'resolved', 'ignored')),
  notes text,
  resolved_at timestamptz,
  resolved_by text
);

ALTER TABLE public.sync_regression_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_regression_events_authenticated"
  ON public.sync_regression_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_regression_events_status
  ON public.sync_regression_events (status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_regression_events_source
  ON public.sync_regression_events (source, detected_at DESC);
