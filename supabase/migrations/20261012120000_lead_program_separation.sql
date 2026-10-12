-- Two separate programs share the leads table:
--   str_conversion: homeowners we are trying to turn into short-term-rental hosts (estimate -> vetting -> preparation -> listing). The text campaigns target only these.
--   co_host: owners who already list on Airbnb / Vrbo / Vacasa etc. We offer co-hosting only, or co-hosting plus management. These are never texted.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'str_conversion',
  ADD COLUMN IF NOT EXISTS cohost_service TEXT,
  ADD COLUMN IF NOT EXISTS existing_platforms TEXT[],
  ADD COLUMN IF NOT EXISTS existing_listing_ref TEXT,
  ADD COLUMN IF NOT EXISTS program_reason TEXT,
  ADD COLUMN IF NOT EXISTS program_set_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_program_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_program_check CHECK (program IN ('str_conversion', 'co_host'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_cohost_service_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_cohost_service_check CHECK (cohost_service IS NULL OR cohost_service IN ('undecided', 'co_host_only', 'co_host_and_manager'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_program ON public.leads (program) WHERE program <> 'str_conversion';

-- Link a co-host prospect listing to the CRM lead created for it.
ALTER TABLE public.str_listings ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL;
