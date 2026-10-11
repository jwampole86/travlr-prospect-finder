-- Market-aware luxury classification. Thresholds come from Zillow Research public data
-- (ZORI observed rent, ZHVI top-tier single-family value) via scripts/refresh_market_benchmarks.py.
-- Lookup order at classification time: ZIP row, then state row.
CREATE TABLE IF NOT EXISTS public.market_cost_benchmarks (
  geo_type              TEXT NOT NULL CHECK (geo_type IN ('zip', 'state')),
  geo_key               TEXT NOT NULL,
  state_code            TEXT,
  rent_index            NUMERIC,
  rent_index_basis      TEXT,
  home_value_top_tier   NUMERIC,
  luxury_rent_threshold INTEGER NOT NULL,
  luxury_sale_threshold INTEGER NOT NULL,
  data_as_of            DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (geo_type, geo_key)
);

CREATE INDEX IF NOT EXISTS idx_market_cost_benchmarks_state ON public.market_cost_benchmarks (state_code);

ALTER TABLE public.market_cost_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_market_cost_benchmarks" ON public.market_cost_benchmarks;
CREATE POLICY "authenticated_read_market_cost_benchmarks"
  ON public.market_cost_benchmarks FOR SELECT TO authenticated USING (true);

-- Audit trail for each classification.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS luxury_threshold_used INTEGER;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS luxury_basis TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS luxury_classified_at TIMESTAMPTZ;
