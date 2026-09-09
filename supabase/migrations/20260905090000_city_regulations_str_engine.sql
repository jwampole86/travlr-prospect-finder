-- ============================================================
-- TRAVLR — City Regulations / STR Rules Engine
-- Timestamp: 20260905090000
-- ============================================================
-- 1. Canonical city_regulations table (one source of truth)
-- 2. property_regulation_evaluations (per-property evaluation)
-- 3. Backfill existing leads from regulation_rules + leads.city/state
-- 4. Indexes + RLS
-- 5. Dashboard aggregate RPC update
-- ============================================================

-- ─── 1. Canonical City Regulations ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.city_regulations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_name           TEXT NOT NULL,
  city                        TEXT,
  county                      TEXT,
  state                       TEXT NOT NULL,
  jurisdiction_type           TEXT NOT NULL DEFAULT 'CITY',
  -- CITY | TOWN | VILLAGE | COUNTY | UNINCORPORATED_COUNTY | OTHER
  status                      TEXT NOT NULL DEFAULT 'UNKNOWN',
  -- ALLOWED | ALLOWED_WITH_REQUIREMENTS | PERMIT_REQUIRED | RESTRICTED
  -- PRIMARY_RESIDENCE_REQUIRED | PROHIBITED | UNKNOWN | REVIEW_REQUIRED
  str_allowed                 BOOLEAN,
  permit_required             BOOLEAN,
  license_required            BOOLEAN,
  registration_required       BOOLEAN,
  primary_residence_required  BOOLEAN,
  owner_occupancy_required    BOOLEAN,
  night_cap                   INTEGER,
  minimum_stay                INTEGER,
  maximum_stay                INTEGER,
  occupancy_limit             INTEGER,
  parking_requirements        TEXT,
  zoning_restrictions         TEXT,
  host_presence_required      BOOLEAN,
  local_contact_required      BOOLEAN,
  tax_requirements            TEXT,
  inspection_required         BOOLEAN,
  insurance_requirements      TEXT,
  hoa_consideration           TEXT,
  additional_restrictions     TEXT,
  summary                     TEXT,
  agent_summary               TEXT,
  source_name                 TEXT,
  source_url                  TEXT,
  source_type                 TEXT DEFAULT 'OFFICIAL_MUNICIPAL',
  -- OFFICIAL_MUNICIPAL | OFFICIAL_STATE | OFFICIAL_COUNTY | OTHER
  effective_date              DATE,
  last_verified_at            TIMESTAMPTZ,
  next_review_at              TIMESTAMPTZ,
  confidence                  TEXT DEFAULT 'MEDIUM',
  -- HIGH | MEDIUM | LOW | UNVERIFIED
  review_status               TEXT DEFAULT 'CURRENT',
  -- CURRENT | REVIEW_DUE | STALE | UNKNOWN
  regulation_version          INTEGER NOT NULL DEFAULT 1,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one canonical record per jurisdiction
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_regulations_jurisdiction
ON public.city_regulations (LOWER(TRIM(state)), LOWER(TRIM(COALESCE(city, ''))), LOWER(TRIM(COALESCE(county, ''))));

CREATE INDEX IF NOT EXISTS idx_city_regulations_state ON public.city_regulations (state);
CREATE INDEX IF NOT EXISTS idx_city_regulations_status ON public.city_regulations (status);
CREATE INDEX IF NOT EXISTS idx_city_regulations_review_status ON public.city_regulations (review_status);

-- ─── 2. Property Regulation Evaluations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_regulation_evaluations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                   TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  city_regulation_id        UUID REFERENCES public.city_regulations(id) ON DELETE SET NULL,
  jurisdiction_name         TEXT,
  city_regulation_status    TEXT NOT NULL DEFAULT 'UNKNOWN',
  evaluated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regulation_version        INTEGER,
  source_last_verified_at   TIMESTAMPTZ,
  confidence                TEXT DEFAULT 'MEDIUM',
  review_required           BOOLEAN DEFAULT FALSE,
  evaluation_reason         TEXT,
  data_quality_flags        TEXT[],
  -- JURISDICTION_UNKNOWN | REGULATION_NOT_FOUND | REGULATION_STALE
  -- REGULATION_CONFLICT | ADDRESS_NOT_VERIFIED | SOURCE_UNAVAILABLE | REVIEW_REQUIRED
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_reg_eval_lead
ON public.property_regulation_evaluations (lead_id);

