-- ============================================================
-- TRAVLR — PropertyReach Enrichment Layer
-- Adds PropertyReach as a first-class enrichment provider
-- on top of the existing canonical enrichment infrastructure.
--
-- ARCHITECTURE:
--   PropertyReach is a DATA SOURCE.
--   TRAVLR remains the canonical system of record.
--   All results flow into existing verifiedOwner / verifiedNumber /
--   verifiedAddress / fullyVerified / phoneAvailable fields.
-- ============================================================

-- ─── 1. Extend leads table with PropertyReach identifiers ────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS property_reach_id TEXT,
  ADD COLUMN IF NOT EXISTS property_reach_apn TEXT,
  ADD COLUMN IF NOT EXISTS property_reach_fips TEXT,
  ADD COLUMN IF NOT EXISTS property_reach_parcel_id TEXT,
  ADD COLUMN IF NOT EXISTS property_reach_matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS property_reach_match_status TEXT DEFAULT 'NOT_ATTEMPTED',
  ADD COLUMN IF NOT EXISTS property_reach_last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS property_reach_enrichment_version INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_property_reach_id
  ON public.leads (property_reach_id)
  WHERE property_reach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property_reach_match_status
  ON public.leads (property_reach_match_status);

-- ─── 2. PropertyReach enrichment jobs ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.propertyreach_enrichment_jobs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                   TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  -- Address inputs (normalized before sending)
  raw_address               TEXT,
  normalized_address        TEXT,
  standardized_address      TEXT,
  city                      TEXT,
  state                     TEXT,
  zip                       TEXT,
  input_apn                 TEXT,

  -- Job lifecycle
  job_status                TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING | RUNNING | PROPERTY_MATCHED | PROPERTY_MATCH_AMBIGUOUS |
  -- PROPERTY_NOT_FOUND | PROPERTY_CONFLICT | INVALID_ADDRESS |
  -- OWNER_RESOLVED | CONTACT_ENRICHED | REVIEW_REQUIRED |
  -- NO_MATCH | FAILED | RATE_LIMITED

  -- Property match result
  property_match_status     TEXT,
  -- PROPERTY_MATCHED | PROPERTY_MATCH_AMBIGUOUS | PROPERTY_NOT_FOUND |
  -- PROPERTY_CONFLICT | INVALID_ADDRESS | PROVIDER_ERROR

  property_reach_id         TEXT,
  resolved_apn              TEXT,
  resolved_fips             TEXT,
  resolved_parcel_id        TEXT,
  property_address_verified BOOLEAN DEFAULT FALSE,

  -- Owner resolution result
  owner_resolution_done     BOOLEAN DEFAULT FALSE,
  owner_candidates_count    INTEGER DEFAULT 0,

  -- Contact enrichment result
  contact_enrichment_done   BOOLEAN DEFAULT FALSE,
  phones_found              INTEGER DEFAULT 0,
  emails_found              INTEGER DEFAULT 0,

  -- Match scoring
  match_confidence_score    INTEGER,
  match_confidence_label    TEXT,
  -- VERIFIED | HIGH_CONFIDENCE | MEDIUM_CONFIDENCE | LOW_CONFIDENCE | CONFLICT | NO_MATCH

  auto_accepted             BOOLEAN DEFAULT FALSE,
  requires_review           BOOLEAN DEFAULT FALSE,

  -- Provider metadata
  provider_request_id       TEXT,
  provider_cost_cents       INTEGER,
  api_calls_made            INTEGER DEFAULT 0,

  -- Error tracking
  error_message             TEXT,
  error_code                TEXT,

  -- Raw provider response (stored separately from canonical data)
  raw_property_response     JSONB,
  raw_owner_response        JSONB,
  raw_contact_response      JSONB,

  -- Timestamps
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  priority                  INTEGER DEFAULT 5
);

CREATE INDEX IF NOT EXISTS idx_pr_jobs_lead_id
  ON public.propertyreach_enrichment_jobs (lead_id);
CREATE INDEX IF NOT EXISTS idx_pr_jobs_status
  ON public.propertyreach_enrichment_jobs (job_status);
