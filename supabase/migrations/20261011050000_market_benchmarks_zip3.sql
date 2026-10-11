-- Adds a 3-digit-ZIP-prefix tier (median of neighboring ZIPs) between ZIP and state,
-- for ZIPs missing from the Zillow data (PO boxes, new or sparse ZIPs).
ALTER TABLE public.market_cost_benchmarks DROP CONSTRAINT IF EXISTS market_cost_benchmarks_geo_type_check;
ALTER TABLE public.market_cost_benchmarks
  ADD CONSTRAINT market_cost_benchmarks_geo_type_check CHECK (geo_type IN ('zip', 'zip3', 'state'));
