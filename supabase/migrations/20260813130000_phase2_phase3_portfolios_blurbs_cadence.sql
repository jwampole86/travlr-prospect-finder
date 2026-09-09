-- Phase 2 & 3: Portfolio expansion, zone structure, local blurb table, address validation, cadence step order
-- Migration: 20260813130000_phase2_phase3_portfolios_blurbs_cadence.sql

-- ─── 1. Add zone/market columns to leads table (if not already present) ───────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'neighborhood') THEN
    ALTER TABLE public.leads ADD COLUMN neighborhood TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'portfolio') THEN
    ALTER TABLE public.leads ADD COLUMN portfolio TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'address_incomplete') THEN
    ALTER TABLE public.leads ADD COLUMN address_incomplete BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'listing_id_source') THEN
    ALTER TABLE public.leads ADD COLUMN listing_id_source TEXT;
  END IF;
END $$;

-- ─── 2. Mark leads with listing IDs as addresses ──────────────────────────────
-- Flag any existing leads where address looks like a listing ID
UPDATE public.leads
SET address_incomplete = TRUE,
    listing_id_source = address
WHERE address ~* '^(other listing #|hotpads listing #|apartments\.com listing #|zillow listing #|listing #|listing id:)'
   OR (address ~ '^\d{7,}$');

-- ─── 3. Create local_blurbs lookup table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.local_blurbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  city TEXT,
  blurb TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (state, city)
);

-- Enable RLS
ALTER TABLE public.local_blurbs ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'local_blurbs' AND policyname = 'local_blurbs_read') THEN
    CREATE POLICY local_blurbs_read ON public.local_blurbs
      FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'local_blurbs' AND policyname = 'local_blurbs_admin_write') THEN
    CREATE POLICY local_blurbs_admin_write ON public.local_blurbs
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'))
      );
  END IF;
END $$;

-- ─── 4. Seed local blurbs data ────────────────────────────────────────────────
INSERT INTO public.local_blurbs (state, city, blurb) VALUES
  -- Colorado
  ('CO', 'Denver', 'we''ve built a strong local presence in Denver''s short-term rental market, with deep knowledge of the city''s STR regulations and high-demand neighborhoods'),
  ('CO', 'Aspen', 'we have an established footprint in Aspen''s luxury vacation rental market, consistently delivering premium guest experiences in one of Colorado''s most sought-after destinations'),
  ('CO', 'Breckenridge', 'we''ve been operating in Breckenridge''s ski-and-summer rental market for years, with proven results for homeowners looking to maximize their mountain property income'),
  ('CO', 'Vail', 'we have a strong track record in Vail''s world-class resort rental market, helping homeowners capture peak-season demand while maintaining year-round occupancy'),
  ('CO', NULL, 'we have an established presence in Colorado''s short-term rental market, with proven results across the state''s diverse mountain and urban destinations'),
  -- Nevada
  ('NV', 'Las Vegas', 'we''re actively growing our presence in the Las Vegas short-term rental market, bringing our proven management systems to one of the country''s highest-demand hospitality destinations'),
  ('NV', 'Henderson', 'we''re expanding our operations into Henderson, offering homeowners a professional alternative to self-managing their short-term rental properties'),
  ('NV', NULL, 'we''re actively growing our footprint in Nevada''s short-term rental market'),
  -- Washington
  ('WA', 'Seattle', 'we''ve established a growing presence in Seattle''s competitive short-term rental market, with expertise in the city''s licensing requirements and high-occupancy neighborhoods'),
  ('WA', 'Bellevue', 'we''re building our footprint in Bellevue''s premium rental market, connecting homeowners with the area''s strong corporate and leisure travel demand'),
  ('WA', 'Renton', 'we''re expanding into Renton, offering homeowners professional short-term rental management with access to Seattle metro area demand'),
  ('WA', NULL, 'we''re actively growing our footprint in Washington''s short-term rental market'),
  -- California
  ('CA', 'Los Angeles', 'we have an established presence in the Los Angeles short-term rental market, with deep expertise in the city''s complex STR regulations and year-round tourism demand'),
  ('CA', 'Sherman Oaks', 'we''re actively growing our operations in Sherman Oaks, bringing professional STR management to one of the San Fernando Valley''s most desirable residential neighborhoods'),
  ('CA', 'Hollywood', 'we have experience operating in Hollywood''s high-demand short-term rental market, capturing strong occupancy from entertainment industry visitors and tourists alike'),
  ('CA', 'Malibu', 'we manage luxury short-term rentals in Malibu, delivering exceptional guest experiences in one of California''s most prestigious coastal destinations'),
  ('CA', 'Newport Beach', 'we have a strong presence in Newport Beach''s premium vacation rental market, helping homeowners maximize returns in one of Southern California''s top coastal destinations'),
  ('CA', NULL, 'we have an established presence in California''s short-term rental market, with expertise across the state''s diverse coastal and urban destinations'),
  -- Florida
  ('FL', 'Miami', 'we''re actively growing our footprint in Miami''s vibrant short-term rental market, bringing professional management to one of the country''s top hospitality destinations'),
  ('FL', NULL, 'we''re actively growing our footprint in Florida''s short-term rental market, bringing professional management to the state''s premier vacation destinations'),
  -- Utah
  ('UT', NULL, 'we''re actively growing our footprint in Utah''s short-term rental market, bringing professional management to the state''s world-class ski and outdoor recreation destinations'),
  -- Maine
  ('ME', NULL, 'we''re actively growing our footprint in Maine''s short-term rental market, bringing professional management to the state''s coastal and seasonal destinations'),
  -- Oregon
  ('OR', NULL, 'we''re actively growing our footprint in Oregon''s short-term rental market, bringing professional management to the state''s diverse coastal and mountain destinations'),
  -- Massachusetts
  ('MA', NULL, 'we''re actively growing our footprint in Massachusetts''s short-term rental market, bringing professional management to the state''s historic and coastal destinations'),
  -- Texas
  ('TX', 'Dallas', 'we''re actively growing our footprint in the Dallas short-term rental market, bringing professional management expertise to one of Texas''s fastest-growing metros'),
  ('TX', 'Houston', 'we''re expanding our operations into Houston, offering homeowners a professional short-term rental management solution in one of the country''s largest cities'),
  ('TX', NULL, 'we''re actively growing our footprint across Texas''s short-term rental market')