CREATE INDEX IF NOT EXISTS idx_prop_reg_eval_city_reg
ON public.property_regulation_evaluations (city_regulation_id);

CREATE INDEX IF NOT EXISTS idx_prop_reg_eval_status
ON public.property_regulation_evaluations (city_regulation_status);

CREATE INDEX IF NOT EXISTS idx_prop_reg_eval_evaluated_at
ON public.property_regulation_evaluations (evaluated_at);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.city_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_regulation_evaluations ENABLE ROW LEVEL SECURITY;

-- Admins: full access; agents: read-only
DROP POLICY IF EXISTS "city_regulations_select" ON public.city_regulations;
CREATE POLICY "city_regulations_select"
ON public.city_regulations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "city_regulations_insert" ON public.city_regulations;
CREATE POLICY "city_regulations_insert"
ON public.city_regulations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "city_regulations_update" ON public.city_regulations;
CREATE POLICY "city_regulations_update"
ON public.city_regulations FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "prop_reg_eval_select" ON public.property_regulation_evaluations;
CREATE POLICY "prop_reg_eval_select"
ON public.property_regulation_evaluations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "prop_reg_eval_insert" ON public.property_regulation_evaluations;
CREATE POLICY "prop_reg_eval_insert"
ON public.property_regulation_evaluations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "prop_reg_eval_update" ON public.property_regulation_evaluations;
CREATE POLICY "prop_reg_eval_update"
ON public.property_regulation_evaluations FOR UPDATE TO authenticated USING (true);

-- ─── 4. Seed Canonical City Regulations from existing data ───────────────────

-- Colorado
INSERT INTO public.city_regulations
  (jurisdiction_name, city, state, jurisdiction_type, status, str_allowed, permit_required, license_required, primary_residence_required, summary, agent_summary, source_name, source_url, source_type, last_verified_at, review_status, confidence, regulation_version)
