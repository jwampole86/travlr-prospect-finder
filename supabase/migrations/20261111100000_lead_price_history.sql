-- Zillow price/tax history for for-sale leads: the last sale, price cuts since, and the recent events behind them.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_sold_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_sold_date DATE,
  ADD COLUMN IF NOT EXISTS price_cut_count INTEGER,
  ADD COLUMN IF NOT EXISTS price_history JSONB,
  ADD COLUMN IF NOT EXISTS price_history_checked_at TIMESTAMPTZ;

-- Feeds the history job: unchecked for-sale leads, best prospects first.
CREATE INDEX IF NOT EXISTS leads_price_history_queue_idx
  ON public.leads (prospect_score DESC NULLS LAST)
  WHERE price_history_checked_at IS NULL AND price_type = 'sale';
