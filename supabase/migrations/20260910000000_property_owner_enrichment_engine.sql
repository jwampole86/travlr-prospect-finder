-- ============================================================
-- TRAVLR — PROPERTY OWNER + PHONE ENRICHMENT ENGINE
-- Migration: 20260910000000_property_owner_enrichment_engine.sql
-- ============================================================

-- ─── ENUM TYPES ──────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.enrichment_job_status CASCADE;
CREATE TYPE public.enrichment_job_status AS ENUM (
  'PENDING', 'RUNNING', 'FOUND', 'REVIEW_REQUIRED', 'NO_MATCH', 'FAILED', 'RATE_LIMITED'
);

DROP TYPE IF EXISTS public.owner_type CASCADE;
CREATE TYPE public.owner_type AS ENUM (
  'INDIVIDUAL', 'JOINT_OWNERS', 'LLC', 'TRUST', 'CORPORATION', 'UNKNOWN'
);

DROP TYPE IF EXISTS public.match_confidence CASCADE;
CREATE TYPE public.match_confidence AS ENUM (
  'VERIFIED', 'HIGH_CONFIDENCE', 'MEDIUM_CONFIDENCE', 'LOW_CONFIDENCE', 'NO_MATCH', 'CONFLICT'
);

DROP TYPE IF EXISTS public.owner_match_status CASCADE;
CREATE TYPE public.owner_match_status AS ENUM (
  'PENDING_REVIEW', 'AUTO_ACCEPTED', 'ACCEPTED', 'REJECTED', 'CONFLICT'
);

DROP TYPE IF EXISTS public.phone_status CASCADE;
CREATE TYPE public.phone_status AS ENUM (
  'CURRENT_HIGH_CONFIDENCE', 'CURRENT_MEDIUM_CONFIDENCE', 'HISTORICAL', 'UNVERIFIED', 'INVALID', 'DNC', 'SUPPRESSED'
);

DROP TYPE IF EXISTS public.phone_type_enum CASCADE;
CREATE TYPE public.phone_type_enum AS ENUM (
  'MOBILE', 'LANDLINE', 'VOIP', 'UNKNOWN'
);

DROP TYPE IF EXISTS public.provider_type_enum CASCADE;
CREATE TYPE public.provider_type_enum AS ENUM (
  'PROPERTY', 'PEOPLE', 'PHONE', 'IDENTITY', 'COMBINED'
);

DROP TYPE IF EXISTS public.provider_health_status CASCADE;
CREATE TYPE public.provider_health_status AS ENUM (
  'ACTIVE', 'DEGRADED', 'RATE_LIMITED', 'AUTH_ERROR', 'DISABLED'
);

DROP TYPE IF EXISTS public.enrichment_event_type CASCADE;
CREATE TYPE public.enrichment_event_type AS ENUM (
  'OWNER_ENRICHMENT_STARTED',
  'OWNER_MATCH_FOUND',
  'OWNER_MATCH_ACCEPTED',
  'OWNER_MATCH_REJECTED',
  'PHONE_FOUND',
  'PHONE_VERIFIED',
  'CONTACT_ENRICHMENT_UPDATED',
  'CONTACT_CONFLICT_FOUND',
  'ENTITY_OWNER_FLAGGED',
  'ENRICHMENT_JOB_FAILED',
  'ENRICHMENT_JOB_RATE_LIMITED',
  'MANUAL_OVERRIDE_APPLIED'
);

DROP TYPE IF EXISTS public.data_freshness_status CASCADE;
CREATE TYPE public.data_freshness_status AS ENUM (
  'CURRENT', 'REVIEW_DUE', 'STALE'
);