VALUES
  ('Denver, CO', 'Denver', 'CO', 'CITY', 'PRIMARY_RESIDENCE_REQUIRED', TRUE, TRUE, TRUE, TRUE,
   'Denver allows STRs but requires a license. Must be primary residence. Operators must register with the city and display license number on listings.',
   'Denver permits STRs for primary residences only. License required ($100/yr). Must display license number on all listings.',
   'Denver City & County', 'https://denvergov.org/Government/Agencies-Departments-Offices/Business-Licensing/Business-licenses/Short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Boulder, CO', 'Boulder', 'CO', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, TRUE, FALSE,
   'Boulder requires a license for all STR operators. Non-primary residences are allowed with additional requirements. Max 8 guests.',
   'Boulder allows STRs including non-primary residences. License required ($150/yr). Max 8 guests.',
   'City of Boulder', 'https://bouldercolorado.gov/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '45 days', 'CURRENT', 'HIGH', 1),

  ('Aspen, CO', 'Aspen', 'CO', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, TRUE, FALSE,
   'Aspen allows STRs but has strict licensing. Pitkin County rules also apply outside city limits. High licensing fees.',
   'Aspen permits STRs with city license ($300/yr). Annual safety inspection required. Good neighbor policy required.',
   'City of Aspen', 'https://www.cityofaspen.com/1068/Short-Term-Rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'HIGH', 1),

  ('Breckenridge, CO', 'Breckenridge', 'CO', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, TRUE, FALSE,
   'Breckenridge is STR-friendly as a ski resort town. Licensing required but non-primary residences are welcome.',
   'Breckenridge allows STRs including investment properties. Business license required ($200/yr). Max 12 guests.',
   'Town of Breckenridge', 'https://www.townofbreckenridge.com/government/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Vail, CO', 'Vail', 'CO', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, TRUE, FALSE,
   'Vail is a premier ski resort market with STR-friendly regulations. Licensing required, investment properties allowed.',
   'Vail allows STRs including investment properties. License required ($250/yr). Max 14 guests.',
   'Town of Vail', 'https://www.vailgov.com/business/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Colorado Springs, CO', 'Colorado Springs', 'CO', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Colorado Springs requires STR licensing. Rules vary by zone. Some residential zones have stricter limits.',
   'Colorado Springs allows STRs with permit ($75/yr). Zone-dependent restrictions apply.',
   'City of Colorado Springs', 'https://coloradosprings.gov/business/page/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'HIGH', 1),

-- California
  ('Los Angeles, CA', 'Los Angeles', 'CA', 'CITY', 'PRIMARY_RESIDENCE_REQUIRED', TRUE, TRUE, FALSE, TRUE,
   'Los Angeles enforces strict STR rules. Primary residence only, 120-night annual cap for unhosted rentals. Home-sharing permit required.',
   'LA allows STRs for primary residences only. 120-night annual cap (unhosted). Home-sharing permit required ($89/yr).',
   'LA City Planning', 'https://planning.lacity.org/plans-policies/home-sharing-ordinance',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Sherman Oaks, CA', 'Sherman Oaks', 'CA', 'CITY', 'PRIMARY_RESIDENCE_REQUIRED', TRUE, TRUE, FALSE, TRUE,
   'Sherman Oaks falls under the City of Los Angeles STR ordinance. Same primary residence and 120-night cap rules apply.',
   'Sherman Oaks is governed by LA City Home-Sharing Ordinance. Primary residence only. 120-night cap (unhosted).',
   'LA City Planning', 'https://planning.lacity.org/plans-policies/home-sharing-ordinance',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Malibu, CA', 'Malibu', 'CA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Malibu allows STRs including investment properties. Transient occupancy permit required.',
   'Malibu allows STRs including investment properties. TOT permit required ($200/yr). Coastal Commission rules may apply.',
   'City of Malibu', 'https://www.malibucity.org/business/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '45 days', 'CURRENT', 'HIGH', 1),

  ('Newport Beach, CA', 'Newport Beach', 'CA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Newport Beach allows STRs with a transient occupancy permit. Investment properties are permitted.',
   'Newport Beach allows STRs. TOT permit required. Investment properties permitted. Strong luxury market.',
   'City of Newport Beach', 'https://www.newportbeachca.gov/government/departments/finance/short-term-lodging',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

  ('Palm Springs, CA', 'Palm Springs', 'CA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, TRUE, FALSE,
   'Palm Springs permits short-term rentals subject to local registration/permit requirements and operating restrictions.',
   'Palm Springs allows STRs with registration and permit. Occupancy restrictions apply. Local contact required.',
   'City of Palm Springs', 'https://www.palmspringsca.gov/government/departments/planning-services/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '30 days', 'CURRENT', 'HIGH', 1),

-- Nevada
  ('Las Vegas, NV', 'Las Vegas', 'NV', 'CITY', 'RESTRICTED', TRUE, TRUE, FALSE, FALSE,
   'Las Vegas has significant STR restrictions. Permit required. Zoning restrictions apply in many residential areas.',
   'Las Vegas restricts STRs significantly. Permit required. Many residential zones prohibit STRs.',
   'City of Las Vegas', 'https://www.lasvegasnevada.gov/Business/Licenses/Short-Term-Rental',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'HIGH', 1),

  ('Henderson, NV', 'Henderson', 'NV', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Henderson allows STRs with a business license. Rules are less restrictive than Las Vegas proper.',
   'Henderson allows STRs with business license. Less restrictive than Las Vegas.',
   'City of Henderson', 'https://www.cityofhenderson.com/business/business-licensing',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'MEDIUM', 1),

-- Washington
  ('Seattle, WA', 'Seattle', 'WA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Seattle allows STRs with a license. Operators must register and collect lodging taxes.',
   'Seattle allows STRs with license. Registration and lodging tax collection required.',
   'City of Seattle', 'https://www.seattle.gov/license-and-tax-administration/business-license-tax/short-term-rental',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '45 days', 'CURRENT', 'HIGH', 1),

  ('Bellevue, WA', 'Bellevue', 'WA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Bellevue allows STRs. Business license required. Lodging tax applies.',
   'Bellevue allows STRs with business license. Lodging tax required.',
   'City of Bellevue', 'https://bellevuewa.gov/city-government/departments/finance/business-licensing',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'MEDIUM', 1),

  ('Renton, WA', 'Renton', 'WA', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Renton allows STRs with a business license.',
   'Renton allows STRs with business license.',
   'City of Renton', 'https://rentonwa.gov/business/business_license',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '90 days', 'CURRENT', 'MEDIUM', 1),

-- Maryland
  ('Baltimore, MD', 'Baltimore', 'MD', 'CITY', 'ALLOWED_WITH_REQUIREMENTS', TRUE, TRUE, FALSE, FALSE,
   'Baltimore allows STRs with a license. Zoning compliance required.',
   'Baltimore allows STRs with license. Zoning compliance required.',
   'City of Baltimore', 'https://bniajfi.org/short-term-rentals',
   'OFFICIAL_MUNICIPAL', NOW() - INTERVAL '60 days', 'CURRENT', 'MEDIUM', 1)

ON CONFLICT DO NOTHING;

-- ─── 5. Backfill property_regulation_evaluations for all existing leads ───────

DO $$
DECLARE
  r RECORD;
  v_reg_id UUID;
  v_reg_status TEXT;
  v_jurisdiction TEXT;
  v_reg_version INTEGER;
  v_last_verified TIMESTAMPTZ;
  v_flags TEXT[];
BEGIN
  FOR r IN
    SELECT l.id, l.city, l.state, l.regulation_status
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.property_regulation_evaluations pre
        WHERE pre.lead_id = l.id
      )
  LOOP
    -- Try to find a canonical city regulation record
    SELECT cr.id, cr.status, cr.jurisdiction_name, cr.regulation_version, cr.last_verified_at
    INTO v_reg_id, v_reg_status, v_jurisdiction, v_reg_version, v_last_verified
    FROM public.city_regulations cr
    WHERE cr.state = r.state
      AND LOWER(TRIM(cr.city)) = LOWER(TRIM(COALESCE(r.city, '')))
    LIMIT 1;

    -- Determine status
    IF v_reg_id IS NULL THEN
      -- No canonical record found — map from existing regulation_status or mark UNKNOWN
      v_flags := ARRAY['REGULATION_NOT_FOUND'];
      IF r.regulation_status IS NOT NULL AND r.regulation_status <> 'Unknown' THEN
        -- Map legacy status to canonical
        CASE r.regulation_status
          WHEN 'Allowed' THEN v_reg_status := 'ALLOWED';
          WHEN 'Restricted' THEN v_reg_status := 'ALLOWED_WITH_REQUIREMENTS';
          WHEN 'Prohibited' THEN v_reg_status := 'PROHIBITED';
          ELSE v_reg_status := 'UNKNOWN';
        END CASE;
        v_jurisdiction := COALESCE(r.city || ', ' || r.state, r.state);
      ELSE
        v_reg_status := 'UNKNOWN';
        v_jurisdiction := NULL;
        v_flags := ARRAY['REGULATION_NOT_FOUND', 'JURISDICTION_UNKNOWN'];
      END IF;
    ELSE
      v_flags := NULL;
    END IF;

    INSERT INTO public.property_regulation_evaluations
      (lead_id, city_regulation_id, jurisdiction_name, city_regulation_status,
       evaluated_at, regulation_version, source_last_verified_at, confidence,
       review_required, evaluation_reason, data_quality_flags)
    VALUES
      (r.id, v_reg_id, v_jurisdiction, COALESCE(v_reg_status, 'UNKNOWN'),
       NOW(), v_reg_version, v_last_verified,
       CASE WHEN v_reg_id IS NOT NULL THEN 'HIGH' ELSE 'LOW' END,
       (v_reg_id IS NULL),
       CASE WHEN v_reg_id IS NOT NULL THEN 'CANONICAL_MATCH' ELSE 'NO_CANONICAL_RECORD' END,
       v_flags)
    ON CONFLICT (lead_id) DO NOTHING;

  END LOOP;
END;
$$;

-- ─── 6. Update leads.regulation_status to match canonical evaluations ─────────

UPDATE public.leads l
SET
  regulation_status = CASE pre.city_regulation_status
    WHEN 'ALLOWED' THEN 'Allowed'::public.regulation_status
    WHEN 'ALLOWED_WITH_REQUIREMENTS' THEN 'Restricted'::public.regulation_status
    WHEN 'PERMIT_REQUIRED' THEN 'Restricted'::public.regulation_status
    WHEN 'RESTRICTED' THEN 'Restricted'::public.regulation_status
    WHEN 'PRIMARY_RESIDENCE_REQUIRED' THEN 'Restricted'::public.regulation_status
    WHEN 'PROHIBITED' THEN 'Prohibited'::public.regulation_status
    ELSE 'Unknown'::public.regulation_status
  END,
  updated_at = NOW()
FROM public.property_regulation_evaluations pre
WHERE pre.lead_id = l.id
  AND pre.city_regulation_id IS NOT NULL;

-- ─── 7. Regulation coverage RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_regulation_coverage(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
BEGIN
  SELECT jsonb_build_object(
    'total_applicable',
    (SELECT COUNT(DISTINCT l.id) FROM public.leads l
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'regulation_evaluated',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND (NOT v_state_filter OR l.state = p_state)),

    'city_rules_found',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_id IS NOT NULL
       AND (NOT v_state_filter OR l.state = p_state)),

    'allowed',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'ALLOWED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'allowed_with_requirements',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'ALLOWED_WITH_REQUIREMENTS'
       AND (NOT v_state_filter OR l.state = p_state)),

    'permit_required',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'PERMIT_REQUIRED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'restricted',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'RESTRICTED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'primary_residence_required',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'PRIMARY_RESIDENCE_REQUIRED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'prohibited',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'PROHIBITED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'unknown',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'UNKNOWN'
       AND (NOT v_state_filter OR l.state = p_state)),

    'review_required',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND pre.city_regulation_status = 'REVIEW_REQUIRED'
       AND (NOT v_state_filter OR l.state = p_state)),

    'stale',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     JOIN public.city_regulations cr ON cr.id = pre.city_regulation_id
     WHERE l.is_synthetic IS NOT TRUE
       AND cr.review_status IN ('STALE', 'REVIEW_DUE')
       AND (NOT v_state_filter OR l.state = p_state)),

    'jurisdiction_unknown',
    (SELECT COUNT(DISTINCT pre.lead_id) FROM public.property_regulation_evaluations pre
     JOIN public.leads l ON l.id = pre.lead_id
     WHERE l.is_synthetic IS NOT TRUE
       AND 'JURISDICTION_UNKNOWN' = ANY(pre.data_quality_flags)
       AND (NOT v_state_filter OR l.state = p_state))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── 8. Trace regulation function ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trace_regulation(p_lead_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'lead_id', l.id,
    'address', l.address,
    'verified_address', l.verified_address,
    'city', l.city,
    'county', l.county,
    'state', l.state,
    'zip', l.zip,
    'evaluation', CASE WHEN pre.id IS NOT NULL THEN jsonb_build_object(
      'evaluation_id', pre.id,
      'jurisdiction_name', pre.jurisdiction_name,
      'city_regulation_status', pre.city_regulation_status,
      'evaluated_at', pre.evaluated_at,
      'regulation_version', pre.regulation_version,
      'confidence', pre.confidence,
      'review_required', pre.review_required,
      'evaluation_reason', pre.evaluation_reason,
      'data_quality_flags', pre.data_quality_flags
    ) ELSE NULL END,
    'canonical_regulation', CASE WHEN cr.id IS NOT NULL THEN jsonb_build_object(
      'regulation_id', cr.id,
      'jurisdiction_name', cr.jurisdiction_name,
      'jurisdiction_type', cr.jurisdiction_type,
      'status', cr.status,
      'str_allowed', cr.str_allowed,
      'permit_required', cr.permit_required,
      'license_required', cr.license_required,
      'primary_residence_required', cr.primary_residence_required,
      'night_cap', cr.night_cap,
      'minimum_stay', cr.minimum_stay,
      'source_name', cr.source_name,
      'source_url', cr.source_url,
      'last_verified_at', cr.last_verified_at,
      'review_status', cr.review_status,
      'regulation_version', cr.regulation_version,
      'summary', cr.summary,
      'agent_summary', cr.agent_summary
    ) ELSE NULL END,
    'legacy_regulation_status', l.regulation_status
  )
  INTO v_result
  FROM public.leads l
  LEFT JOIN public.property_regulation_evaluations pre ON pre.lead_id = l.id
  LEFT JOIN public.city_regulations cr ON cr.id = pre.city_regulation_id
  WHERE l.id = p_lead_id;

  RETURN v_result;
END;
$$;
