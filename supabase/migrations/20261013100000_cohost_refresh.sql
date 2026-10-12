-- Scheduled co-host listing refresh: ELITE tier, "first seen" dates and a per-market refresh rotation.
-- Server-side only: RLS is on with no policies, so browsers cannot read these tables.

ALTER TABLE public.str_listings
  ADD COLUMN IF NOT EXISTS is_elite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Listings stored before this migration were first seen when they were pulled.
UPDATE public.str_listings SET first_seen_at = pulled_at WHERE first_seen_at > pulled_at;

CREATE INDEX IF NOT EXISTS idx_str_listings_elite ON public.str_listings (is_elite) WHERE is_elite;
CREATE INDEX IF NOT EXISTS idx_str_listings_first_seen ON public.str_listings (first_seen_at DESC);

-- One row per market: when it was last refreshed and where the next refresh should start in a market too big to pull in one go.
CREATE TABLE IF NOT EXISTS public.str_market_refresh (
  market TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  last_refreshed_at TIMESTAMPTZ,
  total_listings INTEGER,
  next_offset INTEGER NOT NULL DEFAULT 0,
  last_new_listings INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.str_market_refresh ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.str_refresh_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL DEFAULT 'cron',
  markets TEXT[] NOT NULL DEFAULT '{}',
  api_calls INTEGER NOT NULL DEFAULT 0,
  new_listings INTEGER NOT NULL DEFAULT 0,
  updated_listings INTEGER NOT NULL DEFAULT 0,
  new_matches INTEGER NOT NULL DEFAULT 0,
  quota_remaining INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  note TEXT
);
ALTER TABLE public.str_refresh_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_str_refresh_runs_started ON public.str_refresh_runs (started_at DESC);
