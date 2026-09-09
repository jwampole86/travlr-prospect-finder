-- Create leads table for TRAVLR Prospect Finder
-- Supports CSV import, persistence, and per-user lead management

DROP TYPE IF EXISTS public.lead_stage CASCADE;
CREATE TYPE public.lead_stage AS ENUM (
  'New Lead',
  'Contacted',
  'Interested',
  'Proposal Sent',
  'Under Contract',
  'Live',
  'Not a Fit'
);

DROP TYPE IF EXISTS public.lead_source CASCADE;
CREATE TYPE public.lead_source AS ENUM (
  'Zillow',
  'Craigslist',
  'Facebook Marketplace',
  'Realtor.com',
  'Direct',
  'Referral',
  'LoopNet'
);

DROP TYPE IF EXISTS public.regulation_status CASCADE;
CREATE TYPE public.regulation_status AS ENUM (
  'Allowed',
  'Restricted',
  'Prohibited',
  'Unknown'
);

DROP TYPE IF EXISTS public.price_type CASCADE;
CREATE TYPE public.price_type AS ENUM ('sale', 'rent');

-- Core leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Denver',
  state TEXT NOT NULL DEFAULT 'CO',
  zip TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION DEFAULT 39.7392,
  lng DOUBLE PRECISION DEFAULT -104.9903,
  beds INTEGER DEFAULT 3,
  baths DOUBLE PRECISION DEFAULT 2,
  price INTEGER DEFAULT 2500,
  price_type public.price_type DEFAULT 'rent'::public.price_type,
  source public.lead_source DEFAULT 'Direct'::public.lead_source,
  stage public.lead_stage DEFAULT 'New Lead'::public.lead_stage,
  regulation_status public.regulation_status DEFAULT 'Unknown'::public.regulation_status,
  prospect_score INTEGER DEFAULT 60,
  days_on_market INTEGER DEFAULT 0,
  last_checked TEXT DEFAULT '',
  listing_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  estimated_adr INTEGER DEFAULT 200,
  estimated_occupancy INTEGER DEFAULT 65,
  estimated_gross_monthly INTEGER DEFAULT 3960,
  estimated_net_monthly INTEGER DEFAULT 2772,
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_city ON public.leads(city);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users manage their own leads
DROP POLICY IF EXISTS "users_manage_own_leads" ON public.leads;
CREATE POLICY "users_manage_own_leads"
ON public.leads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow public (unauthenticated) access for preview mode
DROP POLICY IF EXISTS "public_preview_leads" ON public.leads;
CREATE POLICY "public_preview_leads"
ON public.leads
FOR ALL
TO public
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);
