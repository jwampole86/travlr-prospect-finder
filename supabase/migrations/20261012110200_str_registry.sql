-- Public short-term-rental license registries (county / city open data), used to tie an Airbnb/Vrbo listing to a real address and permit holder.
CREATE TABLE IF NOT EXISTS public.str_registry (
  jurisdiction TEXT NOT NULL,
  permit_id TEXT NOT NULL,
  address TEXT,
  address_norm TEXT,
  parcel TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  holder_name TEXT,
  license_type TEXT,
  active BOOLEAN,
  source_url TEXT,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jurisdiction, permit_id)
);
CREATE INDEX IF NOT EXISTS idx_str_registry_norm ON public.str_registry (address_norm);
ALTER TABLE public.str_registry ENABLE ROW LEVEL SECURITY;

-- Result of matching each scored listing to a registry entry and a property record.
ALTER TABLE public.str_listings
  ADD COLUMN IF NOT EXISTS match_status TEXT,
  ADD COLUMN IF NOT EXISTS match_candidates JSONB,
  ADD COLUMN IF NOT EXISTS matched_address TEXT,
  ADD COLUMN IF NOT EXISTS matched_owner JSONB,
  ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
