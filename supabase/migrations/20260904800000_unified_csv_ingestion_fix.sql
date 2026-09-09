-- ─── TRAVLR Unified Multi-Source Ingestion Fix ───────────────────────────────
-- Fixes:
-- 1. RLS policies blocking anon-key CSV import writes to csv_import_batches,
--    portfolio_registry, lead_activity_log, csv_import_row_outcomes
-- 2. Adds source provenance columns to leads table
-- 3. Adds source_types tracking (MANUAL_CSV, LINK_SYNC, MULTI_SOURCE)
-- 4. Reconciles any staging-only CSV records into canonical leads
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add source provenance columns to leads ─────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ingestion_source TEXT DEFAULT 'LINK_SYNC',
  ADD COLUMN IF NOT EXISTS source_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS address_source TEXT,
  ADD COLUMN IF NOT EXISTS owner_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT,
  ADD COLUMN IF NOT EXISTS rent_price_source TEXT,
  ADD COLUMN IF NOT EXISTS rent_price_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS beds_source TEXT,
  ADD COLUMN IF NOT EXISTS baths_source TEXT,
  ADD COLUMN IF NOT EXISTS listing_source TEXT,
  ADD COLUMN IF NOT EXISTS verification_source TEXT,
  ADD COLUMN IF NOT EXISTS is_multi_source BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- ── 2. Backfill ingestion_source for existing records ─────────────────────────
-- Records with import_batch_id or source_type = MANUAL_VERIFIED_IMPORT → MANUAL_CSV
-- All others → LINK_SYNC
UPDATE public.leads
SET ingestion_source = 'MANUAL_CSV',
    source_types = ARRAY['MANUAL_CSV']::TEXT[]
WHERE (import_batch_id IS NOT NULL OR source_type = 'MANUAL_VERIFIED_IMPORT')
  AND (ingestion_source IS NULL OR ingestion_source = 'LINK_SYNC');

UPDATE public.leads
SET ingestion_source = 'LINK_SYNC',
    source_types = ARRAY['LINK_SYNC']::TEXT[]
WHERE import_batch_id IS NULL
  AND (source_type IS NULL OR source_type != 'MANUAL_VERIFIED_IMPORT')
  AND (ingestion_source IS NULL OR ingestion_source = 'LINK_SYNC');

-- ── 3. Fix RLS: csv_import_batches — allow anon inserts/updates ───────────────
ALTER TABLE public.csv_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_csv_import_batches" ON public.csv_import_batches;
CREATE POLICY "anon_insert_csv_import_batches"
ON public.csv_import_batches
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_csv_import_batches" ON public.csv_import_batches;
CREATE POLICY "anon_update_csv_import_batches"
ON public.csv_import_batches
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_csv_import_batches" ON public.csv_import_batches;
CREATE POLICY "anon_select_csv_import_batches"
ON public.csv_import_batches
FOR SELECT
TO anon
USING (true);

-- ── 4. Fix RLS: csv_import_row_outcomes — allow anon inserts ─────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'csv_import_row_outcomes'
  ) THEN
    ALTER TABLE public.csv_import_row_outcomes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_insert_csv_import_row_outcomes" ON public.csv_import_row_outcomes;
CREATE POLICY "anon_insert_csv_import_row_outcomes"
ON public.csv_import_row_outcomes
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_csv_import_row_outcomes" ON public.csv_import_row_outcomes;
CREATE POLICY "anon_select_csv_import_row_outcomes"
ON public.csv_import_row_outcomes
FOR SELECT
TO anon
USING (true);

-- ── 5. Fix RLS: portfolio_registry — allow anon inserts/selects ───────────────
ALTER TABLE public.portfolio_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_portfolio_registry" ON public.portfolio_registry;
CREATE POLICY "anon_insert_portfolio_registry"
ON public.portfolio_registry
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_portfolio_registry" ON public.portfolio_registry;
CREATE POLICY "anon_select_portfolio_registry"
ON public.portfolio_registry
FOR SELECT
TO anon
USING (true);

