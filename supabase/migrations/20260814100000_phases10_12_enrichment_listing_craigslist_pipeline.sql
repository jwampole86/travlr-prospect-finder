-- Phase 10: Enrichment pipeline, Phase 11: listing_url fix, Phase 12: Craigslist snapshots, Pipeline bug fix

-- ============================================================
-- PHASE 10: ENRICHMENT DATA MODEL
-- ============================================================

-- Enrichment status enum
DROP TYPE IF EXISTS public.enrichment_status_type CASCADE;
CREATE TYPE public.enrichment_status_type AS ENUM ('Not Enriched', 'Partial', 'Complete');

-- Ownership type enum
DROP TYPE IF EXISTS public.ownership_type CASCADE;
CREATE TYPE public.ownership_type AS ENUM ('Individual', 'LLC', 'Trust', 'Other', 'Unknown');

-- Enrichment stage enum
DROP TYPE IF EXISTS public.enrichment_stage CASCADE;
CREATE TYPE public.enrichment_stage AS ENUM ('stage1', 'stage2', 'stage3');

-- Contact verified status
DROP TYPE IF EXISTS public.contact_verified_status CASCADE;
CREATE TYPE public.contact_verified_status AS ENUM ('Verified', 'Unverified');

-- Lead enrichment records (one per lead, updated in place)
CREATE TABLE IF NOT EXISTS public.lead_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Stage 1: Owner info
  owner_name TEXT,
  owner_mailing_address TEXT,
  owner_mailing_city TEXT,
  owner_mailing_state TEXT,
  owner_mailing_zip TEXT,
  ownership_type public.ownership_type DEFAULT 'Unknown',
  -- Enrichment metadata
  enrichment_status public.enrichment_status_type DEFAULT 'Not Enriched',
  last_enriched_at TIMESTAMPTZ,
  enrichment_sources JSONB DEFAULT '[]',
  do_not_contact BOOLEAN DEFAULT FALSE,
  -- Stage 1 provider info
  stage1_provider TEXT,
  stage1_completed_at TIMESTAMPTZ,
  stage1_raw_response JSONB,
  -- Stage 2 provider info
  stage2_provider TEXT,
  stage2_completed_at TIMESTAMPTZ,
  stage2_raw_response JSONB,
  -- Stage 3 (skip trace)
  stage3_provider TEXT,
  stage3_completed_at TIMESTAMPTZ,
  stage3_cost NUMERIC(10,4),
  stage3_raw_response JSONB,
  -- Cache control
  cache_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id)
);

-- Enriched emails (multiple per lead)
CREATE TABLE IF NOT EXISTS public.enriched_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  confidence NUMERIC(5,2) DEFAULT 0,
  source TEXT,
  verified_status public.contact_verified_status DEFAULT 'Unverified',
  stage public.enrichment_stage DEFAULT 'stage2',
  is_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enriched phones (multiple per lead)
CREATE TABLE IF NOT EXISTS public.enriched_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_type TEXT DEFAULT 'unknown',
  confidence NUMERIC(5,2) DEFAULT 0,
  source TEXT,
  verified_status public.contact_verified_status DEFAULT 'Unverified',
  stage public.enrichment_stage DEFAULT 'stage2',
  is_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enrichment API call log (cost tracking)
CREATE TABLE IF NOT EXISTS public.enrichment_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  stage public.enrichment_stage NOT NULL,
  cost NUMERIC(10,4) DEFAULT 0,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  response_summary JSONB,
  called_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PHASE 11: LISTING URL FIX — add listing_url + sync_source_url to leads
-- ============================================================

-- listing_url already exists on leads (from prior migrations), ensure sync_source_url exists
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sync_source_url TEXT,
  ADD COLUMN IF NOT EXISTS listing_url_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS listing_url_last_checked TIMESTAMPTZ;

-- Backfill: for existing leads where listing_url looks like a search/filter URL
-- (contains filter keywords), mark as needing review
UPDATE public.leads
SET listing_url_status = 'needs_review'
WHERE listing_url IS NOT NULL
  AND listing_url != ''
  AND (
    listing_url LIKE '%/for_rent/%'
    OR listing_url LIKE '%/search/%'
    OR listing_url LIKE '%?%beds%'
    OR listing_url LIKE '%furnished%'
    OR listing_url LIKE '%CONDO%'
    OR listing_url LIKE '%SINGLE-FAMILY%'
    OR listing_url LIKE '%TOWNHOUSE%'
    OR listing_url LIKE '%type/%'
  )
  AND listing_url_status = 'unknown';

