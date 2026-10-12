-- Last known remaining allowance per paid API key, shared by every job that spends it, so a run on a fresh server does not start blind.
CREATE TABLE IF NOT EXISTS public.api_quota_state (
  service TEXT PRIMARY KEY,
  remaining INTEGER NOT NULL,
  resets_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_quota_state ENABLE ROW LEVEL SECURITY;
