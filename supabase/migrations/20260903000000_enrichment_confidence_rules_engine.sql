-- ─── Migration: Enrichment Confidence Scores + Rules Engine ─────────────────
-- Adds confidence score columns to lead_enrichments, creates the ops rules
-- engine table for threshold definitions, and adds violation_flags to
-- sync_regression_events for realtime subscription support.

-- 1. Add confidence score columns to lead_enrichments (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
  ) THEN
    -- Ownership record confidence (0-100)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'ownership_confidence'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN ownership_confidence integer DEFAULT NULL;
    END IF;

    -- Market comps confidence (0-100)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'market_comp_confidence'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN market_comp_confidence integer DEFAULT NULL;
    END IF;

    -- Overall authenticity confidence (0-100)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'overall_confidence'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN overall_confidence integer DEFAULT NULL;
    END IF;

    -- Per-field confidence scores as JSONB array
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'field_confidence_scores'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN field_confidence_scores jsonb DEFAULT NULL;
    END IF;

    -- Anomalies detected by Anthropic
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'validation_anomalies'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN validation_anomalies text[] DEFAULT NULL;
    END IF;

    -- Anthropic recommendation: accept | review | reject
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'validation_recommendation'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN validation_recommendation text DEFAULT NULL;
    END IF;

    -- When Anthropic last validated this record
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'validated_at'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN validated_at timestamptz DEFAULT NULL;
    END IF;

    -- Rules engine violation flags (array of rule_ids that fired)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_enrichments'
        AND column_name = 'rules_violations'
    ) THEN
      ALTER TABLE public.lead_enrichments ADD COLUMN rules_violations text[] DEFAULT NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_lead_enrichments_ownership_confidence
      ON public.lead_enrichments (ownership_confidence DESC)
      WHERE ownership_confidence IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_lead_enrichments_overall_confidence
      ON public.lead_enrichments (overall_confidence DESC)
      WHERE overall_confidence IS NOT NULL;
  END IF;
END $$;

-- 2. Create enrichment_confidence_rules table (ops rules engine)
CREATE TABLE IF NOT EXISTS public.enrichment_confidence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN (
    'ownership_min_confidence',
    'market_comp_freshness_days',
    'price_anomaly_pct',
    'overall_min_confidence',
    'field_min_confidence'
  )),
  -- Threshold value (numeric — confidence 0-100, days, or percentage)
  threshold_value numeric(8,2) NOT NULL,
  -- Optional: target specific field name for field_min_confidence rules
  target_field text DEFAULT NULL,
  -- Action when rule fires
  action text NOT NULL DEFAULT 'flag' CHECK (action IN ('flag', 'block', 'notify')),
  -- Severity shown in UI
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  enabled boolean NOT NULL DEFAULT true,
  description text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enrichment_confidence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_confidence_rules_authenticated"
  ON public.enrichment_confidence_rules
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_enrichment_rules_type_enabled
  ON public.enrichment_confidence_rules (rule_type, enabled);

-- 3. Seed default rules
INSERT INTO public.enrichment_confidence_rules
  (rule_name, rule_type, threshold_value, action, severity, description)
VALUES
  (
    'Minimum Ownership Record Confidence',
    'ownership_min_confidence',
    70,
    'flag',
    'warning',
    'Flag leads where Anthropic ownership confidence is below 70%'
  ),
  (
    'Market Comps Freshness',
    'market_comp_freshness_days',
    90,
    'flag',
    'warning',
    'Flag leads where market comp data is older than 90 days'
  ),
  (
    'Price Anomaly Threshold',
    'price_anomaly_pct',
    30,
    'flag',
    'critical',
    'Flag leads where listing price deviates from estimated value by more than 30%'
  ),
  (
    'Minimum Overall Confidence',
    'overall_min_confidence',
    60,
    'flag',
    'warning',
    'Flag leads where overall Anthropic confidence score is below 60%'
  )
ON CONFLICT DO NOTHING;

-- 4. Create rules_engine_violations table for audit trail of fired rules
CREATE TABLE IF NOT EXISTS public.rules_engine_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text REFERENCES public.leads(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.enrichment_confidence_rules(id) ON DELETE SET NULL,
  rule_name text NOT NULL,
  rule_type text NOT NULL,
  threshold_value numeric(8,2) NOT NULL,
  actual_value numeric(8,2),
  action_taken text NOT NULL,
  severity text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  sync_run_id text DEFAULT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz DEFAULT NULL
);

ALTER TABLE public.rules_engine_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules_engine_violations_authenticated"
  ON public.rules_engine_violations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rules_violations_lead
  ON public.rules_engine_violations (lead_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_rules_violations_rule
  ON public.rules_engine_violations (rule_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_rules_violations_unresolved
  ON public.rules_engine_violations (resolved, detected_at DESC)
  WHERE resolved = false;

-- 5. Add confidence_score and violation_count columns to sync_regression_events
--    for richer realtime payloads
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sync_regression_events'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sync_regression_events'
        AND column_name = 'confidence_score'
    ) THEN
      ALTER TABLE public.sync_regression_events ADD COLUMN confidence_score integer DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sync_regression_events'
        AND column_name = 'rules_violations'
    ) THEN
      ALTER TABLE public.sync_regression_events ADD COLUMN rules_violations text[] DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sync_regression_events'
        AND column_name = 'validation_recommendation'
    ) THEN
      ALTER TABLE public.sync_regression_events ADD COLUMN validation_recommendation text DEFAULT NULL;
    END IF;
  END IF;
END $$;

-- 6. Enable realtime on sync_regression_events and rules_engine_violations
-- (Supabase realtime is enabled via the dashboard or by adding to the publication)
DO $$
BEGIN
  -- Add sync_regression_events to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'sync_regression_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_regression_events;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Publication may not exist in all environments
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'rules_engine_violations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rules_engine_violations;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
