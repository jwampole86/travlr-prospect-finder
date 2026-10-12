-- Co-host pipeline: existing short-term-rental owners we found on Airbnb / Vrbo / Vacasa listings. Tracked on the listing record.
ALTER TABLE public.str_listings
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'identified',
  ADD COLUMN IF NOT EXISTS service_model TEXT NOT NULL DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
  ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_str_listings_stage ON public.str_listings (pipeline_stage);
