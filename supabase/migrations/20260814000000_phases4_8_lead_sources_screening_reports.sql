-- ============================================================
-- PHASES 4-8: Lead Sources, Screening, Reports, Questionnaires
-- Homeowner Dashboard, Market Saturation
-- ============================================================

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.lead_source_sync_status CASCADE;
CREATE TYPE public.lead_source_sync_status AS ENUM ('active', 'paused', 'error', 'pending');

DROP TYPE IF EXISTS public.screening_status CASCADE;
CREATE TYPE public.screening_status AS ENUM ('viable', 'needs_review', 'rejected', 'pending');

DROP TYPE IF EXISTS public.questionnaire_status CASCADE;
CREATE TYPE public.questionnaire_status AS ENUM ('not_started', 'in_progress', 'completed', 'qualified', 'needs_review', 'not_a_fit');

DROP TYPE IF EXISTS public.qualification_result CASCADE;
CREATE TYPE public.qualification_result AS ENUM ('qualified', 'needs_review', 'not_a_fit');

DROP TYPE IF EXISTS public.report_status CASCADE;
CREATE TYPE public.report_status AS ENUM ('draft', 'generated', 'exported');

DROP TYPE IF EXISTS public.saturation_level CASCADE;
CREATE TYPE public.saturation_level AS ENUM ('healthy', 'moderate', 'saturated', 'critical');

-- ─── PHASE 4: LEAD SOURCE ARCHITECTURE ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_source_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  market TEXT NOT NULL,
  state TEXT,
  city TEXT,
  filter_url TEXT,
  property_type_filters TEXT[] DEFAULT ARRAY[]::TEXT[],
  furnished_required BOOLEAN DEFAULT false,
  ingestion_method TEXT DEFAULT 'manual' CHECK (ingestion_method IN ('api', 'scrape', 'manual', 'webhook')),
  sync_status public.lead_source_sync_status DEFAULT 'pending',
  is_active BOOLEAN DEFAULT true,
  last_successful_sync TIMESTAMPTZ,
  last_attempted_sync TIMESTAMPTZ,
  error_status TEXT,
  error_message TEXT,
  records_imported INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_source_configs_source_key ON public.lead_source_configs(source_key);
CREATE INDEX IF NOT EXISTS idx_lead_source_configs_market ON public.lead_source_configs(market);
CREATE INDEX IF NOT EXISTS idx_lead_source_configs_state ON public.lead_source_configs(state);

ALTER TABLE public.lead_source_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_lead_source_configs" ON public.lead_source_configs;
CREATE POLICY "admin_manage_lead_source_configs" ON public.lead_source_configs
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add source metadata columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_listing_id TEXT,
  ADD COLUMN IF NOT EXISTS source_listing_url TEXT,
  ADD COLUMN IF NOT EXISTS source_config_id UUID REFERENCES public.lead_source_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedup_hash TEXT,
  ADD COLUMN IF NOT EXISTS cross_source_property_id UUID;

