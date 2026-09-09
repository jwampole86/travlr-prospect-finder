-- ============================================================
-- TRAVLR — TruePeopleSearch Provenance + Multi-Phone Support
-- Migration: 20260906020000
-- ============================================================
-- Adds provenance columns for TruePeopleSearch manual research imports.
-- Adds secondary phone storage in enriched_phones.
-- All changes are idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── 1. TruePeopleSearch provenance columns on leads ──────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tps_name_url          TEXT,
  ADD COLUMN IF NOT EXISTS tps_address_url        TEXT,
  ADD COLUMN IF NOT EXISTS raw_imported_address   TEXT,
  ADD COLUMN IF NOT EXISTS import_source_name     TEXT,
  ADD COLUMN IF NOT EXISTS import_source_file     TEXT,
  ADD COLUMN IF NOT EXISTS research_source        TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phones       TEXT[],
  ADD COLUMN IF NOT EXISTS all_phones_raw         TEXT;

-- ── 2. Indexes for provenance lookups ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_import_source_name
  ON public.leads (import_source_name)
  WHERE import_source_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_research_source
  ON public.leads (research_source)
  WHERE research_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_import_source_file
  ON public.leads (import_source_file)
  WHERE import_source_file IS NOT NULL;

-- ── 3. Ensure enriched_phones has all needed columns ─────────────────────────
-- enriched_phones already exists per schema analysis; add any missing columns
ALTER TABLE public.enriched_phones
  ADD COLUMN IF NOT EXISTS phone_rank            INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_primary            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_method   TEXT,
  ADD COLUMN IF NOT EXISTS verification_source   TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id       TEXT,
  ADD COLUMN IF NOT EXISTS research_source_url   TEXT,
  ADD COLUMN IF NOT EXISTS raw_phone_string      TEXT;

-- ── 4. Index for multi-phone lookups ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enriched_phones_lead_id
  ON public.enriched_phones (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enriched_phones_import_batch
  ON public.enriched_phones (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ── 5. RPC: upsert_lead_phone ─────────────────────────────────────────────────
-- Idempotently stores a phone number for a lead in enriched_phones.
-- If the same normalized phone already exists for the lead, updates provenance.
-- Returns the enriched_phone row id.
CREATE OR REPLACE FUNCTION public.upsert_lead_phone(
  p_lead_id              TEXT,
  p_normalized_phone     TEXT,
  p_raw_phone            TEXT,
  p_is_primary           BOOLEAN,
  p_phone_rank           INTEGER,
  p_verification_method  TEXT,
  p_verification_source  TEXT,
  p_import_batch_id      TEXT,
  p_research_source_url  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Try to find existing record for this lead + phone
  SELECT id INTO v_id
  FROM public.enriched_phones
  WHERE lead_id = p_lead_id
    AND phone = p_normalized_phone
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Update provenance on existing record
    UPDATE public.enriched_phones SET
      is_primary           = COALESCE(p_is_primary, is_primary),
      phone_rank           = COALESCE(p_phone_rank, phone_rank),
      verification_method  = COALESCE(p_verification_method, verification_method),
      verification_source  = COALESCE(p_verification_source, verification_source),
      import_batch_id      = COALESCE(p_import_batch_id, import_batch_id),
      research_source_url  = COALESCE(p_research_source_url, research_source_url),
      raw_phone_string     = COALESCE(p_raw_phone, raw_phone_string),
      updated_at           = NOW()
    WHERE id = v_id;
  ELSE
    -- Insert new phone record
    INSERT INTO public.enriched_phones (
      id, lead_id, phone, is_primary, phone_rank,
      verification_method, verification_source,
      import_batch_id, research_source_url,
      raw_phone_string, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      p_lead_id,
      p_normalized_phone,
      COALESCE(p_is_primary, FALSE),
      COALESCE(p_phone_rank, 1),
      p_verification_method,
      p_verification_source,
      p_import_batch_id,
      p_research_source_url,
      p_raw_phone,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ── 6. RPC: get_import_batch_kpi_delta ───────────────────────────────────────
-- Returns before/after KPI counts for a given import batch.
-- Used by the import summary panel to show net changes.
CREATE OR REPLACE FUNCTION public.get_import_batch_kpi_delta(p_batch_id TEXT)
RETURNS TABLE(
  metric          TEXT,
  before_val      BIGINT,
  after_val       BIGINT,
  net_change      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'total_leads'::TEXT,
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND import_batch_id != p_batch_id),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND import_batch_id = p_batch_id AND created_at >= NOW() - INTERVAL '1 hour')
  UNION ALL
  SELECT
    'phone_available'::TEXT,
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND (contact_phone IS NOT NULL AND contact_phone != '') AND import_batch_id != p_batch_id),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND (contact_phone IS NOT NULL AND contact_phone != '')),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND (contact_phone IS NOT NULL AND contact_phone != '') AND import_batch_id = p_batch_id AND created_at >= NOW() - INTERVAL '1 hour')
  UNION ALL
  SELECT
    'fully_verified'::TEXT,
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND verified_owner = TRUE AND verified_number = TRUE AND (verified_address IS NOT NULL AND verified_address != '' AND verified_address != 'false') AND import_batch_id != p_batch_id),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND verified_owner = TRUE AND verified_number = TRUE AND (verified_address IS NOT NULL AND verified_address != '' AND verified_address != 'false')),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND verified_owner = TRUE AND verified_number = TRUE AND (verified_address IS NOT NULL AND verified_address != '' AND verified_address != 'false') AND import_batch_id = p_batch_id AND created_at >= NOW() - INTERVAL '1 hour')
  UNION ALL
  SELECT
    'high_priority'::TEXT,
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage NOT IN ('Not a Fit', 'Live') AND import_batch_id != p_batch_id),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage NOT IN ('Not a Fit', 'Live')),
    (SELECT COUNT(*)::BIGINT FROM public.leads WHERE is_synthetic IS NOT TRUE AND prospect_score >= 75 AND stage NOT IN ('Not a Fit', 'Live') AND import_batch_id = p_batch_id AND created_at >= NOW() - INTERVAL '1 hour');
END;
$$;
