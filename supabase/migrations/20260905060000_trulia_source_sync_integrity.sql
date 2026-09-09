-- ============================================================
-- TRULIA SOURCE SYNC INTEGRITY & VALIDATION SYSTEM
-- Migration: 20260905060000_trulia_source_sync_integrity.sql
-- ============================================================

-- ─── 1. Trulia Source Configurations ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_source_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                   TEXT NOT NULL UNIQUE,          -- e.g. "trulia_az_standard"
  provider                    TEXT NOT NULL DEFAULT 'TRULIA',
  state_code                  TEXT NOT NULL,                 -- e.g. "AZ"
  source_url_raw              TEXT NOT NULL,                 -- as provided in PDF
  source_url_canonical        TEXT NOT NULL,                 -- normalized https://www.trulia.com/...
  source_tier                 TEXT NOT NULL CHECK (source_tier IN ('STANDARD','LUXURY')),
  minimum_rent                INTEGER NOT NULL,              -- e.g. 5000
  property_types              TEXT[] NOT NULL DEFAULT ARRAY['SINGLE-FAMILY_HOME','TOWNHOUSE'],
  furnished_required          BOOLEAN NOT NULL DEFAULT TRUE,
  active                      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Validation state
  url_valid                   BOOLEAN,
  state_match                 BOOLEAN,
  filter_match                BOOLEAN,
  is_duplicate                BOOLEAN DEFAULT FALSE,
  validation_status           TEXT,  -- VALID | INVALID_URL | STATE_MISMATCH | FILTER_MISMATCH | DUPLICATE_SOURCE | SOURCE_ACCESS_UNAVAILABLE | DISABLED
  validation_notes            TEXT,
  -- Health tracking
  health_status               TEXT DEFAULT 'UNKNOWN',  -- HEALTHY | PARTIAL | NO_RESULTS | SUSPECT_ZERO_RESULTS | INVALID_CONFIG | AUTH_ERROR | SOURCE_ERROR | PARSING_ERROR | VALIDATION_ERROR | DATA_ERROR
  last_attempt_at             TIMESTAMPTZ,
  last_successful_fetch_at    TIMESTAMPTZ,
  last_successful_ingestion_at TIMESTAMPTZ,
  last_error                  TEXT,
  -- Counters (last sync)
  last_source_results_returned INTEGER,
  last_records_parsed          INTEGER,
  last_records_normalized      INTEGER,
  last_state_validated         INTEGER,
  last_filter_validated        INTEGER,
  last_properties_verified     INTEGER,
  last_new_prospects_inserted  INTEGER,
  last_existing_prospects_updated INTEGER,
  last_duplicates_merged       INTEGER,
  last_rejected_invalid        INTEGER,
  last_rejected_wrong_state    INTEGER,
  last_rejected_filter_mismatch INTEGER,
  last_errors_count            INTEGER,
  -- Pagination tracking
  last_pages_available         INTEGER,
  last_pages_requested         INTEGER,
  last_pages_succeeded         INTEGER,
  last_pages_failed            INTEGER,
  -- Timestamps
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Source Sync Runs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_sync_runs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                      TEXT NOT NULL UNIQUE DEFAULT ('run_' || extract(epoch from now())::bigint::text),
  triggered_by                TEXT,                          -- admin user id or 'system'
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'RUNNING',  -- RUNNING | SUCCESS | PARTIAL | FAILED | DATA_ERROR
  -- Batch counters
  sources_attempted           INTEGER DEFAULT 0,
  sources_healthy             INTEGER DEFAULT 0,
  sources_partial             INTEGER DEFAULT 0,
  sources_failed              INTEGER DEFAULT 0,
  source_results_returned     INTEGER DEFAULT 0,
  records_parsed              INTEGER DEFAULT 0,
  records_normalized          INTEGER DEFAULT 0,
  records_validated           INTEGER DEFAULT 0,
  new_prospects_inserted      INTEGER DEFAULT 0,
  existing_prospects_updated  INTEGER DEFAULT 0,
  duplicates_merged           INTEGER DEFAULT 0,
  csv_matches                 INTEGER DEFAULT 0,
  luxury_matches              INTEGER DEFAULT 0,
  rejected_wrong_state        INTEGER DEFAULT 0,
  rejected_invalid_address    INTEGER DEFAULT 0,
  rejected_filter_mismatch    INTEGER DEFAULT 0,
  errors_count                INTEGER DEFAULT 0,
  -- UI reconciliation
  prospect_finder_count_before INTEGER,
  prospect_finder_count_after  INTEGER,
  lead_management_count        INTEGER,
  dashboard_total_leads        INTEGER,
  -- Pipeline safety
  active_pipeline_before       INTEGER,
  active_pipeline_after        INTEGER,
  pipeline_stage_changes_from_sync INTEGER DEFAULT 0,  -- MUST always be 0
  -- Notes
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Per-Source Sync Results ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_source_sync_results (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id                 UUID REFERENCES public.trulia_sync_runs(id) ON DELETE CASCADE,
  source_config_id            UUID REFERENCES public.trulia_source_configs(id),
  source_id                   TEXT NOT NULL,
  state_code                  TEXT NOT NULL,
  source_tier                 TEXT NOT NULL,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  -- Access result
  access_method               TEXT,                          -- AUTHORIZED_API | SOURCE_ACCESS_UNAVAILABLE
  http_status                 INTEGER,
  request_successful          BOOLEAN,
  response_schema_valid       BOOLEAN,
  -- Pipeline counters (NEVER NULL — use -1 for DATA_ERROR)
  source_results_returned     INTEGER NOT NULL DEFAULT -1,
  records_parsed              INTEGER NOT NULL DEFAULT -1,
  records_normalized          INTEGER NOT NULL DEFAULT -1,
  state_validated             INTEGER NOT NULL DEFAULT -1,
  filter_validated            INTEGER NOT NULL DEFAULT -1,
  properties_verified         INTEGER NOT NULL DEFAULT -1,
  new_prospects_inserted      INTEGER NOT NULL DEFAULT -1,
  existing_prospects_updated  INTEGER NOT NULL DEFAULT -1,
  duplicates_merged           INTEGER NOT NULL DEFAULT -1,
  rejected_invalid            INTEGER NOT NULL DEFAULT -1,
  rejected_wrong_state        INTEGER NOT NULL DEFAULT -1,
  rejected_filter_mismatch    INTEGER NOT NULL DEFAULT -1,
  errors_count                INTEGER NOT NULL DEFAULT 0,
  -- Pagination
  pages_available             INTEGER,
  pages_requested             INTEGER,
  pages_succeeded             INTEGER,
  pages_failed                INTEGER,
  -- Status
  sync_status                 TEXT NOT NULL DEFAULT 'RUNNING',
  -- HEALTHY | PARTIAL | NO_RESULTS | SUSPECT_ZERO_RESULTS | INVALID_CONFIG | AUTH_ERROR | SOURCE_ERROR | PARSING_ERROR | VALIDATION_ERROR | DATA_ERROR
  health_status               TEXT,
  last_error                  TEXT,
  attempt_count               INTEGER DEFAULT 1,
  next_retry_at               TIMESTAMPTZ,
  -- Reconciliation equation: validated = new + updated + deduped + rejected
  reconciliation_valid        BOOLEAN,
  reconciliation_notes        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Source Observations (Prospect ↔ Source provenance) ───────────────────

CREATE TABLE IF NOT EXISTS public.trulia_source_observations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id                 UUID NOT NULL,                 -- canonical lead id
  source_config_id            UUID REFERENCES public.trulia_source_configs(id),
  source_id                   TEXT NOT NULL,
  provider_property_id        TEXT,
  provider_listing_id         TEXT,
  source_tier                 TEXT NOT NULL,                 -- STANDARD | LUXURY
  source_url                  TEXT NOT NULL,
  listing_url                 TEXT,                          -- individual property listing URL (NOT search URL)
  first_seen_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_rent               INTEGER,
  observed_listing_status     TEXT,                          -- Active | Pending | Off Market | Rented
  listing_presence_status     TEXT DEFAULT 'ACTIVE',         -- ACTIVE | NOT_SEEN_THIS_SYNC | STALE | REMOVED_FROM_SOURCE
  source_observation_status   TEXT DEFAULT 'ACTIVE',
  -- Luxury provenance
  luxury_source_match         BOOLEAN DEFAULT FALSE,
  luxury_classification_source TEXT,                         -- SOURCE_MATCH
  luxury_observed_rent        INTEGER,
  luxury_observed_at          TIMESTAMPTZ,
  -- Furnished
  furnished_status            TEXT,                          -- confirmed | unconfirmed | unknown
  furnished_source            TEXT,                          -- SOURCE_REQUESTED | PROPERTY_CONFIRMED
  -- Property type
  property_type_observed      TEXT,
  -- Dedup
  dedup_match_method          TEXT,                          -- PROVIDER_ID | APN | EXACT_ADDRESS | NORMALIZED_ADDRESS | HIGH_CONFIDENCE_MATCH
  -- Sync run reference
  sync_run_id                 UUID REFERENCES public.trulia_sync_runs(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prospect_id, source_id)
);

