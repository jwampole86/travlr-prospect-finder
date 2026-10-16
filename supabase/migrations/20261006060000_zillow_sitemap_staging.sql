CREATE TABLE IF NOT EXISTS public.zillow_sitemap_properties (
  zpid TEXT PRIMARY KEY CHECK (zpid ~ '^[0-9]+$'),
  listing_url TEXT NOT NULL,
  families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_sitemaps TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_shard INTEGER NOT NULL CHECK (source_shard >= 0),
  zillow_lastmod TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zillow_sitemap_properties_families
  ON public.zillow_sitemap_properties USING GIN (families);

CREATE INDEX IF NOT EXISTS idx_zillow_sitemap_properties_last_seen
  ON public.zillow_sitemap_properties (last_seen_at DESC);

ALTER TABLE public.zillow_sitemap_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zillow_sitemap_properties_admin_select"
  ON public.zillow_sitemap_properties;
CREATE POLICY "zillow_sitemap_properties_admin_select"
  ON public.zillow_sitemap_properties
  FOR SELECT TO authenticated
  USING (public.get_my_app_role() IN ('admin', 'owner', 'operator', 'super_admin'));

GRANT SELECT ON public.zillow_sitemap_properties TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_zillow_sitemap_page(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_processed INTEGER;
BEGIN
  IF COALESCE(public.get_my_app_role(), '') NOT IN ('admin', 'owner', 'operator', 'super_admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  WITH parsed AS (
    SELECT DISTINCT ON (row_data.zpid)
      row_data.zpid,
      row_data.url,
      row_data.family,
      row_data.source_sitemap_url,
      row_data.source_shard,
      row_data.zillow_lastmod
    FROM jsonb_to_recordset(p_rows) AS row_data(
      zpid TEXT,
      url TEXT,
      family TEXT,
      source_sitemap_url TEXT,
      source_shard INTEGER,
      zillow_lastmod TIMESTAMPTZ
    )
    WHERE row_data.zpid ~ '^[0-9]+$'
      AND row_data.family IN ('for_sale_by_agent', 'for_sale_by_owner')
      AND row_data.source_shard >= 0
      AND row_data.url ~ ('^https://www[.]zillow[.]com/homedetails/.+/' || row_data.zpid || '_zpid/?$')
      AND row_data.source_sitemap_url ~ '^https://www[.]zillow[.]com/xml/sitemaps/us/hdp/(for-sale-by-agent|for-sale-by-owner)/sitemap-[0-9]{4}[.]xml[.]gz$'
    ORDER BY row_data.zpid, row_data.zillow_lastmod DESC NULLS LAST
  ),
  upserted AS (
    INSERT INTO public.zillow_sitemap_properties AS stored (
      zpid,
      listing_url,
      families,
      source_sitemaps,
      source_shard,
      zillow_lastmod
    )
    SELECT
      parsed.zpid,
      parsed.url,
      ARRAY[parsed.family],
      ARRAY[parsed.source_sitemap_url],
      parsed.source_shard,
      parsed.zillow_lastmod
    FROM parsed
    ON CONFLICT (zpid) DO UPDATE SET
      listing_url = EXCLUDED.listing_url,
      families = ARRAY(
        SELECT DISTINCT merged_family.family_value
        FROM unnest(stored.families || EXCLUDED.families) AS merged_family(family_value)
        ORDER BY merged_family.family_value
      ),
      source_sitemaps = ARRAY(
        SELECT DISTINCT merged_source.source_url
        FROM unnest(stored.source_sitemaps || EXCLUDED.source_sitemaps) AS merged_source(source_url)
        ORDER BY merged_source.source_url
      ),
      source_shard = EXCLUDED.source_shard,
      zillow_lastmod = COALESCE(EXCLUDED.zillow_lastmod, stored.zillow_lastmod),
      last_seen_at = now()
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_processed FROM upserted;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_zillow_sitemap_page(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_zillow_sitemap_page(JSONB) TO authenticated;