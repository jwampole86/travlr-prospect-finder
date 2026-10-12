-- Structured permit/licence detail shown to homeowners in their estimate report: what it costs, how long it takes, the steps,
-- and the safety equipment the city expects. Filled by the regulation-research job (mode=details) from official sources.
ALTER TABLE public.city_regulations
  ADD COLUMN IF NOT EXISTS permit_name TEXT,
  ADD COLUMN IF NOT EXISTS permit_cost_summary TEXT,
  ADD COLUMN IF NOT EXISTS permit_cost_low INTEGER,
  ADD COLUMN IF NOT EXISTS permit_cost_high INTEGER,
  ADD COLUMN IF NOT EXISTS permit_renewal TEXT,
  ADD COLUMN IF NOT EXISTS permit_processing_time TEXT,
  ADD COLUMN IF NOT EXISTS permit_application_url TEXT,
  ADD COLUMN IF NOT EXISTS permit_steps JSONB,
  ADD COLUMN IF NOT EXISTS safety_requirements JSONB,
  ADD COLUMN IF NOT EXISTS permit_details_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_city_regulations_permit_details_pending
  ON public.city_regulations (id) WHERE permit_details_updated_at IS NULL;

-- Dashboard panel RPC unchanged; the report reads these columns directly with the service role.
