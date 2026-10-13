-- The rest of what AirDNA's Rentalizer returns for a home (market, comparable listings, home value), plus a
-- partial index so nearby homes' real figures can stand in for a home that has not been looked up.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS airdna_data JSONB;
CREATE INDEX IF NOT EXISTS idx_leads_airdna_area ON public.leads (state, city) WHERE airdna_adr IS NOT NULL;
