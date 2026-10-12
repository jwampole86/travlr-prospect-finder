-- Landing page for co-host prospects. One short link per prospect listing; the page shows only the public listing's own numbers.
CREATE TABLE IF NOT EXISTS public.cohost_offer_links (
  code TEXT PRIMARY KEY,
  property_id TEXT NOT NULL UNIQUE REFERENCES public.str_listings(property_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ
);

-- Page views (bots flagged), earnings explorer use, audit requests and opt-outs.
CREATE TABLE IF NOT EXISTS public.cohost_offer_events (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL REFERENCES public.cohost_offer_links(code) ON DELETE CASCADE,
  event TEXT NOT NULL,
  sid TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  data JSONB,
  device TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cohost_offer_events_code ON public.cohost_offer_events (code, created_at);

ALTER TABLE public.cohost_offer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohost_offer_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cohost_offer_view(p_code TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cohost_offer_links
  SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, now()), last_viewed_at = now()
  WHERE code = p_code;
$$;
REVOKE ALL ON FUNCTION public.cohost_offer_view(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohost_offer_view(TEXT) TO service_role;