CREATE INDEX IF NOT EXISTS idx_pr_jobs_created_at
  ON public.propertyreach_enrichment_jobs (created_at DESC);

ALTER TABLE public.propertyreach_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_pr_jobs" ON public.propertyreach_enrichment_jobs;
CREATE POLICY "authenticated_manage_pr_jobs"
  ON public.propertyreach_enrichment_jobs
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 3. PropertyReach property matches ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.propertyreach_property_matches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                   TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id                    UUID REFERENCES public.propertyreach_enrichment_jobs(id) ON DELETE SET NULL,

  -- PropertyReach property identity
  property_reach_id         TEXT,
  apn                       TEXT,
  fips                      TEXT,
  parcel_id                 TEXT,
  provider_property_id      TEXT,

  -- Address comparison
  canonical_address         TEXT,
  provider_address          TEXT,
  address_match_score       INTEGER,
  address_match_exact       BOOLEAN DEFAULT FALSE,

  -- Owner resolution
  owner_candidates          JSONB DEFAULT '[]'::JSONB,
  -- Array of { fullName, firstName, lastName, ownerType, mailingAddress,
  --            providerRelationship, providerConfidence, sourceRecordId }

  best_owner_name           TEXT,
  best_owner_type           TEXT,
  -- INDIVIDUAL | JOINT_OWNERS | LLC | TRUST | CORPORATION | PARTNERSHIP | OTHER_ENTITY | UNKNOWN

  legal_owner_name          TEXT,
  associated_contact_name   TEXT,
  owner_mailing_address     TEXT,

  -- Phones
  phone_candidates          JSONB DEFAULT '[]'::JSONB,
  -- Array of { phoneE164, phoneRaw, phoneType, confidence, source, rankOrder }

  primary_phone_e164        TEXT,
  primary_phone_type        TEXT,

  -- Emails
  email_candidates          JSONB DEFAULT '[]'::JSONB,
  primary_email             TEXT,

  -- TRAVLR match confidence (calculated independently of provider score)
  match_confidence_score    INTEGER,
  match_confidence_label    TEXT,
  match_signals             JSONB DEFAULT '[]'::JSONB,
  match_reasons             JSONB DEFAULT '[]'::JSONB,

  -- Decision
  match_decision            TEXT DEFAULT 'PENDING',
  -- PENDING | AUTO_ACCEPTED | REVIEW_REQUIRED | ACCEPTED | REJECTED | CONFLICT

  auto_accepted             BOOLEAN DEFAULT FALSE,
  accepted_at               TIMESTAMPTZ,
  accepted_by               UUID,
  rejected_at               TIMESTAMPTZ,
  rejected_by               UUID,
  rejection_reason          TEXT,

  -- Evidence precedence (protects manual research)
  is_manual_research        BOOLEAN DEFAULT FALSE,
  evidence_tier             TEXT DEFAULT 'MEDIUM_CONFIDENCE_PROVIDER',
  -- ADMIN_CONFIRMED | MANUAL_VERIFIED | MULTI_SOURCE_VERIFIED |
  -- HIGH_CONFIDENCE_PROVIDER | MEDIUM_CONFIDENCE_PROVIDER | UNVERIFIED_PROVIDER

  -- Provider metadata
  provider_name             TEXT DEFAULT 'PROPERTYREACH',
  provider_record_id        TEXT,
  provider_confidence       INTEGER,
  provider_retrieved_at     TIMESTAMPTZ,

  -- Raw evidence (never deleted, append-only)
  raw_evidence              JSONB,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_matches_lead_id
  ON public.propertyreach_property_matches (lead_id);
CREATE INDEX IF NOT EXISTS idx_pr_matches_decision
  ON public.propertyreach_property_matches (match_decision);
CREATE INDEX IF NOT EXISTS idx_pr_matches_property_reach_id
  ON public.propertyreach_property_matches (property_reach_id)
  WHERE property_reach_id IS NOT NULL;

ALTER TABLE public.propertyreach_property_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_pr_matches" ON public.propertyreach_property_matches;
CREATE POLICY "authenticated_manage_pr_matches"
  ON public.propertyreach_property_matches
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 4. Enrichment threshold configuration (Admin-tunable) ───────────────────

