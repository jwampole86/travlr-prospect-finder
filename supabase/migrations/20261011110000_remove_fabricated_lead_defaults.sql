-- leads.beds/baths/price/estimated_* defaulted to 3 / 2 / 2500 / 200 / 65 / 3960 / 2772, so any lead inserted without listing facts
-- looked like a real $2,500 three-bedroom with a revenue estimate and ranked on the Top Scored Leads card. 0 means "unknown",
-- which is what the scorer and dashboards already test with > 0.
ALTER TABLE public.leads
  ALTER COLUMN beds SET DEFAULT 0,
  ALTER COLUMN baths SET DEFAULT 0,
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN estimated_adr SET DEFAULT 0,
  ALTER COLUMN estimated_occupancy SET DEFAULT 0,
  ALTER COLUMN estimated_gross_monthly SET DEFAULT 0,
  ALTER COLUMN estimated_net_monthly SET DEFAULT 0;

-- Rows still carrying every untouched default at once (the importers can never produce adr 200 / net 2772 together).
UPDATE public.leads
SET beds = 0, baths = 0, price = 0,
    estimated_adr = 0, estimated_occupancy = 0, estimated_gross_monthly = 0, estimated_net_monthly = 0
WHERE price = 2500 AND beds = 3 AND baths = 2
  AND estimated_adr = 200 AND estimated_gross_monthly = 3960 AND estimated_net_monthly = 2772
  AND COALESCE(listing_url, '') = ''
  AND source_property_id IS NULL;