CREATE INDEX IF NOT EXISTS idx_leads_source_listing_id ON public.leads(source_listing_id);
CREATE INDEX IF NOT EXISTS idx_leads_dedup_hash ON public.leads(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_leads_cross_source_property_id ON public.leads(cross_source_property_id);

-- ─── PHASE 4: PROPERTY SCREENING ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  screening_status public.screening_status DEFAULT 'pending',
  -- Regulation screening
  regulation_status TEXT DEFAULT 'unknown' CHECK (regulation_status IN ('allowed', 'restricted', 'prohibited', 'unknown', 'needs_research')),
  regulation_notes TEXT,
  regulation_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
  str_permit_required BOOLEAN,
  known_restricted_zone BOOLEAN DEFAULT false,
  -- Demand screening
  demand_score INTEGER CHECK (demand_score BETWEEN 0 AND 100),
  occupancy_potential TEXT CHECK (occupancy_potential IN ('high', 'moderate', 'low', 'seasonal', 'unknown')),
  seasonality TEXT CHECK (seasonality IN ('year_round', 'seasonal', 'highly_seasonal', 'unknown')),
  demand_notes TEXT,
  -- Economics screening
  estimated_adr NUMERIC(10,2),
  estimated_occupancy_rate NUMERIC(5,2),
  estimated_gross_monthly NUMERIC(10,2),
  estimated_net_monthly NUMERIC(10,2),
  lease_acquisition_cost NUMERIC(10,2),
  economics_viable BOOLEAN,
  economics_notes TEXT,
  -- Overall
  screening_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
  screened_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  screened_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_screenings_lead_id ON public.property_screenings(lead_id);
CREATE INDEX IF NOT EXISTS idx_property_screenings_status ON public.property_screenings(screening_status);

ALTER TABLE public.property_screenings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_manage_property_screenings" ON public.property_screenings;
CREATE POLICY "auth_manage_property_screenings" ON public.property_screenings
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 4: MARKET SATURATION TRACKER ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_saturation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT,
  total_str_listings INTEGER DEFAULT 0,
  active_listings INTEGER DEFAULT 0,
  avg_occupancy_rate NUMERIC(5,2),
  saturation_level public.saturation_level DEFAULT 'healthy',
  cannibalization_threshold INTEGER DEFAULT 150,
  threshold_crossed BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  assigned_agent_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  notes TEXT,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_saturation_zone_state ON public.market_saturation(zone, state);
CREATE INDEX IF NOT EXISTS idx_market_saturation_threshold ON public.market_saturation(threshold_crossed);

ALTER TABLE public.market_saturation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_manage_market_saturation" ON public.market_saturation;
CREATE POLICY "auth_manage_market_saturation" ON public.market_saturation
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 4: STR PERMIT RECORDS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.str_permit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT,
  permit_number TEXT,
  permit_status TEXT DEFAULT 'unknown' CHECK (permit_status IN ('approved', 'denied', 'pending', 'expired', 'revoked', 'unknown')),
  denial_reason TEXT,
  application_date DATE,
  decision_date DATE,
  applicant_name TEXT,
  applicant_email TEXT,
  applicant_phone TEXT,
  property_type TEXT,
  source_url TEXT,
  source_name TEXT DEFAULT 'STR Permit Records',
    lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  converted_to_lead BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_str_permit_records_city_state ON public.str_permit_records(city, state);
CREATE INDEX IF NOT EXISTS idx_str_permit_records_status ON public.str_permit_records(permit_status);
CREATE INDEX IF NOT EXISTS idx_str_permit_records_lead_id ON public.str_permit_records(lead_id);

ALTER TABLE public.str_permit_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_manage_str_permit_records" ON public.str_permit_records;
CREATE POLICY "auth_manage_str_permit_records" ON public.str_permit_records
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 5: PROPERTY REPORTS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  report_status public.report_status DEFAULT 'draft',
  -- Property info snapshot
  property_address TEXT,
  property_type TEXT,
  portfolio TEXT,
  city TEXT,
  state TEXT,
  -- Revenue projections
  revenue_summary TEXT,
  estimated_adr NUMERIC(10,2),
  estimated_occupancy_rate NUMERIC(5,2),
  gross_monthly_revenue NUMERIC(10,2),
  net_monthly_revenue NUMERIC(10,2),
  projected_annual_net NUMERIC(10,2),
  monthly_roi NUMERIC(5,2),
  lease_acquisition_cost NUMERIC(10,2),
  -- Assumptions
  adr_assumption TEXT,
  occupancy_assumption TEXT,
  cost_assumptions JSONB DEFAULT '{}'::JSONB,
  -- AI-generated content
  ai_narrative TEXT,
  regulation_summary TEXT,
  regulation_source TEXT DEFAULT 'system_config',
  -- Metadata
  assumptions_provided BOOLEAN DEFAULT false,
  missing_inputs TEXT[] DEFAULT ARRAY[]::TEXT[],
  generated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  questionnaire_data_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_reports_lead_id ON public.property_reports(lead_id);
CREATE INDEX IF NOT EXISTS idx_property_reports_status ON public.property_reports(report_status);

ALTER TABLE public.property_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_manage_property_reports" ON public.property_reports;
CREATE POLICY "auth_manage_property_reports" ON public.property_reports
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 6: HOMEOWNER QUESTIONNAIRES ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.homeowner_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  unique_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  questionnaire_status public.questionnaire_status DEFAULT 'not_started',
  qualification_result public.qualification_result,
  qualification_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Section A: Property Basics
  confirmed_address TEXT,
  property_type TEXT,
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  current_occupancy TEXT CHECK (current_occupancy IN ('owner_occupied', 'vacant', 'long_term_leased')),
  has_hoa BOOLEAN,
  hoa_allows_str BOOLEAN,
  -- Section B: Safety & Compliance
  has_smoke_detectors BOOLEAN,
  has_co_detectors BOOLEAN,
  has_fire_extinguisher BOOLEAN,
  has_working_locks BOOLEAN,
  has_safe_egress BOOLEAN,
  has_pool_safety_compliance BOOLEAN,
  known_hazards TEXT,
  safety_notes TEXT,
  -- Section C: Location-Specific (stored as JSONB for flexibility)
  regulation_responses JSONB DEFAULT '{}'::JSONB,
  -- Section D: Revenue & Availability
  furnishing_status TEXT CHECK (furnishing_status IN ('fully_furnished', 'partially_furnished', 'unfurnished')),
  current_availability TEXT,
  has_existing_lease BOOLEAN,
  desired_start_date DATE,
  personal_use_restrictions TEXT,
  -- Section E: Contact
  preferred_contact_method TEXT CHECK (preferred_contact_method IN ('email', 'phone', 'text')),
  best_contact_time TEXT,
  additional_info TEXT,
  -- Metadata
  prefilled_address TEXT,
  prefilled_state TEXT,
  prefilled_city TEXT,
  homeowner_email TEXT,
  homeowner_name TEXT,
  save_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  submitted_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ DEFAULT NOW(),
  agent_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_questionnaires_lead_id ON public.homeowner_questionnaires(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_questionnaires_token ON public.homeowner_questionnaires(unique_token);
CREATE INDEX IF NOT EXISTS idx_homeowner_questionnaires_status ON public.homeowner_questionnaires(questionnaire_status);

ALTER TABLE public.homeowner_questionnaires ENABLE ROW LEVEL SECURITY;

-- Public access via token (homeowner-facing)
DROP POLICY IF EXISTS "public_questionnaire_by_token" ON public.homeowner_questionnaires;
CREATE POLICY "public_questionnaire_by_token" ON public.homeowner_questionnaires
FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public_questionnaire_update_by_token" ON public.homeowner_questionnaires;
CREATE POLICY "public_questionnaire_update_by_token" ON public.homeowner_questionnaires
FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_manage_questionnaires" ON public.homeowner_questionnaires;
CREATE POLICY "auth_manage_questionnaires" ON public.homeowner_questionnaires
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 6: REGULATION RULES (configurable) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.regulation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  city TEXT,
  zone TEXT,
  rule_key TEXT NOT NULL,
  rule_label TEXT NOT NULL,
  rule_description TEXT,
  rule_type TEXT DEFAULT 'boolean' CHECK (rule_type IN ('boolean', 'text', 'select', 'number')),
  rule_options TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_required BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verification_notes TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regulation_rules_state ON public.regulation_rules(state);
CREATE INDEX IF NOT EXISTS idx_regulation_rules_city ON public.regulation_rules(city);
CREATE UNIQUE INDEX IF NOT EXISTS idx_regulation_rules_unique ON public.regulation_rules(state, COALESCE(city, ''), rule_key);

ALTER TABLE public.regulation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_regulation_rules" ON public.regulation_rules;
CREATE POLICY "public_read_regulation_rules" ON public.regulation_rules
FOR SELECT TO public USING (is_active = true);

DROP POLICY IF EXISTS "auth_manage_regulation_rules" ON public.regulation_rules;
CREATE POLICY "auth_manage_regulation_rules" ON public.regulation_rules
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 7: HOMEOWNER DASHBOARD ENHANCEMENTS ───────────────────────────────

-- Homeowner notification preferences
CREATE TABLE IF NOT EXISTS public.homeowner_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id UUID REFERENCES public.homeowner_profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.property_homeowners(id) ON DELETE CASCADE,
  notify_new_booking BOOLEAN DEFAULT true,
  notify_payout_processed BOOLEAN DEFAULT true,
  notify_request_update BOOLEAN DEFAULT true,
  notify_monthly_statement BOOLEAN DEFAULT true,
  channel_email BOOLEAN DEFAULT true,
  channel_sms BOOLEAN DEFAULT false,
  channel_in_app BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.homeowner_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homeowner_manage_own_notif_prefs" ON public.homeowner_notification_prefs;
CREATE POLICY "homeowner_manage_own_notif_prefs" ON public.homeowner_notification_prefs
FOR ALL TO authenticated USING (homeowner_id IN (
  SELECT id FROM public.homeowner_profiles WHERE user_id = auth.uid()
)) WITH CHECK (homeowner_id IN (
  SELECT id FROM public.homeowner_profiles WHERE user_id = auth.uid()
));

-- ─── SEED: LEAD SOURCE CONFIGS ────────────────────────────────────────────────

INSERT INTO public.lead_source_configs (source_name, source_key, market, state, city, filter_url, property_type_filters, furnished_required, ingestion_method, sync_status, is_active, notes)
VALUES
  -- Trulia sources
  ('Trulia', 'trulia', 'Denver, CO - Condo/SFH/Townhouse Furnished', 'CO', 'Denver', 'https://www.trulia.com/for_rent/Denver,CO/APARTMENT_CONDO,SINGLE_FAMILY_HOME,TOWNHOUSE_type/FURNISHED_amenity/', ARRAY['condo','single_family','townhouse'], true, 'manual', 'active', true, 'Denver furnished condo/SFH/townhouse'),
  ('Trulia', 'trulia', 'Denver, CO - All Furnished', 'CO', 'Denver', 'https://www.trulia.com/for_rent/Denver,CO/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Denver all furnished types'),
  ('Trulia', 'trulia', 'Las Vegas, NV', 'NV', 'Las Vegas', 'https://www.trulia.com/for_rent/Las_Vegas,NV/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Henderson, NV', 'NV', 'Henderson', 'https://www.trulia.com/for_rent/Henderson,NV/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Seattle, WA', 'WA', 'Seattle', 'https://www.trulia.com/for_rent/Seattle,WA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Bellevue, WA', 'WA', 'Bellevue', 'https://www.trulia.com/for_rent/Bellevue,WA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Renton, WA', 'WA', 'Renton', 'https://www.trulia.com/for_rent/Renton,WA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Miami, FL', 'FL', 'Miami', 'https://www.trulia.com/for_rent/Miami,FL/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Dallas, TX', 'TX', 'Dallas', 'https://www.trulia.com/for_rent/Dallas,TX/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Houston, TX', 'TX', 'Houston', 'https://www.trulia.com/for_rent/Houston,TX/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Los Angeles, CA', 'CA', 'Los Angeles', 'https://www.trulia.com/for_rent/Los_Angeles,CA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Sherman Oaks, CA', 'CA', 'Sherman Oaks', 'https://www.trulia.com/for_rent/Sherman_Oaks,CA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Malibu, CA', 'CA', 'Malibu', 'https://www.trulia.com/for_rent/Malibu,CA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Newport Beach, CA', 'CA', 'Newport Beach', 'https://www.trulia.com/for_rent/Newport_Beach,CA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Aspen, CO', 'CO', 'Aspen', 'https://www.trulia.com/for_rent/Aspen,CO/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Breckenridge, CO', 'CO', 'Breckenridge', 'https://www.trulia.com/for_rent/Breckenridge,CO/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Vail, CO', 'CO', 'Vail', 'https://www.trulia.com/for_rent/Vail,CO/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, NULL),
  ('Trulia', 'trulia', 'Utah Statewide', 'UT', NULL, 'https://www.trulia.com/for_rent/UT/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Utah statewide'),
  ('Trulia', 'trulia', 'Maine Statewide', 'ME', NULL, 'https://www.trulia.com/for_rent/ME/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Maine statewide'),
  ('Trulia', 'trulia', 'Oregon Statewide', 'OR', NULL, 'https://www.trulia.com/for_rent/OR/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Oregon statewide'),
  ('Trulia', 'trulia', 'Massachusetts Statewide', 'MA', NULL, 'https://www.trulia.com/for_rent/MA/FURNISHED_amenity/', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Massachusetts statewide'),
  -- Rent.com
  ('Rent.com', 'rentcom', 'Denver, CO - Furnished Townhouses/Condos/Houses', 'CO', 'Denver', 'https://www.rent.com/colorado/denver-houses?min_beds=1&furnished=true', ARRAY['townhouse','condo','house'], true, 'manual', 'active', true, 'Denver furnished townhouses/condos/houses'),
  -- Realtor.com
  ('Realtor.com', 'realtorcom', 'Denver, CO - Furnished Townhome/SFH/Condo', 'CO', 'Denver', 'https://www.realtor.com/apartments/Denver_CO?keywords=furnished', ARRAY['townhome','single_family','condo'], true, 'manual', 'active', true, 'Denver furnished townhome/SFH/condo'),
  -- PadMapper
  ('PadMapper', 'padmapper', 'Denver, CO - Condo/House', 'CO', 'Denver', 'https://www.padmapper.com/apartments/denver-co?property_types=condo,house', ARRAY['condo','house'], false, 'manual', 'active', true, 'Denver condo/house'),
  -- Apartment List
  ('Apartment List', 'apartmentlist', 'Furnished/Airbnb-Friendly', NULL, NULL, 'https://www.apartmentlist.com/?amenities=furnished', ARRAY[]::TEXT[], true, 'manual', 'active', true, 'Furnished/Airbnb-friendly filter'),
  -- Dwellsy
  ('Dwellsy', 'dwellsy', 'Denver, CO', 'CO', 'Denver', 'https://dwellsy.com/search/?location=Denver%2C+CO', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Las Vegas, NV', 'NV', 'Las Vegas', 'https://dwellsy.com/search/?location=Las+Vegas%2C+NV', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Henderson, NV', 'NV', 'Henderson', 'https://dwellsy.com/search/?location=Henderson%2C+NV', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Los Angeles, CA', 'CA', 'Los Angeles', 'https://dwellsy.com/search/?location=Los+Angeles%2C+CA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Sherman Oaks, CA', 'CA', 'Sherman Oaks', 'https://dwellsy.com/search/?location=Sherman+Oaks%2C+CA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Hollywood, CA', 'CA', 'Hollywood', 'https://dwellsy.com/search/?location=Hollywood%2C+CA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Malibu, CA', 'CA', 'Malibu', 'https://dwellsy.com/search/?location=Malibu%2C+CA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Seattle, WA', 'WA', 'Seattle', 'https://dwellsy.com/search/?location=Seattle%2C+WA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Bellevue, WA', 'WA', 'Bellevue', 'https://dwellsy.com/search/?location=Bellevue%2C+WA', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Miami, FL', 'FL', 'Miami', 'https://dwellsy.com/search/?location=Miami%2C+FL', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  ('Dwellsy', 'dwellsy', 'Breckenridge, CO', 'CO', 'Breckenridge', 'https://dwellsy.com/search/?location=Breckenridge%2C+CO', ARRAY[]::TEXT[], false, 'manual', 'active', true, NULL),
  -- STR Permit Records (distinct lead source)
  ('STR Permit Records', 'str_permits', 'Denver, CO', 'CO', 'Denver', 'https://denvergov.org/Government/Agencies-Departments-Offices/Business-Licensing/Business-licenses/Short-term-rentals', ARRAY[]::TEXT[], false, 'manual', 'active', true, 'Public STR permit application records including denials'),
  ('STR Permit Records', 'str_permits', 'Las Vegas, NV', 'NV', 'Las Vegas', 'https://www.clarkcountynv.gov/business/licensing/Pages/short-term-rental.aspx', ARRAY[]::TEXT[], false, 'manual', 'active', true, 'Clark County STR permit records'),
  ('STR Permit Records', 'str_permits', 'Seattle, WA', 'WA', 'Seattle', 'https://www.seattle.gov/licenses/get-a-business-license/short-term-rental', ARRAY[]::TEXT[], false, 'manual', 'active', true, 'Seattle STR permit records'),
  ('STR Permit Records', 'str_permits', 'Los Angeles, CA', 'CA', 'Los Angeles', 'https://planning.lacity.org/plans-policies/home-sharing-ordinance', ARRAY[]::TEXT[], false, 'manual', 'active', true, 'LA home-sharing permit records')
ON CONFLICT DO NOTHING;

-- ─── SEED: REGULATION RULES ───────────────────────────────────────────────────

INSERT INTO public.regulation_rules (state, city, rule_key, rule_label, rule_description, rule_type, is_required, is_verified, display_order)
VALUES
  -- Colorado - Aspen
  ('CO', 'Aspen', 'str_license', 'STR License Obtained', 'Do you have or are you willing to obtain a City of Aspen STR license ($300/year)?', 'boolean', true, true, 1),
  ('CO', 'Aspen', 'pitkin_county_permit', 'Pitkin County Permit', 'For properties outside city limits, do you have or will you obtain a Pitkin County permit?', 'boolean', false, true, 2),
  ('CO', 'Aspen', 'safety_inspection', 'Annual Safety Inspection', 'Are you willing to complete the required annual safety inspection?', 'boolean', true, true, 3),
  -- Colorado - Breckenridge
  ('CO', 'Breckenridge', 'business_license', 'Business License', 'Do you have or will you obtain a Town of Breckenridge business license ($200/year)?', 'boolean', true, true, 1),
  ('CO', 'Breckenridge', 'summit_county_tax', 'Summit County Tax Registration', 'Are you registered or willing to register for Summit County tax collection?', 'boolean', true, true, 2),
  -- Colorado - Vail
  ('CO', 'Vail', 'str_license', 'STR License', 'Do you have or will you obtain a Vail STR license ($250/year)?', 'boolean', true, true, 1),
  ('CO', 'Vail', 'eagle_county_tax', 'Eagle County Tax Registration', 'Are you registered for Eagle County tax collection?', 'boolean', true, true, 2),
  -- Colorado - Denver
  ('CO', 'Denver', 'str_license', 'Denver STR License', 'Do you have or will you obtain a Denver STR license ($100/year)?', 'boolean', true, true, 1),
  ('CO', 'Denver', 'primary_residence', 'Primary Residence', 'Is this your primary residence (Denver requires primary residence for STR)?', 'boolean', true, true, 2),
  -- California - Malibu
  ('CA', 'Malibu', 'transient_occupancy_permit', 'Transient Occupancy Permit', 'Do you have or will you obtain a Malibu transient occupancy permit ($200/year)?', 'boolean', true, true, 1),
  ('CA', 'Malibu', 'coastal_commission', 'Coastal Commission Compliance', 'Is the property subject to Coastal Commission rules (beachfront properties)?', 'boolean', false, true, 2),
  -- California - Newport Beach
  ('CA', 'Newport Beach', 'str_permit', 'Newport Beach STR Permit', 'Do you have or will you obtain a Newport Beach STR permit?', 'boolean', true, true, 1),
  ('CA', 'Newport Beach', 'coastal_zone', 'Coastal Zone Compliance', 'Is the property in the coastal zone requiring additional compliance?', 'boolean', false, true, 2),
  -- Nevada - Las Vegas
  ('NV', 'Las Vegas', 'business_license', 'Business License', 'Do you have or will you obtain a Las Vegas business license for STR?', 'boolean', true, true, 1),
  ('NV', 'Las Vegas', 'city_vs_county', 'City vs. Unincorporated County', 'Is the property within Las Vegas city limits or unincorporated Clark County?', 'select', true, true, 2),
  -- Nevada - Henderson
  ('NV', 'Henderson', 'business_license', 'Henderson Business License', 'Do you have or will you obtain a Henderson business license for STR?', 'boolean', true, true, 1),
  -- Washington - Seattle
  ('WA', 'Seattle', 'primary_residence', 'Primary Residence Requirement', 'Is this your primary residence (Seattle requires primary residence for STR)?', 'boolean', true, true, 1),
  ('WA', 'Seattle', 'active_str_license', 'Active STR License', 'Do you have or will you obtain an active Seattle STR license?', 'boolean', true, true, 2),
  -- States requiring research (not verified)
  ('FL', NULL, 'research_required', 'Regulatory Research Required', 'Florida STR regulations vary significantly by municipality. Dedicated regulatory research is required before activation.', 'boolean', false, false, 1),
  ('UT', NULL, 'research_required', 'Regulatory Research Required', 'Utah STR regulations vary by city. Dedicated regulatory research is required before activation.', 'boolean', false, false, 1),
  ('ME', NULL, 'research_required', 'Regulatory Research Required', 'Maine STR regulations require dedicated research before activation.', 'boolean', false, false, 1),
  ('OR', NULL, 'research_required', 'Regulatory Research Required', 'Oregon STR regulations require dedicated research before activation.', 'boolean', false, false, 1),
  ('MA', NULL, 'research_required', 'Regulatory Research Required', 'Massachusetts STR regulations require dedicated research before activation.', 'boolean', false, false, 1)
ON CONFLICT DO NOTHING;

-- ─── SEED: MARKET SATURATION DATA ────────────────────────────────────────────

INSERT INTO public.market_saturation (zone, state, city, total_str_listings, active_listings, avg_occupancy_rate, saturation_level, cannibalization_threshold, threshold_crossed)
VALUES
  ('Denver Metro', 'CO', 'Denver', 1240, 980, 72.5, 'moderate', 1500, false),
  ('Aspen', 'CO', 'Aspen', 340, 290, 81.2, 'healthy', 400, false),
  ('Breckenridge', 'CO', 'Breckenridge', 520, 460, 78.4, 'healthy', 600, false),
  ('Vail', 'CO', 'Vail', 410, 370, 79.1, 'healthy', 500, false),
  ('Las Vegas Strip', 'NV', 'Las Vegas', 2100, 1850, 68.3, 'saturated', 2000, true),
  ('Henderson', 'NV', 'Henderson', 480, 420, 65.1, 'moderate', 600, false),
  ('Seattle Metro', 'WA', 'Seattle', 1680, 1420, 71.8, 'moderate', 1800, false),
  ('Bellevue', 'WA', 'Bellevue', 320, 280, 73.2, 'healthy', 400, false),
  ('Miami Beach', 'FL', 'Miami', 3200, 2900, 74.6, 'critical', 3000, true),
  ('Los Angeles', 'CA', 'Los Angeles', 4100, 3200, 62.4, 'critical', 4000, true),
  ('Malibu', 'CA', 'Malibu', 280, 240, 76.8, 'healthy', 350, false),
  ('Newport Beach', 'CA', 'Newport Beach', 420, 380, 75.3, 'healthy', 500, false)
ON CONFLICT (zone, state) DO NOTHING;