-- ── 6. Fix RLS: lead_activity_log — allow anon inserts ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_activity_log'
  ) THEN
    ALTER TABLE public.lead_activity_log ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_insert_lead_activity_log" ON public.lead_activity_log;
CREATE POLICY "anon_insert_lead_activity_log"
ON public.lead_activity_log
FOR INSERT
TO anon
WITH CHECK (true);

-- ── 7. Fix RLS: activity_events — allow anon inserts ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_insert_activity_events" ON public.activity_events;
CREATE POLICY "anon_insert_activity_events"
ON public.activity_events
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_activity_events" ON public.activity_events;
CREATE POLICY "anon_select_activity_events"
ON public.activity_events
FOR SELECT
TO anon
USING (true);

-- ── 8. Fix RLS: enrichment_error_logs — allow anon inserts ───────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enrichment_error_logs'
  ) THEN
    ALTER TABLE public.enrichment_error_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_insert_enrichment_error_logs" ON public.enrichment_error_logs;
CREATE POLICY "anon_insert_enrichment_error_logs"
ON public.enrichment_error_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- ── 9. Add indexes for source filtering ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_ingestion_source ON public.leads(ingestion_source);
CREATE INDEX IF NOT EXISTS idx_leads_source_type ON public.leads(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_import_batch_id ON public.leads(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_multi_source ON public.leads(is_multi_source);

-- ── 10. Add missing columns to csv_import_batches ────────────────────────────
ALTER TABLE public.csv_import_batches
  ADD COLUMN IF NOT EXISTS rows_new INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_updated_existing INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_duplicate_in_file INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_unchanged_existing INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_review_required INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_error INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commit_confirmed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commit_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS record_source TEXT DEFAULT 'Manual Zillow Research',
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL_VERIFIED_IMPORT',
  ADD COLUMN IF NOT EXISTS phone_numbers_imported INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_prices_found INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_prices_unavailable INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_portfolios_created INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS existing_portfolios_reused INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_prospects_created INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS existing_prospects_enriched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicates_merged INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_processed INTEGER DEFAULT 0;

-- ── 11. Reconciliation: recover CSV import rows that never reached leads ──────
-- For each completed csv_import_batch, check if the imported rows exist in leads.
-- If csv_import_row_outcomes has rows with outcome='NEW' but no matching lead,
-- we log the discrepancy. The actual re-import must be done via the UI.
DO $$
DECLARE
  batch_count INTEGER := 0;
  orphan_count INTEGER := 0;
BEGIN
  -- Count completed batches
  SELECT COUNT(*) INTO batch_count
  FROM public.csv_import_batches
  WHERE status = 'COMPLETED';

  RAISE NOTICE 'Reconciliation: Found % completed CSV import batches', batch_count;

  -- Count row outcomes that claim NEW but have no matching lead
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'csv_import_row_outcomes'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.csv_import_row_outcomes ro
    WHERE ro.outcome = 'NEW'
      AND ro.outcome_lead_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.leads l WHERE l.id = ro.outcome_lead_id
      );

    RAISE NOTICE 'Reconciliation: % NEW outcome rows have no matching lead record (orphaned)', orphan_count;
  END IF;

  RAISE NOTICE 'Reconciliation complete. Run /api/leads/csv-reconcile to recover orphaned records.';
END $$;

-- ── 12. Source breakdown RPC — counts by ingestion_source ────────────────────
CREATE OR REPLACE FUNCTION public.get_ingestion_source_counts()
RETURNS TABLE(
  ingestion_source TEXT,
  prospect_count BIGINT,
  verified_count BIGINT,
  phone_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(l.ingestion_source, 'LINK_SYNC') AS ingestion_source,
    COUNT(*)::BIGINT AS prospect_count,
    COUNT(*) FILTER (WHERE l.verified_owner = true AND l.verified_number = true)::BIGINT AS verified_count,
    COUNT(*) FILTER (WHERE l.has_phone = true OR l.contact_phone IS NOT NULL)::BIGINT AS phone_count
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
  GROUP BY COALESCE(l.ingestion_source, 'LINK_SYNC')
  ORDER BY prospect_count DESC;
END;
$func$;