CREATE TABLE IF NOT EXISTS public.enrichment_threshold_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key                TEXT NOT NULL UNIQUE,
  config_value              INTEGER NOT NULL,
  config_label              TEXT,
  description               TEXT,
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_by                UUID
);

ALTER TABLE public.enrichment_threshold_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_threshold_config" ON public.enrichment_threshold_config;
CREATE POLICY "authenticated_manage_threshold_config"
  ON public.enrichment_threshold_config
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Seed default thresholds (idempotent)
INSERT INTO public.enrichment_threshold_config (config_key, config_value, config_label, description)
VALUES
  ('AUTO_ACCEPT_THRESHOLD',    85, 'Auto-Accept Threshold',    'Score >= this value qualifies for automatic acceptance (requires property + owner + phone multi-signal)'),
  ('REVIEW_REQUIRED_THRESHOLD', 65, 'Review Required Threshold', 'Score >= this value but below auto-accept threshold goes to review queue'),
  ('DO_NOT_ATTACH_THRESHOLD',   0,  'Do Not Attach Threshold',   'Score below review threshold — result is discarded, not attached')
ON CONFLICT (config_key) DO NOTHING;

-- ─── 5. PropertyReach audit events ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.propertyreach_audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES public.propertyreach_enrichment_jobs(id) ON DELETE SET NULL,
  match_id      UUID REFERENCES public.propertyreach_property_matches(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  -- ENRICHMENT_STARTED | PROPERTY_MATCHED | PROPERTY_NOT_FOUND | PROPERTY_CONFLICT |
  -- OWNER_RESOLVED | CONTACT_ENRICHED | PHONE_FOUND | EMAIL_FOUND |
  -- AUTO_ACCEPTED | REVIEW_QUEUED | ACCEPTED | REJECTED | CONFLICT_DETECTED |
  -- MANUAL_DATA_PROTECTED | CANONICAL_UPDATED | PROVIDER_ERROR
  event_data    JSONB DEFAULT '{}'::JSONB,
  performed_by  UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_audit_lead_id
  ON public.propertyreach_audit_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_pr_audit_event_type
  ON public.propertyreach_audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_pr_audit_created_at
  ON public.propertyreach_audit_events (created_at DESC);

ALTER TABLE public.propertyreach_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_pr_audit" ON public.propertyreach_audit_events;
CREATE POLICY "authenticated_manage_pr_audit"
  ON public.propertyreach_audit_events
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 6. Register PropertyReach in the provider registry ──────────────────────

INSERT INTO public.enrichment_provider_registry (
  provider_name,
  provider_type,
  automation_allowed,
  contract_reference,
  allowed_uses,
  prohibited_uses,
  rate_limit_per_min,
  rate_limit_per_day,
  enabled
)
VALUES (
  'PROPERTYREACH',
  'COMBINED',
  true,
  'PropertyReach API — see https://propertyreach.com/api',
  ARRAY['property_lookup', 'owner_resolution', 'skip_trace', 'contact_enrichment'],
  ARRAY['unauthorized_scraping', 'sms_consent_assumption', 'marketing_without_consent'],
  60,
  500,
  false  -- disabled until API key is configured
)
ON CONFLICT (provider_name) DO UPDATE SET
  provider_type       = EXCLUDED.provider_type,
  automation_allowed  = EXCLUDED.automation_allowed,
  contract_reference  = EXCLUDED.contract_reference,
  allowed_uses        = EXCLUDED.allowed_uses,
  prohibited_uses     = EXCLUDED.prohibited_uses,
  rate_limit_per_min  = EXCLUDED.rate_limit_per_min,
  rate_limit_per_day  = EXCLUDED.rate_limit_per_day;

-- ─── 7. Waterfall config entry for PropertyReach ─────────────────────────────

INSERT INTO public.enrichment_waterfall_config (
  step_order,
  provider_name,
  provider_type,
  enabled,
  notes
)
VALUES (
  1,
  'PROPERTYREACH',
  'COMBINED',
  false,
  'Primary enrichment provider — enable when PROPERTYREACH_API_KEY is configured'
)
ON CONFLICT DO NOTHING;