-- ─── PROVIDER SOURCE TERMS REGISTRY ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_provider_registry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name        TEXT NOT NULL UNIQUE,
  provider_type        public.provider_type_enum NOT NULL,
  automation_allowed   BOOLEAN NOT NULL DEFAULT false,
  contract_reference   TEXT,
  allowed_uses         TEXT[],
  prohibited_uses      TEXT[],
  retention_rules      TEXT,
  rate_limit_per_min   INTEGER DEFAULT 60,
  rate_limit_per_day   INTEGER DEFAULT 1000,
  health_status        public.provider_health_status NOT NULL DEFAULT 'ACTIVE',
  enabled              BOOLEAN NOT NULL DEFAULT false,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ─── ENRICHMENT JOBS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  TEXT NOT NULL,
  property_id              TEXT,
  canonical_address        TEXT,
  city                     TEXT,
  state                    TEXT,
  zip                      TEXT,
  apn                      TEXT,
  property_provider_id     TEXT,
  raw_address              TEXT,
  normalized_address       TEXT,
  standardized_address     TEXT,
  job_status               public.enrichment_job_status NOT NULL DEFAULT 'PENDING',
  scope                    TEXT NOT NULL DEFAULT 'MISSING_OWNER_AND_PHONE',
  priority                 INTEGER NOT NULL DEFAULT 5,
  property_provider        TEXT,
  property_verified        BOOLEAN DEFAULT false,
  property_verified_at     TIMESTAMPTZ,
  owner_resolution_done    BOOLEAN DEFAULT false,
  phone_enrichment_done    BOOLEAN DEFAULT false,
  match_score              INTEGER,
  match_confidence         public.match_confidence,
  error_message            TEXT,
  retry_count              INTEGER DEFAULT 0,
  next_retry_at            TIMESTAMPTZ,
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  created_by               UUID,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- ─── OWNER CANDIDATES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_owner_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID REFERENCES public.enrichment_jobs(id) ON DELETE CASCADE,
  lead_id               TEXT NOT NULL,
  full_name             TEXT,
  first_name            TEXT,
  last_name             TEXT,
  owner_type            public.owner_type NOT NULL DEFAULT 'UNKNOWN',
  ownership_confidence  INTEGER DEFAULT 0,
  source_provider       TEXT,
  source_record_id      TEXT,
  source_retrieved_at   TIMESTAMPTZ,
  mailing_address       TEXT,
  mailing_city          TEXT,
  mailing_state         TEXT,
  mailing_zip           TEXT,
  is_entity             BOOLEAN DEFAULT false,
  entity_name           TEXT,
  entity_review_required BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ─── PROPERTY OWNER MATCH ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_owner_matches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  TEXT NOT NULL,
  contact_id               TEXT,
  owner_name               TEXT,
  owner_type               public.owner_type NOT NULL DEFAULT 'UNKNOWN',
  confidence               public.match_confidence NOT NULL DEFAULT 'NO_MATCH',
  match_score              INTEGER DEFAULT 0,
  match_status             public.owner_match_status NOT NULL DEFAULT 'PENDING_REVIEW',
  source_provider          TEXT,
  source_record_id         TEXT,
  source_retrieved_at      TIMESTAMPTZ,
  source_query_fingerprint TEXT,
  match_reasons            JSONB DEFAULT '[]'::jsonb,
  evidence                 JSONB DEFAULT '{}'::jsonb,
  owner_verification_source TEXT,
  owner_verification_method TEXT,
  owner_verified_at        TIMESTAMPTZ,
  owner_confidence         INTEGER DEFAULT 0,
  verified_owner           BOOLEAN DEFAULT false,
  is_manual_research       BOOLEAN DEFAULT false,
  manual_research_by       UUID,
  manual_research_at       TIMESTAMPTZ,
  reviewed_at              TIMESTAMPTZ,
  reviewed_by              UUID,
  review_reason            TEXT,
  reject_reason            TEXT,
  conflict_with_match_id   UUID,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- ─── CONTACT PHONE EVIDENCE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_phone_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               TEXT NOT NULL,
  contact_id            TEXT,
  match_id              UUID REFERENCES public.property_owner_matches(id) ON DELETE SET NULL,
  phone_e164            TEXT NOT NULL,
  phone_raw             TEXT,
  phone_type            public.phone_type_enum DEFAULT 'UNKNOWN',
  phone_status          public.phone_status NOT NULL DEFAULT 'UNVERIFIED',
  provider              TEXT,
  provider_record_id    TEXT,
  confidence            INTEGER DEFAULT 0,
  association_type      TEXT,
  rank_order            INTEGER DEFAULT 99,
  is_selected           BOOLEAN DEFAULT false,
  is_manual_research    BOOLEAN DEFAULT false,
  first_seen_at         TIMESTAMPTZ DEFAULT now(),
  last_verified_at      TIMESTAMPTZ,
  next_review_at        TIMESTAMPTZ,
  freshness_status      public.data_freshness_status DEFAULT 'CURRENT',
  verified_number       BOOLEAN DEFAULT false,
  dnc_flagged           BOOLEAN DEFAULT false,
  conflict_with_phone_id UUID,
  retrieved_at          TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ─── ENRICHMENT EVIDENCE PANEL ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_evidence_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               TEXT NOT NULL,
  job_id                UUID REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL,
  evidence_type         TEXT NOT NULL,
  evidence_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_provider       TEXT,
  source_record_id      TEXT,
  confidence            INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ─── ENRICHMENT REVIEW QUEUE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_review_queue (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  TEXT NOT NULL,
  job_id                   UUID REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL,
  match_id                 UUID REFERENCES public.property_owner_matches(id) ON DELETE SET NULL,
  current_owner_name       TEXT,
  suggested_owner_name     TEXT,
  current_phone            TEXT,
  suggested_phone          TEXT,
  confidence               public.match_confidence,
  match_score              INTEGER DEFAULT 0,
  evidence                 JSONB DEFAULT '{}'::jsonb,
  provider                 TEXT,
  reason                   TEXT,
  review_status            TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by              UUID,
  reviewed_at              TIMESTAMPTZ,
  review_action            TEXT,
  review_notes             TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- ─── ENRICHMENT AUDIT EVENTS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_audit_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        TEXT NOT NULL,
  job_id         UUID,
  event_type     public.enrichment_event_type NOT NULL,
  event_data     JSONB DEFAULT '{}'::jsonb,
  performed_by   UUID,
  provider       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── ENRICHMENT ECONOMICS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_economics (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                    UUID REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL,
  lead_id                   TEXT,
  provider                  TEXT NOT NULL,
  provider_type             public.provider_type_enum,
  request_count             INTEGER DEFAULT 1,
  successful_matches        INTEGER DEFAULT 0,
  cost_per_request          NUMERIC(10,4) DEFAULT 0,
  cost_per_successful_owner NUMERIC(10,4) DEFAULT 0,
  cost_per_successful_phone NUMERIC(10,4) DEFAULT 0,
  total_cost                NUMERIC(10,4) DEFAULT 0,
  period_date               DATE DEFAULT CURRENT_DATE,
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- ─── MATCHING BENCHMARK ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_benchmark_results (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at                    TIMESTAMPTZ DEFAULT now(),
  total_tested              INTEGER DEFAULT 0,
  owner_exact_match_count   INTEGER DEFAULT 0,
  owner_acceptable_count    INTEGER DEFAULT 0,
  phone_exact_match_count   INTEGER DEFAULT 0,
  wrong_owner_count         INTEGER DEFAULT 0,
  wrong_phone_count         INTEGER DEFAULT 0,
  no_match_count            INTEGER DEFAULT 0,
  review_required_count     INTEGER DEFAULT 0,
  owner_exact_match_pct     NUMERIC(5,2) DEFAULT 0,
  owner_acceptable_pct      NUMERIC(5,2) DEFAULT 0,
  phone_exact_match_pct     NUMERIC(5,2) DEFAULT 0,
  wrong_owner_pct           NUMERIC(5,2) DEFAULT 0,
  wrong_phone_pct           NUMERIC(5,2) DEFAULT 0,
  no_match_pct              NUMERIC(5,2) DEFAULT 0,
  review_required_pct       NUMERIC(5,2) DEFAULT 0,
  auto_accept_threshold     INTEGER DEFAULT 85,
  review_threshold          INTEGER DEFAULT 65,
  notes                     TEXT,
  created_by                UUID
);

-- ─── PROVIDER WATERFALL CONFIG ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_waterfall_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_order        INTEGER NOT NULL,
  provider_name     TEXT NOT NULL,
  provider_type     public.provider_type_enum NOT NULL,
  enabled           BOOLEAN DEFAULT true,
  skip_if_score_gte INTEGER DEFAULT 85,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_lead_id ON public.enrichment_jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON public.enrichment_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_priority ON public.enrichment_jobs(priority DESC);
CREATE INDEX IF NOT EXISTS idx_owner_matches_lead_id ON public.property_owner_matches(lead_id);
CREATE INDEX IF NOT EXISTS idx_owner_matches_status ON public.property_owner_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_phone_evidence_lead_id ON public.enrichment_phone_evidence(lead_id);
CREATE INDEX IF NOT EXISTS idx_phone_evidence_status ON public.enrichment_phone_evidence(phone_status);
CREATE INDEX IF NOT EXISTS idx_review_queue_lead_id ON public.enrichment_review_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.enrichment_review_queue(review_status);
CREATE INDEX IF NOT EXISTS idx_audit_events_lead_id ON public.enrichment_audit_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON public.enrichment_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_economics_provider ON public.enrichment_economics(provider);
CREATE INDEX IF NOT EXISTS idx_economics_date ON public.enrichment_economics(period_date);
CREATE INDEX IF NOT EXISTS idx_owner_candidates_job_id ON public.enrichment_owner_candidates(job_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.enrichment_provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_owner_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owner_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_phone_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_economics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_benchmark_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_waterfall_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_enrichment_provider_registry" ON public.enrichment_provider_registry;
CREATE POLICY "auth_enrichment_provider_registry" ON public.enrichment_provider_registry
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_jobs" ON public.enrichment_jobs;
CREATE POLICY "auth_enrichment_jobs" ON public.enrichment_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_owner_candidates" ON public.enrichment_owner_candidates;
CREATE POLICY "auth_enrichment_owner_candidates" ON public.enrichment_owner_candidates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_property_owner_matches" ON public.property_owner_matches;
CREATE POLICY "auth_property_owner_matches" ON public.property_owner_matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_phone_evidence" ON public.enrichment_phone_evidence;
CREATE POLICY "auth_enrichment_phone_evidence" ON public.enrichment_phone_evidence
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_evidence_records" ON public.enrichment_evidence_records;
CREATE POLICY "auth_enrichment_evidence_records" ON public.enrichment_evidence_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_review_queue" ON public.enrichment_review_queue;
CREATE POLICY "auth_enrichment_review_queue" ON public.enrichment_review_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_audit_events" ON public.enrichment_audit_events;
CREATE POLICY "auth_enrichment_audit_events" ON public.enrichment_audit_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_economics" ON public.enrichment_economics;
CREATE POLICY "auth_enrichment_economics" ON public.enrichment_economics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_benchmark_results" ON public.enrichment_benchmark_results;
CREATE POLICY "auth_enrichment_benchmark_results" ON public.enrichment_benchmark_results
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_enrichment_waterfall_config" ON public.enrichment_waterfall_config;
CREATE POLICY "auth_enrichment_waterfall_config" ON public.enrichment_waterfall_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── SEED PROVIDER REGISTRY ──────────────────────────────────────────────────

INSERT INTO public.enrichment_provider_registry
  (provider_name, provider_type, automation_allowed, allowed_uses, prohibited_uses, retention_rules, rate_limit_per_min, rate_limit_per_day, health_status, enabled, notes)
VALUES
  ('ATTOM', 'PROPERTY', true, ARRAY['property_lookup','owner_of_record','apn_lookup'], ARRAY['scraping','unauthorized_bulk'], '90 days per contract', 60, 5000, 'ACTIVE', false, 'Licensed property data API. Requires contract.'),
  ('ESTATED', 'PROPERTY', true, ARRAY['property_lookup','owner_of_record','address_verification'], ARRAY['scraping'], '90 days per contract', 60, 5000, 'ACTIVE', false, 'Licensed property data API.'),
  ('REGRID', 'PROPERTY', true, ARRAY['parcel_data','apn_lookup','owner_of_record'], ARRAY['scraping'], '90 days per contract', 30, 2000, 'ACTIVE', false, 'Parcel/county data provider.'),
  ('BATCHDATA', 'COMBINED', true, ARRAY['property_lookup','owner_lookup','phone_lookup'], ARRAY['scraping','unauthorized_bulk'], '90 days per contract', 60, 10000, 'ACTIVE', false, 'BatchData licensed API. Key configured in env.'),
  ('PDL', 'PEOPLE', true, ARRAY['identity_resolution','contact_enrichment'], ARRAY['scraping','unauthorized_bulk','marketing_without_consent'], 'Per PDL ToS — legal review required', 60, 5000, 'ACTIVE', false, 'People Data Labs. Requires CCPA compliance review.'),
  ('SALESGENIE', 'PEOPLE', true, ARRAY['contact_lookup','phone_lookup'], ARRAY['scraping','tcpa_violation'], 'Per Data Axle ToS', 30, 2000, 'ACTIVE', false, 'Data Axle/Salesgenie. Requires TCPA compliance.'),
  ('MANUAL_RESEARCH', 'PEOPLE', false, ARRAY['manual_lookup','reference_link'], ARRAY['automated_scraping','captcha_bypass'], 'Indefinite', 0, 0, 'ACTIVE', true, 'Manual admin research. No automation.'),
  ('TRUEPEOPLESEARCH_MANUAL', 'PEOPLE', false, ARRAY['manual_reference_link'], ARRAY['automated_scraping','captcha_bypass','bulk_automated_lookup'], 'Manual use only', 0, 0, 'ACTIVE', true, 'Manual reference link only. NO automated scraping permitted.')
ON CONFLICT (provider_name) DO NOTHING;

-- ─── SEED WATERFALL CONFIG ───────────────────────────────────────────────────

INSERT INTO public.enrichment_waterfall_config
  (step_order, provider_name, provider_type, enabled, skip_if_score_gte, notes)
VALUES
  (1, 'ATTOM', 'PROPERTY', false, 100, 'Step 1: Verify property + get owner of record'),
  (2, 'ESTATED', 'PROPERTY', false, 100, 'Step 1 fallback: Property verification'),
  (3, 'BATCHDATA', 'COMBINED', false, 85, 'Step 2: Owner + phone enrichment'),
  (4, 'PDL', 'PEOPLE', false, 85, 'Step 3: People/identity enrichment fallback'),
  (5, 'SALESGENIE', 'PEOPLE', false, 85, 'Step 4: Salesgenie fallback'),
  (6, 'MANUAL_RESEARCH', 'PEOPLE', true, 0, 'Step 5: Manual review fallback')
ON CONFLICT DO NOTHING;
