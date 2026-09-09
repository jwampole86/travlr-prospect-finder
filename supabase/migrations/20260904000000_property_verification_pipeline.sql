-- ============================================================
-- Property Verification Pipeline Migration
-- Adds verification status model, required fields, and
-- quarantine table for unverified properties.
-- ============================================================

-- ─── 1. Verification status enum ─────────────────────────────────────────────

DROP TYPE IF EXISTS public.property_verification_status CASCADE;
CREATE TYPE public.property_verification_status AS ENUM (
  'CANDIDATE',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'STALE_VERIFICATION',
  'QUARANTINED'
);

-- ─── 2. Add verification fields to leads table ────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS verification_status public.property_verification_status DEFAULT 'CANDIDATE',
  ADD COLUMN IF NOT EXISTS verification_score   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_method  TEXT,
  ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error   TEXT,
  ADD COLUMN IF NOT EXISTS verification_notes   TEXT,
  ADD COLUMN IF NOT EXISTS raw_address          TEXT,
  ADD COLUMN IF NOT EXISTS normalized_address   TEXT,
  ADD COLUMN IF NOT EXISTS verified_address     TEXT,
  ADD COLUMN IF NOT EXISTS street               TEXT,
  ADD COLUMN IF NOT EXISTS zip4                 TEXT,
  ADD COLUMN IF NOT EXISTS county               TEXT,
  ADD COLUMN IF NOT EXISTS apn                  TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id            TEXT,
  ADD COLUMN IF NOT EXISTS property_provider    TEXT,
  ADD COLUMN IF NOT EXISTS provider_property_id TEXT,
  ADD COLUMN IF NOT EXISTS property_type        TEXT,
  ADD COLUMN IF NOT EXISTS square_feet          INTEGER,
  ADD COLUMN IF NOT EXISTS lot_size             NUMERIC,
  ADD COLUMN IF NOT EXISTS year_built           INTEGER,
  ADD COLUMN IF NOT EXISTS source_record_id     TEXT,
  ADD COLUMN IF NOT EXISTS source_url           TEXT,
  ADD COLUMN IF NOT EXISTS listing_url_verified BOOLEAN DEFAULT FALSE;

-- ─── 3. Quarantine table ──────────────────────────────────────────────────────
-- Rejected/unverified records are preserved here for audit, never deleted.

CREATE TABLE IF NOT EXISTS public.property_quarantine (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_lead_id      TEXT,
  raw_address           TEXT,
  normalized_address    TEXT,
  city                  TEXT,
  state                 TEXT,
  zip                   TEXT,
  source                TEXT,
  source_record_id      TEXT,
  source_url            TEXT,
  verification_status   public.property_verification_status DEFAULT 'QUARANTINED',
  verification_score    INTEGER DEFAULT 0,
  verification_method   TEXT,
  verification_error    TEXT,
  verification_notes    TEXT,
  rejection_reason      TEXT,
  provider_request      JSONB,
  provider_response     JSONB,
  raw_record            JSONB,
  quarantined_at        TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID,
  review_notes          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.property_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_quarantine" ON public.property_quarantine;
CREATE POLICY "authenticated_manage_quarantine"
  ON public.property_quarantine
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 4. Property verification audit log ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_verification_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               TEXT,
  raw_address           TEXT,
  normalized_address    TEXT,
  provider_name         TEXT,
  provider_request      JSONB,
  provider_response     JSONB,
  match_result          BOOLEAN,
  provider_property_id  TEXT,
  apn                   TEXT,
  latitude              NUMERIC,
  longitude             NUMERIC,
  verification_score    INTEGER,
  verification_status   public.property_verification_status,
  rejection_reason      TEXT,
  verification_method   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.property_verification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_verification_log" ON public.property_verification_log;
CREATE POLICY "authenticated_read_verification_log"
  ON public.property_verification_log
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 5. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_verification_status
  ON public.leads (verification_status);

CREATE INDEX IF NOT EXISTS idx_leads_verification_score
  ON public.leads (verification_score);

CREATE INDEX IF NOT EXISTS idx_leads_provider_property_id
  ON public.leads (provider_property_id)
  WHERE provider_property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_apn
  ON public.leads (apn)
  WHERE apn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_verified_production
  ON public.leads (verification_status, verification_score)
  WHERE verification_status = 'VERIFIED' AND verification_score >= 75;

CREATE INDEX IF NOT EXISTS idx_quarantine_original_lead
  ON public.property_quarantine (original_lead_id);

CREATE INDEX IF NOT EXISTS idx_quarantine_state
  ON public.property_quarantine (state);

CREATE INDEX IF NOT EXISTS idx_verification_log_lead
  ON public.property_verification_log (lead_id);

-- ─── 6. Backfill raw_address from existing address column ────────────────────

UPDATE public.leads
SET raw_address = address
WHERE raw_address IS NULL AND address IS NOT NULL;

-- ─── 7. One-time audit: mark all existing leads as CANDIDATE ─────────────────
-- All existing records need to go through the verification pipeline.
-- They start as CANDIDATE so the verification system can process them.
-- Records that were already flagged as synthetic stay QUARANTINED.

UPDATE public.leads
SET verification_status = 'QUARANTINED',
    verification_score = 0,
    verification_notes = 'Quarantined: flagged as synthetic during one-time audit'
WHERE is_synthetic = TRUE
  AND verification_status IS NULL;

UPDATE public.leads
SET verification_status = 'CANDIDATE',
    verification_score = 0,
    verification_notes = 'Pending verification — one-time audit backfill'
WHERE is_synthetic = FALSE
  AND verification_status IS NULL;

-- Also set CANDIDATE for any rows where verification_status was just added
-- (DEFAULT 'CANDIDATE' handles new rows, this handles existing)
UPDATE public.leads
SET verification_status = 'CANDIDATE'
WHERE verification_status IS NULL;

-- ─── 8. Quarantine existing synthetic leads ───────────────────────────────────

INSERT INTO public.property_quarantine (
  original_lead_id,
  raw_address,
  city,
  state,
  zip,
  source,
  source_url,
  verification_status,
  verification_score,
  verification_method,
  rejection_reason,
  raw_record,
  quarantined_at
)
SELECT
  id::TEXT,
  COALESCE(address, ''),
  COALESCE(city, ''),
  COALESCE(state, ''),
  COALESCE(zip, ''),
  COALESCE(source::TEXT, 'unknown'),
  COALESCE(listing_url, ''),
  'QUARANTINED'::public.property_verification_status,
  0,
  'one_time_synthetic_audit',
  'Quarantined during one-time audit: flagged as synthetic or placeholder address',
  jsonb_build_object(
    'id', id,
    'address', address,
    'city', city,
    'state', state,
    'zip', zip,
    'source', source,
    'is_synthetic', is_synthetic,
    'addr_mismatch', addr_mismatch
  ),
  NOW()
FROM public.leads
WHERE is_synthetic = TRUE
ON CONFLICT DO NOTHING;

-- ─── 9. Updated_at trigger for quarantine table ───────────────────────────────

CREATE OR REPLACE FUNCTION public.update_quarantine_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quarantine_updated_at ON public.property_quarantine;
CREATE TRIGGER trg_quarantine_updated_at
  BEFORE UPDATE ON public.property_quarantine
  FOR EACH ROW
  EXECUTE FUNCTION public.update_quarantine_updated_at();
