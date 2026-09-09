-- ============================================================
-- TRAVLR — Bulk Enrichment Queue, Benchmark, Economics, Provider Health
-- Migration: 20260912000000_bulk_enrichment_queue_benchmark_economics.sql
-- ============================================================

-- ─── 1. Bulk Enrichment Batch Jobs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_batch_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name            TEXT,
  scope                 TEXT NOT NULL DEFAULT 'HIGH_PRIORITY_MISSING_PHONE',
  -- SELECTED_LEADS | HIGH_PRIORITY_MISSING_PHONE | MISSING_OWNER | MISSING_PHONE
  -- MISSING_OWNER_AND_PHONE | VERIFIED_ADDRESS_MISSING_PHONE | ENTIRE_PORTFOLIO | ALL_ELIGIBLE

  status                TEXT NOT NULL DEFAULT 'QUEUED',
  -- QUEUED | RUNNING | PAUSED | COMPLETED | CANCELLED | FAILED

  priority_strategy     TEXT NOT NULL DEFAULT 'HIGH_PRIORITY_VERIFIED_MISSING_PHONE',
  -- Configurable: HIGH_PRIORITY_VERIFIED_MISSING_PHONE | SCORE_DESC | CUSTOM

  total_leads           INTEGER DEFAULT 0,
  processed             INTEGER DEFAULT 0,
  property_matches      INTEGER DEFAULT 0,
  owners_found          INTEGER DEFAULT 0,
  phones_found          INTEGER DEFAULT 0,
  emails_found          INTEGER DEFAULT 0,
  auto_accepted         INTEGER DEFAULT 0,
  review_required       INTEGER DEFAULT 0,
  no_match              INTEGER DEFAULT 0,
  errors                INTEGER DEFAULT 0,
  skipped               INTEGER DEFAULT 0,

  estimated_cost_cents  INTEGER DEFAULT 0,
  actual_cost_cents     INTEGER DEFAULT 0,

  -- Budget guard
  budget_limit_cents    INTEGER,
  budget_paused_at      TIMESTAMPTZ,

  -- Concurrency config
  concurrency_limit     INTEGER DEFAULT 5,
  batch_size            INTEGER DEFAULT 50,
  retry_limit           INTEGER DEFAULT 3,

  -- Lifecycle
  created_by            UUID,
  started_at            TIMESTAMPTZ,
  paused_at             TIMESTAMPTZ,
  resumed_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- Filters used
  filter_portfolio_id   TEXT,
  filter_lead_ids       TEXT[],
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status
  ON public.enrichment_batch_jobs (status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at
  ON public.enrichment_batch_jobs (created_at DESC);

ALTER TABLE public.enrichment_batch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_enrichment_batch_jobs" ON public.enrichment_batch_jobs;
CREATE POLICY "auth_enrichment_batch_jobs"
  ON public.enrichment_batch_jobs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 2. Enrichment Queue Items (per-lead within a batch) ─────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_queue_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id          UUID REFERENCES public.enrichment_batch_jobs(id) ON DELETE CASCADE,
  lead_id               TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  status                TEXT NOT NULL DEFAULT 'QUEUED',
  -- QUEUED | RUNNING | PROPERTY_MATCHED | OWNER_FOUND | CONTACT_FOUND
  -- AUTO_ACCEPTED | REVIEW_REQUIRED | NO_MATCH | RATE_LIMITED | PROVIDER_ERROR | FAILED

  priority              INTEGER DEFAULT 5,
  provider              TEXT DEFAULT 'PROPERTYREACH',

  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,

  result_type           TEXT,
  -- OWNER_FOUND | PHONE_FOUND | BOTH_FOUND | OWNER_ONLY | PHONE_ONLY | NO_MATCH | CONFLICT

  cost_cents            INTEGER DEFAULT 0,
  retry_count           INTEGER DEFAULT 0,
  error_code            TEXT,
  error_message         TEXT,

  -- Link to enrichment job
  enrichment_job_id     UUID REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL,
  pr_job_id             UUID REFERENCES public.propertyreach_enrichment_jobs(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_items_batch_job_id
  ON public.enrichment_queue_items (batch_job_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_lead_id
  ON public.enrichment_queue_items (lead_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_status
  ON public.enrichment_queue_items (status);

ALTER TABLE public.enrichment_queue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_enrichment_queue_items" ON public.enrichment_queue_items;
CREATE POLICY "auth_enrichment_queue_items"
  ON public.enrichment_queue_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 3. Provider Health Tracking ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_provider_health_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | DEGRADED | RATE_LIMITED | AUTH_ERROR | DISABLED

  last_success_at       TIMESTAMPTZ,
  last_failure_at       TIMESTAMPTZ,
  last_failure_code     TEXT,
  last_failure_message  TEXT,

  requests_today        INTEGER DEFAULT 0,
  successes_today       INTEGER DEFAULT 0,
  failures_today        INTEGER DEFAULT 0,
  avg_response_ms       INTEGER DEFAULT 0,
  success_rate          NUMERIC(5,2) DEFAULT 100.00,

  -- Rate limit tracking
  rate_limit_hit_at     TIMESTAMPTZ,
  rate_limit_reset_at   TIMESTAMPTZ,

  recorded_at           TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_health_provider
  ON public.enrichment_provider_health_log (provider_name, recorded_at DESC);

ALTER TABLE public.enrichment_provider_health_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_provider_health_log" ON public.enrichment_provider_health_log;
CREATE POLICY "auth_provider_health_log"
  ON public.enrichment_provider_health_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 4. Enrichment Cost Tracking (per-request) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_cost_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id          UUID REFERENCES public.enrichment_batch_jobs(id) ON DELETE SET NULL,
  queue_item_id         UUID REFERENCES public.enrichment_queue_items(id) ON DELETE SET NULL,
  enrichment_job_id     UUID REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL,
  pr_job_id             UUID REFERENCES public.propertyreach_enrichment_jobs(id) ON DELETE SET NULL,

  lead_id               TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL,
  endpoint              TEXT,
  request_type          TEXT,
  -- PROPERTY_SEARCH | PROPERTY_DETAILS | SKIP_TRACE | OWNER_LOOKUP | PHONE_LOOKUP

  credits_used          INTEGER DEFAULT 0,
  estimated_cost_cents  INTEGER DEFAULT 0,
  success               BOOLEAN DEFAULT FALSE,
  result_type           TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_records_provider
  ON public.enrichment_cost_records (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_records_lead_id
  ON public.enrichment_cost_records (lead_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_batch_job_id
  ON public.enrichment_cost_records (batch_job_id);

ALTER TABLE public.enrichment_cost_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_enrichment_cost_records" ON public.enrichment_cost_records;
CREATE POLICY "auth_enrichment_cost_records"
  ON public.enrichment_cost_records FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 5. Benchmark Runs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_benchmark_runs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_name                  TEXT,
  provider                  TEXT NOT NULL DEFAULT 'PROPERTYREACH',
  status                    TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING | RUNNING | COMPLETED | FAILED

  sample_size               INTEGER DEFAULT 0,
  properties_tested         INTEGER DEFAULT 0,

  -- Property matching
  property_match_count      INTEGER DEFAULT 0,
  property_match_pct        NUMERIC(5,2) DEFAULT 0,
  property_ambiguous_count  INTEGER DEFAULT 0,
  property_not_found_count  INTEGER DEFAULT 0,
  property_conflict_count   INTEGER DEFAULT 0,

  -- Owner accuracy
  owner_exact_match_count   INTEGER DEFAULT 0,
  owner_exact_match_pct     NUMERIC(5,2) DEFAULT 0,
  owner_acceptable_count    INTEGER DEFAULT 0,
  owner_acceptable_pct      NUMERIC(5,2) DEFAULT 0,
  wrong_owner_count         INTEGER DEFAULT 0,
  wrong_owner_pct           NUMERIC(5,2) DEFAULT 0,
  no_owner_result_count     INTEGER DEFAULT 0,
  no_owner_result_pct       NUMERIC(5,2) DEFAULT 0,

  -- Phone accuracy
  phone_exact_match_count   INTEGER DEFAULT 0,
  phone_exact_match_pct     NUMERIC(5,2) DEFAULT 0,
  phone_match_among_returned INTEGER DEFAULT 0,
  wrong_phone_count         INTEGER DEFAULT 0,
  wrong_phone_pct           NUMERIC(5,2) DEFAULT 0,
  no_phone_result_count     INTEGER DEFAULT 0,
  no_phone_result_pct       NUMERIC(5,2) DEFAULT 0,

  -- Critical quality metrics
  wrong_owner_auto_accepted INTEGER DEFAULT 0,
  wrong_phone_auto_accepted INTEGER DEFAULT 0,
  review_required_count     INTEGER DEFAULT 0,
  review_required_pct       NUMERIC(5,2) DEFAULT 0,

  -- Email
  email_match_count         INTEGER DEFAULT 0,
  email_match_pct           NUMERIC(5,2) DEFAULT 0,

  -- Cost/performance
  avg_cost_per_property_cents INTEGER DEFAULT 0,
  avg_response_ms           INTEGER DEFAULT 0,
  total_cost_cents          INTEGER DEFAULT 0,

  -- Thresholds used
  auto_accept_threshold     INTEGER DEFAULT 85,
  review_threshold          INTEGER DEFAULT 65,

  -- Confusion matrix
  true_match_count          INTEGER DEFAULT 0,
  false_match_count         INTEGER DEFAULT 0,
  no_match_count            INTEGER DEFAULT 0,
  ambiguous_count           INTEGER DEFAULT 0,
  conflict_count            INTEGER DEFAULT 0,

  notes                     TEXT,
  created_by                UUID,
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_runs_status
  ON public.enrichment_benchmark_runs (status, created_at DESC);

ALTER TABLE public.enrichment_benchmark_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_benchmark_runs" ON public.enrichment_benchmark_runs;
CREATE POLICY "auth_benchmark_runs"
  ON public.enrichment_benchmark_runs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 6. Benchmark Detail Records (per-property) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_benchmark_details (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID REFERENCES public.enrichment_benchmark_runs(id) ON DELETE CASCADE,
  lead_id               TEXT REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Known (manual) data — hidden from matching decision
  manual_owner_name     TEXT,
  manual_phone_e164     TEXT,
  manual_address        TEXT,

  -- PropertyReach returned
  pr_owner_name         TEXT,
  pr_phone_e164         TEXT,
  pr_property_id        TEXT,
  pr_confidence_score   INTEGER,
  pr_match_decision     TEXT,

  -- Comparison results
  owner_match           TEXT DEFAULT 'NO_RESULT',
  -- EXACT_MATCH | ACCEPTABLE_MATCH | WRONG_OWNER | NO_RESULT
  phone_match           TEXT DEFAULT 'NO_RESULT',
  -- EXACT_MATCH | WRONG_PHONE | NO_RESULT

  confusion_class       TEXT DEFAULT 'NO_MATCH',
  -- TRUE_MATCH | FALSE_MATCH | NO_MATCH | AMBIGUOUS | CONFLICT

  -- State/type breakdown
  property_state        TEXT,
  owner_type            TEXT,
  property_type         TEXT,
  confidence_range      TEXT,
  -- HIGH (85+) | MEDIUM (65-84) | LOW (<65)

  cost_cents            INTEGER DEFAULT 0,
  response_ms           INTEGER DEFAULT 0,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_details_run_id
  ON public.enrichment_benchmark_details (run_id);

ALTER TABLE public.enrichment_benchmark_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_benchmark_details" ON public.enrichment_benchmark_details;
CREATE POLICY "auth_benchmark_details"
  ON public.enrichment_benchmark_details FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 7. Enrichment Settings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key               TEXT NOT NULL UNIQUE,
  setting_value             TEXT NOT NULL,
  setting_type              TEXT NOT NULL DEFAULT 'string',
  -- string | integer | boolean | decimal
  label                     TEXT,
  description               TEXT,
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_by                UUID
);

ALTER TABLE public.enrichment_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_enrichment_settings" ON public.enrichment_settings;
CREATE POLICY "auth_enrichment_settings"
  ON public.enrichment_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Seed default settings (idempotent)
INSERT INTO public.enrichment_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  ('propertyreach_enabled',       'false',  'boolean', 'PropertyReach Enabled',         'Master switch for PropertyReach API calls'),
  ('auto_enrichment_enabled',     'false',  'boolean', 'Auto Enrichment Enabled',       'Allow scheduled/automatic enrichment jobs'),
  ('auto_accept_enabled',         'false',  'boolean', 'Auto Accept Enabled',           'DISABLED until benchmark validates accuracy. Enable only after benchmark shows <1% wrong owner.'),
  ('auto_accept_threshold',       '85',     'integer', 'Auto Accept Threshold',         'Confidence score >= this value qualifies for auto-accept (requires property+owner+phone multi-signal)'),
  ('review_threshold',            '65',     'integer', 'Review Required Threshold',     'Score >= this but below auto-accept goes to review queue'),
  ('monthly_budget_cents',        '50000',  'integer', 'Monthly Budget (cents)',         'Maximum spend per month in cents ($500 = 50000). 0 = unlimited'),
  ('budget_warn_pct',             '80',     'integer', 'Budget Warning %',              'Warn when this % of monthly budget is reached'),
  ('batch_size',                  '50',     'integer', 'Batch Size',                    'Number of leads per batch job'),
  ('concurrency_limit',           '5',      'integer', 'Concurrency Limit',             'Max simultaneous PropertyReach requests'),
  ('retry_limit',                 '3',      'integer', 'Retry Limit',                   'Max retries per failed job (with exponential backoff)'),
  ('re_enrichment_interval_days', '90',     'integer', 'Re-Enrichment Interval (days)', 'Days before a previously enriched lead is eligible for re-enrichment'),
  ('enrichment_priority_strategy','HIGH_PRIORITY_VERIFIED_MISSING_PHONE', 'string', 'Priority Strategy', 'Default bulk enrichment priority order')
ON CONFLICT (setting_key) DO NOTHING;

-- ─── 8. Add PropertyReach to provider registry (idempotent) ──────────────────

INSERT INTO public.enrichment_provider_registry
  (provider_name, provider_type, automation_allowed, allowed_uses, prohibited_uses,
   retention_rules, rate_limit_per_min, rate_limit_per_day, health_status, enabled, notes)
VALUES
  ('PROPERTYREACH', 'COMBINED', true,
   ARRAY['property_lookup','owner_lookup','skip_trace','phone_lookup','address_verification'],
   ARRAY['scraping','unauthorized_bulk','captcha_bypass','proxy_rotation'],
   'Per PropertyReach API contract',
   10, 500, 'ACTIVE', false,
   'Primary enrichment provider. Priority=1. Requires PROPERTYREACH_API_KEY env var.')
ON CONFLICT (provider_name) DO NOTHING;

-- Add PropertyReach to waterfall config
INSERT INTO public.enrichment_waterfall_config
  (step_order, provider_name, provider_type, enabled, skip_if_score_gte, notes)
VALUES
  (0, 'PROPERTYREACH', 'COMBINED', false, 85,
   'Step 0 (Primary): PropertyReach property match + owner + phone enrichment')
ON CONFLICT DO NOTHING;

-- ─── 9. Add enrichment coverage fields to leads ──────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_enriched_by TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_source TEXT,
  ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_freshness TEXT DEFAULT 'UNKNOWN',
  -- CURRENT | REVIEW_DUE | STALE | UNKNOWN
  ADD COLUMN IF NOT EXISTS phone_available BOOLEAN GENERATED ALWAYS AS (
    verified_number = true AND contact_phone IS NOT NULL
  ) STORED;

-- Safe: only add if not exists (phone_available may already exist)
-- If the generated column already exists as a regular column, this is a no-op due to IF NOT EXISTS

CREATE INDEX IF NOT EXISTS idx_leads_last_enriched_at
  ON public.leads (last_enriched_at)
  WHERE last_enriched_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_phone_available
  ON public.leads (phone_available)
  WHERE phone_available = true;

-- ─── 10. Enrichment Activity Events ──────────────────────────────────────────

-- Extend enrichment_event_type enum safely
DO $$
BEGIN
  -- Add new event types if they don't exist
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'PROPERTY_ENRICHMENT_STARTED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'PROPERTYREACH_PROPERTY_MATCHED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'OWNER_ENRICHED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'PHONE_ENRICHED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'EMAIL_ENRICHED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'CONTACT_AUTO_ACCEPTED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'CONTACT_REVIEW_REQUIRED';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'CONTACT_ACCEPTED_BY_ADMIN';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'CONTACT_REJECTED_BY_ADMIN';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'OWNER_CONFLICT';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.enrichment_event_type ADD VALUE IF NOT EXISTS 'PHONE_CONFLICT';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
