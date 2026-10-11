-- ============================================================
-- Migration: 20261010231500_ai_regulation_upsert_rpc
-- Purpose: city_regulations has an EXPRESSION-based unique index
-- (LOWER(TRIM(state)), LOWER(TRIM(COALESCE(city,''))), LOWER(TRIM(COALESCE(county,''))))
-- which PostgREST's upsert(on_conflict=...) cannot target (it only supports
-- plain column-list conflict targets). This RPC does the ON CONFLICT upsert
-- server-side in raw SQL instead, where expression indexes work normally.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_ai_researched_regulation(
  p_city TEXT,
  p_state TEXT,
  p_status TEXT,
  p_str_allowed BOOLEAN,
  p_permit_required BOOLEAN,
  p_license_required BOOLEAN,
  p_primary_residence_required BOOLEAN,
  p_night_cap INTEGER,
  p_summary TEXT,
  p_source_name TEXT,
  p_source_url TEXT,
  p_confidence TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.city_regulations
    (jurisdiction_name, city, state, jurisdiction_type, status, str_allowed,
     permit_required, license_required, primary_residence_required, night_cap,
     summary, agent_summary, source_name, source_url, source_type,
     last_verified_at, review_status, confidence, regulation_version)
  VALUES
    (p_city || ', ' || p_state, p_city, p_state, 'CITY', p_status, p_str_allowed,
     p_permit_required, p_license_required, p_primary_residence_required, p_night_cap,
     p_summary, p_summary, COALESCE(p_source_name, 'Claude (Anthropic) — AI-researched, unverified'),
     p_source_url, 'AI_RESEARCHED',
     NOW(), 'REVIEW_REQUIRED', p_confidence, 1)
  ON CONFLICT (LOWER(TRIM(state)), LOWER(TRIM(COALESCE(city, ''))), LOWER(TRIM(COALESCE(county, ''))))
  DO UPDATE SET
    status = EXCLUDED.status,
    str_allowed = EXCLUDED.str_allowed,
    permit_required = EXCLUDED.permit_required,
    license_required = EXCLUDED.license_required,
    primary_residence_required = EXCLUDED.primary_residence_required,
    night_cap = EXCLUDED.night_cap,
    summary = EXCLUDED.summary,
    agent_summary = EXCLUDED.agent_summary,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    source_type = 'AI_RESEARCHED',
    last_verified_at = EXCLUDED.last_verified_at,
    review_status = 'REVIEW_REQUIRED',
    confidence = EXCLUDED.confidence,
    regulation_version = public.city_regulations.regulation_version + 1,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_ai_researched_regulation(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, TEXT) TO service_role;
