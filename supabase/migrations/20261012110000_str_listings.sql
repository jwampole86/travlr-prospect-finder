-- Short-term-rental listings pulled from AirDNA (Airbnb / Vrbo / Booking.com), scored for co-listing outreach.
-- Server-side only: RLS is on with no policies, so browsers cannot read it.
CREATE TABLE IF NOT EXISTS public.str_listings (
  property_id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  title TEXT,
  airbnb_url TEXT,
  vrbo_url TEXT,
  booking_url TEXT,
  channels TEXT[],
  host_id TEXT,
  host_listing_count INT,
  bedrooms INT,
  bathrooms NUMERIC(3,1),
  accommodates INT,
  adr NUMERIC(10,2),
  occupancy_pct NUMERIC(5,2),
  days_available_ltm INT,
  revenue_ltm NUMERIC(12,2),
  revenue_potential_ltm NUMERIC(12,2),
  rating NUMERIC(3,2),
  reviews INT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  address_match_confidence TEXT,
  photo_count INT,
  photo_urls TEXT[],
  -- scoring
  under_score INT,
  under_reasons TEXT[],
  segment TEXT,
  photo_score INT,
  photo_notes JSONB,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scored_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_str_listings_market_score ON public.str_listings (market, under_score DESC);
CREATE INDEX IF NOT EXISTS idx_str_listings_host ON public.str_listings (host_id);
ALTER TABLE public.str_listings ENABLE ROW LEVEL SECURITY;
