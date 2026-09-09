-- ─── CSV Import Batch Tracking ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.csv_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id TEXT NOT NULL UNIQUE,
  import_filename TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  record_source TEXT DEFAULT 'Manual Zillow Research',
  source_type TEXT DEFAULT 'MANUAL_VERIFIED_IMPORT',
  rows_processed INTEGER DEFAULT 0,
  new_prospects_created INTEGER DEFAULT 0,
  existing_prospects_enriched INTEGER DEFAULT 0,
  duplicates_merged INTEGER DEFAULT 0,
  addresses_verified INTEGER DEFAULT 0,
  addresses_needing_review INTEGER DEFAULT 0,
  phone_numbers_imported INTEGER DEFAULT 0,
  properties_enriched INTEGER DEFAULT 0,
  rent_prices_found INTEGER DEFAULT 0,
  rent_prices_unavailable INTEGER DEFAULT 0,
  new_portfolios_created INTEGER DEFAULT 0,
  existing_portfolios_reused INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_import_batches_imported_at ON public.csv_import_batches(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_csv_import_batches_imported_by ON public.csv_import_batches(imported_by);

ALTER TABLE public.csv_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_csv_import_batches" ON public.csv_import_batches;
CREATE POLICY "authenticated_manage_csv_import_batches"
  ON public.csv_import_batches FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Dynamic Portfolio Registry ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL UNIQUE,
  state_name TEXT NOT NULL,
  portfolio_key TEXT NOT NULL UNIQUE,
  portfolio_label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_registry_state_code ON public.portfolio_registry(state_code);
CREATE INDEX IF NOT EXISTS idx_portfolio_registry_is_active ON public.portfolio_registry(is_active);

ALTER TABLE public.portfolio_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_portfolio_registry" ON public.portfolio_registry;
CREATE POLICY "authenticated_manage_portfolio_registry"
  ON public.portfolio_registry FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Seed existing portfolios
DO $$
BEGIN
  INSERT INTO public.portfolio_registry (state_code, state_name, portfolio_key, portfolio_label, is_active, auto_created)
  VALUES
    ('CO', 'Colorado', 'co', 'Colorado Portfolio', true, false),
    ('CA', 'California', 'ca', 'California Portfolio', true, false),
    ('NV', 'Nevada', 'nv', 'Nevada Portfolio', true, false),
    ('WA', 'Washington', 'wa', 'Washington Portfolio', true, false),
    ('TX', 'Texas', 'tx', 'Texas Portfolio', true, false),
    ('FL', 'Florida', 'fl', 'Florida Portfolio', true, false),
    ('UT', 'Utah', 'ut', 'Utah Portfolio', true, false),
    ('ME', 'Maine', 'me', 'Maine Portfolio', true, false),
    ('OR', 'Oregon', 'or', 'Oregon Portfolio', true, false),
    ('MA', 'Massachusetts', 'ma', 'Massachusetts Portfolio', true, false),
    ('MD', 'Maryland', 'md', 'Maryland Portfolio', true, false)
  ON CONFLICT (state_code) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Portfolio registry seed failed: %', SQLERRM;
END $$;

-- ─── Extend leads table with verified import fields ───────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS original_address TEXT,
  ADD COLUMN IF NOT EXISTS original_contact TEXT,
  ADD COLUMN IF NOT EXISTS original_phone TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS import_filename TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS record_source TEXT DEFAULT 'Sync',
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'AUTOMATED_SYNC',
  ADD COLUMN IF NOT EXISTS standardized_address TEXT,
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS verified_owner BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_number BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_phone BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_verification_source TEXT,
  ADD COLUMN IF NOT EXISTS owner_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ownership_record_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verification_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address_verification_source TEXT,
  ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_property_id TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS enrichment_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_source TEXT,
  ADD COLUMN IF NOT EXISTS current_monthly_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS rent_source TEXT,
  ADD COLUMN IF NOT EXISTS rent_listing_status TEXT,
  ADD COLUMN IF NOT EXISTS rent_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rent_verification_status TEXT DEFAULT 'NOT_FOUND',
  ADD COLUMN IF NOT EXISTS current_asking_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_market_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS historical_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS listing_status TEXT,
  ADD COLUMN IF NOT EXISTS listing_date TEXT,
  ADD COLUMN IF NOT EXISTS days_on_market_listing INTEGER,
  ADD COLUMN IF NOT EXISTS listing_source TEXT,
  ADD COLUMN IF NOT EXISTS listing_source_url TEXT,
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS square_feet INTEGER,
  ADD COLUMN IF NOT EXISTS lot_size NUMERIC,
  ADD COLUMN IF NOT EXISTS year_built INTEGER,
  ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS has_pool BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_parking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_waterfront BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hoa_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_assessment NUMERIC,
  ADD COLUMN IF NOT EXISTS property_photos JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS outreach_status TEXT DEFAULT 'NOT_CONTACTED',
  ADD COLUMN IF NOT EXISTS outreach_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primary_agent_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_agent_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_agents JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portfolio_id TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_name TEXT,
  ADD COLUMN IF NOT EXISTS priority_tier INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS is_verified_lead BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS calculation_version TEXT,
  ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address_source TEXT,
  ADD COLUMN IF NOT EXISTS owner_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT,
  ADD COLUMN IF NOT EXISTS rent_price_source TEXT,
  ADD COLUMN IF NOT EXISTS rent_price_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS property_details_source TEXT,
  ADD COLUMN IF NOT EXISTS listing_source_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_override_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_override_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS beds_source TEXT,
  ADD COLUMN IF NOT EXISTS beds_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_status_source TEXT,
  ADD COLUMN IF NOT EXISTS listing_status_retrieved_at TIMESTAMPTZ;

-- Indexes for new fields
CREATE INDEX IF NOT EXISTS idx_leads_import_batch_id ON public.leads(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_leads_source_type ON public.leads(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_verified_owner ON public.leads(verified_owner);
CREATE INDEX IF NOT EXISTS idx_leads_verified_number ON public.leads(verified_number);
CREATE INDEX IF NOT EXISTS idx_leads_has_phone ON public.leads(has_phone);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON public.leads(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_leads_outreach_status ON public.leads(outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_primary_agent_id ON public.leads(primary_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_priority_tier ON public.leads(priority_tier);
CREATE INDEX IF NOT EXISTS idx_leads_is_verified_lead ON public.leads(is_verified_lead);
CREATE INDEX IF NOT EXISTS idx_leads_standardized_address ON public.leads(standardized_address);
CREATE INDEX IF NOT EXISTS idx_leads_source_property_id ON public.leads(source_property_id);

-- ─── Lead Activity Log (outreach + assignment history) ────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  activity_data JSONB DEFAULT '{}',
  performed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_log_lead_id ON public.lead_activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_log_created_at ON public.lead_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activity_log_activity_type ON public.lead_activity_log(activity_type);

ALTER TABLE public.lead_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_lead_activity_log" ON public.lead_activity_log;
CREATE POLICY "authenticated_manage_lead_activity_log"
  ON public.lead_activity_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Agent Lead Assignments (multi-agent support) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  agent_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  agent_name TEXT,
  is_primary BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  assigned_by_name TEXT,
  unassigned_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_agent_assignments_lead_id ON public.lead_agent_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_agent_assignments_agent_id ON public.lead_agent_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_agent_assignments_is_primary ON public.lead_agent_assignments(is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_agent_assignments_unique_active
  ON public.lead_agent_assignments(lead_id, agent_id)
  WHERE unassigned_at IS NULL;

ALTER TABLE public.lead_agent_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_lead_agent_assignments" ON public.lead_agent_assignments;
CREATE POLICY "authenticated_manage_lead_agent_assignments"
  ON public.lead_agent_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── In-app notifications for agent assignments ───────────────────────────────
-- app_notifications table may already exist; add columns if missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_notifications'
  ) THEN
    -- already exists, nothing to do
    RAISE NOTICE 'app_notifications table already exists';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'app_notifications check failed: %', SQLERRM;
END $$;
