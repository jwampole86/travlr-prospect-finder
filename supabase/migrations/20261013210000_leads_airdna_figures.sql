-- AirDNA Rentalizer figures for a property, kept so the estimate pages and texts use real market data and a lead is looked up once.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS airdna_adr NUMERIC,
  ADD COLUMN IF NOT EXISTS airdna_occupancy NUMERIC,
  ADD COLUMN IF NOT EXISTS airdna_annual_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS airdna_confidence TEXT,
  ADD COLUMN IF NOT EXISTS airdna_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_airdna_checked ON public.leads (airdna_checked_at) WHERE airdna_checked_at IS NOT NULL;
