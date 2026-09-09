-- ─── Per-property enrichment error logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.enrichment_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  batch_id TEXT,
  stage TEXT NOT NULL DEFAULT 'import',
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_detail JSONB DEFAULT '{}',
  -- Normalization snapshot
  raw_address TEXT,
  normalized_address TEXT,
  normalization_result JSONB DEFAULT '{}',
  -- API request/response
  api_provider TEXT,
  api_request JSONB,
  api_response JSONB,
  api_http_status INTEGER,
  api_duration_ms INTEGER,
  -- Match outcome
  match_strategy TEXT,
  match_found BOOLEAN DEFAULT false,
  match_confidence INTEGER DEFAULT 0,
  matched_lead_id TEXT,
  -- Verification score
  verification_score INTEGER DEFAULT 0,
  verification_score_breakdown JSONB DEFAULT '{}',
  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  is_transient BOOLEAN DEFAULT false,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_error_logs_lead_id ON public.enrichment_error_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_error_logs_batch_id ON public.enrichment_error_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_error_logs_error_code ON public.enrichment_error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_enrichment_error_logs_resolved ON public.enrichment_error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_enrichment_error_logs_created_at ON public.enrichment_error_logs(created_at DESC);

ALTER TABLE public.enrichment_error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_enrichment_error_logs" ON public.enrichment_error_logs;
CREATE POLICY "authenticated_manage_enrichment_error_logs"
  ON public.enrichment_error_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── CSV import row-level outcome tracking ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.csv_import_row_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  raw_address TEXT,
  raw_contact TEXT,
  raw_phone TEXT,
  raw_state TEXT,
  -- Normalization
  normalized_address TEXT,
  normalized_phone TEXT,
  normalization_result JSONB DEFAULT '{}',
  -- Match
  match_strategy TEXT,
  match_found BOOLEAN DEFAULT false,
  matched_lead_id TEXT,
  match_confidence INTEGER DEFAULT 0,
  -- Outcome
  outcome TEXT NOT NULL DEFAULT 'ERROR',
  -- NEW | UPDATED_EXISTING | DUPLICATE_IN_FILE | UNCHANGED_EXISTING | REVIEW_REQUIRED | ERROR
  outcome_lead_id TEXT,
  outcome_detail TEXT,
  -- Verification
  verification_score INTEGER DEFAULT 0,
  verified_owner BOOLEAN DEFAULT false,
  verified_number BOOLEAN DEFAULT false,
  verified_address BOOLEAN DEFAULT false,
  -- Error
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_import_row_outcomes_batch_id ON public.csv_import_row_outcomes(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_csv_import_row_outcomes_outcome ON public.csv_import_row_outcomes(outcome);
CREATE INDEX IF NOT EXISTS idx_csv_import_row_outcomes_matched_lead ON public.csv_import_row_outcomes(matched_lead_id);

ALTER TABLE public.csv_import_row_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_csv_import_row_outcomes" ON public.csv_import_row_outcomes;
CREATE POLICY "authenticated_manage_csv_import_row_outcomes"
  ON public.csv_import_row_outcomes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Extend csv_import_batches with per-outcome counts ────────────────────────
ALTER TABLE public.csv_import_batches
  ADD COLUMN IF NOT EXISTS rows_new INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_updated_existing INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_duplicate_in_file INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_unchanged_existing INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_review_required INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_error INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dedup_audit_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dedup_audit_completed_at TIMESTAMPTZ;

-- ─── Extend leads with enrichment retry and error tracking ───────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enrichment_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_last_error TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_is_transient_error BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_import_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS source_property_id TEXT,
  ADD COLUMN IF NOT EXISTS apn TEXT,
  ADD COLUMN IF NOT EXISTS match_strategy TEXT,
  ADD COLUMN IF NOT EXISTS match_confidence INTEGER DEFAULT 0;

-- ─── Dedup fingerprint index ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_dedup_fingerprint ON public.leads(dedup_fingerprint) WHERE dedup_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source_property_id ON public.leads(source_property_id) WHERE source_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_apn ON public.leads(apn) WHERE apn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_standardized_address ON public.leads(standardized_address) WHERE standardized_address IS NOT NULL;
