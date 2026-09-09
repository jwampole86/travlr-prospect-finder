-- Migration: PDL Stage 2 auto-enrich fields and enrichment cost tracking
-- Adds stage2_raw_response column if missing, ensures enrichment_api_logs has
-- all fields needed for ROI tracking, and adds a view for cost-per-lead metrics.

-- ── 1. Add stage2_raw_response to lead_enrichments if missing ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_enrichments'
      AND column_name = 'stage2_raw_response'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN stage2_raw_response jsonb;
  END IF;
END $$;

-- ── 2. Add stage3_raw_response to lead_enrichments if missing ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_enrichments'
      AND column_name = 'stage3_raw_response'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN stage3_raw_response jsonb;
  END IF;
END $$;

-- ── 3. Ensure enrichment_api_logs has conversion_value column ─────────────────
-- Allows tracking revenue attributed to enriched leads for ROI calculation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrichment_api_logs'
      AND column_name = 'conversion_value'
  ) THEN
    ALTER TABLE public.enrichment_api_logs ADD COLUMN conversion_value numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- ── 4. Ensure enrichment_api_logs has lead_score column ──────────────────────
-- Records the prospect score at time of enrichment for ROI segmentation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'enrichment_api_logs'
      AND column_name = 'lead_score'
  ) THEN
    ALTER TABLE public.enrichment_api_logs ADD COLUMN lead_score integer;
  END IF;
END $$;

-- ── 5. Index on enrichment_api_logs for cost summary queries ─────────────────
CREATE INDEX IF NOT EXISTS idx_enrichment_api_logs_provider_stage
  ON public.enrichment_api_logs (provider, stage);

CREATE INDEX IF NOT EXISTS idx_enrichment_api_logs_called_at
  ON public.enrichment_api_logs (called_at DESC);

-- ── 6. Index on lead_enrichments for auto-enrich queries ─────────────────────
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_stage2_completed
  ON public.lead_enrichments (stage2_completed_at)
  WHERE stage2_completed_at IS NOT NULL;

-- ── 7. RLS: ensure enrichment_api_logs is readable by authenticated users ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enrichment_api_logs'
      AND policyname = 'authenticated_read_enrichment_logs'
  ) THEN
    CREATE POLICY authenticated_read_enrichment_logs
      ON public.enrichment_api_logs
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ── 8. RLS: ensure lead_enrichments is readable by authenticated users ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_enrichments'
      AND policyname = 'authenticated_read_lead_enrichments'
  ) THEN
    CREATE POLICY authenticated_read_lead_enrichments
      ON public.lead_enrichments
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