ON CONFLICT (state, city) DO UPDATE SET
  blurb = EXCLUDED.blurb,
  updated_at = NOW();

-- ─── 5. Add cadence_step to email_templates if not present ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'cadence_step') THEN
    ALTER TABLE public.email_templates ADD COLUMN cadence_step INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'portfolio') THEN
    ALTER TABLE public.email_templates ADD COLUMN portfolio TEXT;
  END IF;
END $$;

-- ─── 6. Update existing email_templates to use new cadence category names ─────
-- Map legacy categories to new 5-step cadence categories
UPDATE public.email_templates
SET category = 'initial_outreach'
WHERE category IN ('outreach') AND cadence_step IS NULL;

UPDATE public.email_templates
SET category = 'follow_up_1'
WHERE category IN ('follow_up') AND cadence_step IS NULL;

UPDATE public.email_templates
SET category = 'proposal_introduction'
WHERE category IN ('proposal') AND cadence_step IS NULL;

UPDATE public.email_templates
SET category = 'closing'
WHERE category IN ('closing') AND cadence_step IS NULL;

-- Set cadence_step numbers based on category
UPDATE public.email_templates SET cadence_step = 1 WHERE category = 'initial_outreach' AND cadence_step IS NULL;
UPDATE public.email_templates SET cadence_step = 2 WHERE category = 'follow_up_1' AND cadence_step IS NULL;
UPDATE public.email_templates SET cadence_step = 3 WHERE category = 'check_in' AND cadence_step IS NULL;
UPDATE public.email_templates SET cadence_step = 4 WHERE category = 'proposal_introduction' AND cadence_step IS NULL;
UPDATE public.email_templates SET cadence_step = 5 WHERE category = 'closing' AND cadence_step IS NULL;

-- ─── 7. Create missing_blurb_flags table for tracking leads needing blurbs ────
CREATE TABLE IF NOT EXISTS public.missing_blurb_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  city TEXT,
  state TEXT,
  flagged_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.missing_blurb_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'missing_blurb_flags' AND policyname = 'missing_blurb_flags_read') THEN
    CREATE POLICY missing_blurb_flags_read ON public.missing_blurb_flags
      FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'missing_blurb_flags' AND policyname = 'missing_blurb_flags_write') THEN
    CREATE POLICY missing_blurb_flags_write ON public.missing_blurb_flags
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END $$;
