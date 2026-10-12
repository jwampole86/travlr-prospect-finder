-- Niche tags for co-host listings (see src/lib/niches.ts for the 120-niche directory) and a counts function for the filter.

ALTER TABLE public.str_listings
  ADD COLUMN IF NOT EXISTS niches SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_niche SMALLINT;

CREATE INDEX IF NOT EXISTS idx_str_listings_niches ON public.str_listings USING GIN (niches);

-- How many candidate listings carry each niche, optionally within one state or one market.
CREATE OR REPLACE FUNCTION public.cohost_niche_counts(p_state TEXT DEFAULT NULL, p_market TEXT DEFAULT NULL)
RETURNS TABLE (niche SMALLINT, listings BIGINT, elite BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n AS niche, COUNT(*) AS listings, COUNT(*) FILTER (WHERE is_elite) AS elite
  FROM public.str_listings, UNNEST(niches) AS n
  WHERE segment IN ('candidate', 'new_or_dormant')
    AND (p_market IS NULL OR market = p_market)
    AND (p_state IS NULL OR upper(trim(split_part(market, ',', 2))) = upper(p_state))
  GROUP BY n
$$;
REVOKE ALL ON FUNCTION public.cohost_niche_counts(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohost_niche_counts(TEXT, TEXT) TO service_role;