-- ─── 5. Sync Pipeline Audit Log ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_pipeline_audit_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id                 UUID REFERENCES public.trulia_sync_runs(id),
  source_id                   TEXT,
  event_type                  TEXT NOT NULL,
  -- e.g. FETCH_STARTED | FETCH_COMPLETE | FETCH_FAILED | PARSE_COMPLETE | NORMALIZE_COMPLETE
  --      VALIDATE_COMPLETE | DEDUP_COMPLETE | UPSERT_COMPLETE | SOURCE_ACCESS_UNAVAILABLE
  --      PROPERTY_STATE_MISMATCH | SOURCE_FILTER_MISMATCH | PIPELINE_STAGE_PROTECTED
  --      SUSPECT_ZERO_RESULTS | PARTIAL_RESULTS | RECONCILIATION_COMPLETE
  prospect_id                 UUID,
  provider_property_id        TEXT,
  provider_listing_id         TEXT,
  raw_address                 TEXT,
  standardized_address        TEXT,
  state_code                  TEXT,
  source_tier                 TEXT,
  event_data                  JSONB DEFAULT '{}',
  error_code                  TEXT,
  error_message               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. Random Sample Audit ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_sample_audits (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id                 UUID REFERENCES public.trulia_sync_runs(id),
  source_id                   TEXT NOT NULL,
  source_tier                 TEXT NOT NULL,
  state_code                  TEXT NOT NULL,
  -- Source record
  source_property_id          TEXT,
  source_address              TEXT,
  source_rent                 INTEGER,
  source_property_type        TEXT,
  source_listing_url          TEXT,
  -- Canonical record
  canonical_prospect_id       UUID,
  canonical_address           TEXT,
  canonical_state             TEXT,
  canonical_rent              INTEGER,
  canonical_tier              TEXT,
  -- Audit results
  address_match               BOOLEAN,
  state_match                 BOOLEAN,
  rent_match                  BOOLEAN,
  property_type_match         BOOLEAN,
  listing_url_match           BOOLEAN,
  tier_correct                BOOLEAN,
  canonical_exists            BOOLEAN,
  -- Overall
  audit_status                TEXT,  -- PASS | FAIL | PARTIAL | MISSING_CANONICAL
  audit_notes                 TEXT,
  audited_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. Existing Prospect Trulia Provenance Audit ────────────────────────────

CREATE TABLE IF NOT EXISTS public.trulia_provenance_audit (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prospect_id                 UUID NOT NULL,
  -- Provenance checks
  has_source_id               BOOLEAN DEFAULT FALSE,
  has_source_observation      BOOLEAN DEFAULT FALSE,
  has_provider_id             BOOLEAN DEFAULT FALSE,
  has_valid_address           BOOLEAN DEFAULT FALSE,
  state_match                 BOOLEAN,
  portfolio_match             BOOLEAN,
  has_listing_url             BOOLEAN DEFAULT FALSE,
  listing_url_valid           BOOLEAN,
  -- Integrity flags
  is_duplicate_candidate      BOOLEAN DEFAULT FALSE,
  luxury_classification_mismatch BOOLEAN DEFAULT FALSE,
  pipeline_contamination      BOOLEAN DEFAULT FALSE,
  is_synthetic_suspect        BOOLEAN DEFAULT FALSE,
  -- Status
  audit_status                TEXT,  -- VALID_PROVENANCE | MISSING_SOURCE_ID | MISSING_OBSERVATION | INVALID_ADDRESS | STATE_MISMATCH | PORTFOLIO_MISMATCH | DUPLICATE_CANDIDATE | LUXURY_MISMATCH | PIPELINE_CONTAMINATION | DATA_INTEGRITY_REVIEW
  review_notes                TEXT,
  quarantine_flag             BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. Seed Trulia Source Configurations ────────────────────────────────────
-- All 25 states from the PDF, with correct STANDARD/LUXURY tiers and rent thresholds.
-- URL normalization: all raw URLs canonicalized to https://www.trulia.com/...

-- Idempotent guard: if the table already existed from a prior partial run without
-- the provider column, add it now before the seed INSERT references it.
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'TRULIA';
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS source_url_raw TEXT NOT NULL DEFAULT '';
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS source_url_canonical TEXT NOT NULL DEFAULT '';
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS source_tier TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS minimum_rent INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS property_types TEXT[] NOT NULL DEFAULT ARRAY['SINGLE-FAMILY_HOME','TOWNHOUSE'];
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS furnished_required BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS url_valid BOOLEAN;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS state_match BOOLEAN;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS filter_match BOOLEAN;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS validation_status TEXT;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS validation_notes TEXT;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'UNKNOWN';
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_successful_fetch_at TIMESTAMPTZ;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_successful_ingestion_at TIMESTAMPTZ;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_source_results_returned INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_records_parsed INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_records_normalized INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_state_validated INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_filter_validated INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_properties_verified INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_new_prospects_inserted INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_existing_prospects_updated INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_duplicates_merged INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_rejected_invalid INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_rejected_wrong_state INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_rejected_filter_mismatch INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_errors_count INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_pages_available INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_pages_requested INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_pages_succeeded INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS last_pages_failed INTEGER;
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- source_name may exist from a prior migration (20260904900000) with NOT NULL constraint
ALTER TABLE public.trulia_source_configs
  ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT '';

DO $$
DECLARE
  v_sources JSONB := '[
    {"source_id":"trulia_az_standard","state_code":"AZ","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/AZ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/AZ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_az_luxury_15k","state_code":"AZ","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/AZ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/AZ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ca_standard","state_code":"CA","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/CA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/CA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ca_luxury_15k","state_code":"CA","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/CA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/CA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_co_standard","state_code":"CO","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/CO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/CO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_co_luxury_15k","state_code":"CO","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/CO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/CO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_fl_standard","state_code":"FL","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/FL/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/FL/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_fl_luxury_15k","state_code":"FL","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/FL/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/FL/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ga_standard","state_code":"GA","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/GA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/GA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ga_luxury_15k","state_code":"GA","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/GA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/GA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_id_standard","state_code":"ID","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/ID/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/ID/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_id_luxury_15k","state_code":"ID","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/ID/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/ID/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ks_standard","state_code":"KS","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/KS/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/KS/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ks_luxury_15k","state_code":"KS","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/KS/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/KS/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ma_standard","state_code":"MA","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/MA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ma_luxury_15k","state_code":"MA","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/MA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ma_luxury_10k","state_code":"MA","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/MA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_md_standard","state_code":"MD","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/MD/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MD/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_md_luxury_10k","state_code":"MD","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/MD/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MD/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mn_standard","state_code":"MN","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/MN/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MN/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mn_luxury_10k","state_code":"MN","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/MN/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MN/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mo_standard","state_code":"MO","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/MO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mo_luxury_10k","state_code":"MO","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/MO/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MO/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mo_luxury_15k","state_code":"MO","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/MO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mt_standard","state_code":"MT","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/MT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mt_luxury_10k","state_code":"MT","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/MT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_mt_luxury_15k","state_code":"MT","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/MT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/MT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nc_standard","state_code":"NC","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"trulia.com/for_rent/NC/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NC/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nc_luxury_10k","state_code":"NC","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"trulia.com/for_rent/NC/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NC/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nc_luxury_15k","state_code":"NC","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"trulia.com/for_rent/NC/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NC/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ne_standard","state_code":"NE","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NE/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NE/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ne_luxury_7500","state_code":"NE","source_tier":"LUXURY","minimum_rent":7500,"source_url_raw":"https://www.trulia.com/for_rent/NE/7500p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NE/7500p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ne_luxury_10k","state_code":"NE","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/NE/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NE/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nh_standard","state_code":"NH","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NH/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NH/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nh_luxury_10k","state_code":"NH","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/NH/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NH/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nh_luxury_15k","state_code":"NH","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/NH/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NH/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nj_standard","state_code":"NJ","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NJ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NJ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nj_luxury_10k","state_code":"NJ","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/NJ/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NJ/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nj_luxury_15k","state_code":"NJ","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/NJ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NJ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nm_standard","state_code":"NM","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NM/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NM/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nm_luxury_10k","state_code":"NM","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/NM/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NM/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nm_luxury_15k","state_code":"NM","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/NM/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NM/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nv_standard","state_code":"NV","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NV/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NV/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nv_luxury_10k","state_code":"NV","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/NV/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NV/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_nv_luxury_15k","state_code":"NV","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/NV/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NV/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ny_standard","state_code":"NY","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/NY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ny_luxury_15k","state_code":"NY","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/NY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/NY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_or_standard","state_code":"OR","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/OR/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/OR/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_or_luxury_10k","state_code":"OR","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/OR/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/OR/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_or_luxury_15k","state_code":"OR","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/OR/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/OR/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_tx_standard","state_code":"TX","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"trulia.com/for_rent/TX/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/TX/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_tx_luxury_10k","state_code":"TX","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"trulia.com/for_rent/TX/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/TX/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_tx_luxury_15k","state_code":"TX","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"trulia.com/for_rent/TX/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/TX/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ut_standard","state_code":"UT","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/UT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/UT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ut_luxury_10k","state_code":"UT","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/UT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/UT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_ut_luxury_15k","state_code":"UT","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/UT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/UT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_vt_standard","state_code":"VT","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/VT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/VT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_vt_luxury_10k","state_code":"VT","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/VT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/VT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_vt_luxury_15k","state_code":"VT","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/VT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/VT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wa_standard","state_code":"WA","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"trulia.com/for_rent/WA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wa_luxury_10k","state_code":"WA","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"trulia.com/for_rent/WA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wa_luxury_15k","state_code":"WA","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"trulia.com/for_rent/WA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wi_standard","state_code":"WI","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/WI/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WI/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wi_luxury_10k","state_code":"WI","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/WI/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WI/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wi_luxury_15k","state_code":"WI","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/WI/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WI/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wy_standard","state_code":"WY","source_tier":"STANDARD","minimum_rent":5000,"source_url_raw":"https://www.trulia.com/for_rent/WY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wy_luxury_10k","state_code":"WY","source_tier":"LUXURY","minimum_rent":10000,"source_url_raw":"https://www.trulia.com/for_rent/WY/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WY/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"},
    {"source_id":"trulia_wy_luxury_15k","state_code":"WY","source_tier":"LUXURY","minimum_rent":15000,"source_url_raw":"https://www.trulia.com/for_rent/WY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/","source_url_canonical":"https://www.trulia.com/for_rent/WY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/"}
  ]';
  v_src JSONB;
BEGIN
  FOR v_src IN SELECT * FROM jsonb_array_elements(v_sources)
  LOOP
    INSERT INTO public.trulia_source_configs (
      source_id, source_name, provider, state_code, source_url, source_url_raw, source_url_canonical,
      source_tier, minimum_rent, property_types, furnished_required, active,
      -- Run initial validation
      url_valid, state_match, filter_match, is_duplicate, validation_status
    ) VALUES (
      v_src->>'source_id',
      'Trulia ' || upper(v_src->>'state_code') || ' ' || initcap(lower(v_src->>'source_tier')) || ' $' || (v_src->>'minimum_rent') || '+',
      'TRULIA', v_src->>'state_code',
      v_src->>'source_url_canonical', v_src->>'source_url_raw', v_src->>'source_url_canonical',
      v_src->>'source_tier', (v_src->>'minimum_rent')::INTEGER,
      ARRAY['SINGLE-FAMILY_HOME','TOWNHOUSE'], TRUE, TRUE,
      -- URL valid: canonical URL contains https://www.trulia.com
      (v_src->>'source_url_canonical' LIKE 'https://www.trulia.com/%'),
      -- State match: URL contains the state code
      (v_src->>'source_url_canonical' LIKE '%/for_rent/' || (v_src->>'state_code') || '/%'),
      -- Filter match: URL contains rent threshold, property types, furnished
      (v_src->>'source_url_canonical' LIKE '%' || (v_src->>'minimum_rent') || 'p_price%'
       AND v_src->>'source_url_canonical' LIKE '%SINGLE-FAMILY_HOME,TOWNHOUSE_type%'
       AND v_src->>'source_url_canonical' LIKE '%1_furnished%'),
      FALSE,
      CASE
        WHEN NOT (v_src->>'source_url_canonical' LIKE 'https://www.trulia.com/%') THEN 'INVALID_URL'
        WHEN NOT (v_src->>'source_url_canonical' LIKE '%/for_rent/' || (v_src->>'state_code') || '/%') THEN 'STATE_MISMATCH'
        WHEN NOT (v_src->>'source_url_canonical' LIKE '%' || (v_src->>'minimum_rent') || 'p_price%') THEN 'FILTER_MISMATCH'
        ELSE 'VALID'
      END
    )
    ON CONFLICT (source_url) DO UPDATE SET
      source_id = EXCLUDED.source_id,
      source_name = EXCLUDED.source_name,
      source_url_canonical = EXCLUDED.source_url_canonical,
      source_url_raw = EXCLUDED.source_url_raw,
      url_valid = EXCLUDED.url_valid,
      state_match = EXCLUDED.state_match,
      filter_match = EXCLUDED.filter_match,
      validation_status = EXCLUDED.validation_status,
      updated_at = NOW();
  END LOOP;
END $$;

-- ─── 9. RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE public.trulia_source_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_source_sync_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_source_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_pipeline_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_sample_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trulia_provenance_audit ENABLE ROW LEVEL SECURITY;

-- Admin/operator/owner can read all
CREATE POLICY "trulia_source_configs_read" ON public.trulia_source_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_source_configs_write" ON public.trulia_source_configs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_sync_runs_read" ON public.trulia_sync_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_sync_runs_write" ON public.trulia_sync_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_source_sync_results_read" ON public.trulia_source_sync_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_source_sync_results_write" ON public.trulia_source_sync_results
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_source_observations_read" ON public.trulia_source_observations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_source_observations_write" ON public.trulia_source_observations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_pipeline_audit_log_read" ON public.trulia_pipeline_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_pipeline_audit_log_write" ON public.trulia_pipeline_audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_sample_audits_read" ON public.trulia_sample_audits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_sample_audits_write" ON public.trulia_sample_audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "trulia_provenance_audit_read" ON public.trulia_provenance_audit
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trulia_provenance_audit_write" ON public.trulia_provenance_audit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 10. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trulia_source_configs_state ON public.trulia_source_configs(state_code);
CREATE INDEX IF NOT EXISTS idx_trulia_source_configs_tier ON public.trulia_source_configs(source_tier);
CREATE INDEX IF NOT EXISTS idx_trulia_source_configs_active ON public.trulia_source_configs(active);
CREATE INDEX IF NOT EXISTS idx_trulia_source_configs_health ON public.trulia_source_configs(health_status);
CREATE INDEX IF NOT EXISTS idx_trulia_sync_runs_started ON public.trulia_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trulia_source_sync_results_run ON public.trulia_source_sync_results(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_trulia_source_sync_results_source ON public.trulia_source_sync_results(source_id);
CREATE INDEX IF NOT EXISTS idx_trulia_source_observations_prospect ON public.trulia_source_observations(prospect_id);
CREATE INDEX IF NOT EXISTS idx_trulia_source_observations_source ON public.trulia_source_observations(source_id);
CREATE INDEX IF NOT EXISTS idx_trulia_pipeline_audit_run ON public.trulia_pipeline_audit_log(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_trulia_pipeline_audit_prospect ON public.trulia_pipeline_audit_log(prospect_id);
CREATE INDEX IF NOT EXISTS idx_trulia_provenance_audit_prospect ON public.trulia_provenance_audit(prospect_id);