-- Mark leads with no listing_url as unavailable
UPDATE public.leads
SET listing_url_status = 'unavailable'
WHERE (listing_url IS NULL OR listing_url = '')
  AND listing_url_status = 'unknown';

-- Mark remaining as active (individual listing URLs)
UPDATE public.leads
SET listing_url_status = 'active'
WHERE listing_url IS NOT NULL
  AND listing_url != ''
  AND listing_url_status = 'unknown';

-- ============================================================
-- PHASE 12: CRAIGSLIST SNAPSHOT + LINK STATUS
-- ============================================================

-- Craigslist link status enum
DROP TYPE IF EXISTS public.craigslist_link_status CASCADE;
CREATE TYPE public.craigslist_link_status AS ENUM ('Active', 'Stale', 'Reposted', 'Snapshot Only');

-- Craigslist listing snapshots
CREATE TABLE IF NOT EXISTS public.craigslist_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  price NUMERIC(10,2),
  beds INTEGER,
  baths NUMERIC(4,1),
  sqft INTEGER,
  photos JSONB DEFAULT '[]',
  original_post_date TIMESTAMPTZ,
  snapshot_date TIMESTAMPTZ DEFAULT NOW(),
  original_url TEXT,
  link_status public.craigslist_link_status DEFAULT 'Active',
  last_link_check_at TIMESTAMPTZ,
  rematch_confidence NUMERIC(5,2),
  rematch_url TEXT,
  rematch_found_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id)
);

-- Add Craigslist-specific columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS craigslist_link_status public.craigslist_link_status,
  ADD COLUMN IF NOT EXISTS craigslist_last_link_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS craigslist_rematch_confidence NUMERIC(5,2);

-- ============================================================
-- PIPELINE BUG FIX: INDEXES FOR PERFORMANCE (no row caps)
-- ============================================================

-- Indexes on commonly filtered fields
CREATE INDEX IF NOT EXISTS idx_leads_address ON public.leads(address);
CREATE INDEX IF NOT EXISTS idx_leads_city ON public.leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON public.leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score ON public.leads(prospect_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_regulation_status ON public.leads(regulation_status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON public.leads(updated_at DESC);

-- Composite index for high-score uncontacted leads (Action Needed)
CREATE INDEX IF NOT EXISTS idx_leads_action_needed ON public.leads(prospect_score DESC, stage)
  WHERE stage NOT IN ('Not a Fit', 'Live', 'Under Contract');

-- Enrichment indexes
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_lead_id ON public.lead_enrichments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_status ON public.lead_enrichments(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_cache ON public.lead_enrichments(cache_expires_at);
CREATE INDEX IF NOT EXISTS idx_enriched_emails_lead_id ON public.enriched_emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_enriched_phones_lead_id ON public.enriched_phones(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_api_logs_lead_id ON public.enrichment_api_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_api_logs_provider ON public.enrichment_api_logs(provider, stage);
CREATE INDEX IF NOT EXISTS idx_craigslist_snapshots_lead_id ON public.craigslist_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_craigslist_snapshots_status ON public.craigslist_snapshots(link_status);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.lead_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enriched_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enriched_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.craigslist_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_lead_enrichments" ON public.lead_enrichments;
CREATE POLICY "authenticated_manage_lead_enrichments" ON public.lead_enrichments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_enriched_emails" ON public.enriched_emails;
CREATE POLICY "authenticated_manage_enriched_emails" ON public.enriched_emails
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_enriched_phones" ON public.enriched_phones;
CREATE POLICY "authenticated_manage_enriched_phones" ON public.enriched_phones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_enrichment_api_logs" ON public.enrichment_api_logs;
CREATE POLICY "authenticated_manage_enrichment_api_logs" ON public.enrichment_api_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_craigslist_snapshots" ON public.craigslist_snapshots;
CREATE POLICY "authenticated_manage_craigslist_snapshots" ON public.craigslist_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
