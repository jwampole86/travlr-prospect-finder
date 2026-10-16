CREATE TABLE IF NOT EXISTS public.trulia_rental_staging (
  listing_key TEXT PRIMARY KEY CHECK (length(listing_key) BETWEEN 1 AND 2000),
  provider_listing_id TEXT,
  zpid TEXT CHECK (zpid IS NULL OR zpid ~ '^[0-9]+$'),
  listing_url TEXT,
  listing_name TEXT,
  listing_kind TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  rent_min NUMERIC,
  rent_max NUMERIC,
  bedrooms_min NUMERIC,
  bedrooms_max NUMERIC,
  bathrooms_min NUMERIC,
  bathrooms_max NUMERIC,
  source_search_url TEXT,
  raw_data JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trulia_rental_staging_zpid
  ON public.trulia_rental_staging (zpid) WHERE zpid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trulia_rental_staging_listing_url
  ON public.trulia_rental_staging (listing_url) WHERE listing_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trulia_rental_staging_location
  ON public.trulia_rental_staging (state, city);

CREATE INDEX IF NOT EXISTS idx_trulia_rental_staging_last_seen
  ON public.trulia_rental_staging (last_seen_at DESC);

ALTER TABLE public.trulia_rental_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trulia_rental_staging_admin_select"
  ON public.trulia_rental_staging;
CREATE POLICY "trulia_rental_staging_admin_select"
  ON public.trulia_rental_staging
  FOR SELECT TO authenticated
  USING (public.get_my_app_role() IN ('admin', 'owner', 'operator', 'super_admin'));

GRANT SELECT ON public.trulia_rental_staging TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_trulia_rental_page(p_rows JSONB)
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
    SELECT DISTINCT ON (row_data.listing_key)
      row_data.*
    FROM jsonb_to_recordset(p_rows) AS row_data(
      listing_key TEXT,
      provider_listing_id TEXT,
      zpid TEXT,
      listing_url TEXT,
      listing_name TEXT,
      listing_kind TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      rent_min NUMERIC,
      rent_max NUMERIC,
      bedrooms_min NUMERIC,
      bedrooms_max NUMERIC,
      bathrooms_min NUMERIC,
      bathrooms_max NUMERIC,
      source_search_url TEXT,
      raw_data JSONB
    )
    WHERE length(row_data.listing_key) BETWEEN 1 AND 2000
      AND (row_data.zpid IS NULL OR row_data.zpid ~ '^[0-9]+$')
      AND (row_data.listing_url IS NULL OR row_data.listing_url ~ '^https://([a-z0-9-]+[.])*trulia[.]com/')
      AND (row_data.source_search_url IS NULL OR row_data.source_search_url ~ '^https://([a-z0-9-]+[.])*trulia[.]com/')
      AND jsonb_typeof(row_data.raw_data) = 'object'
    ORDER BY row_data.listing_key
  ),
  upserted AS (
    INSERT INTO public.trulia_rental_staging AS stored (
      listing_key,
      provider_listing_id,
      zpid,
      listing_url,
      listing_name,
      listing_kind,
      address,
      city,
      state,
      postal_code,
      rent_min,
      rent_max,
      bedrooms_min,
      bedrooms_max,
      bathrooms_min,
      bathrooms_max,
      source_search_url,
      raw_data
    )
    SELECT
      listing_key,
      provider_listing_id,
      zpid,
      listing_url,
      listing_name,
      listing_kind,
      address,
      city,
      state,
      postal_code,
      rent_min,
      rent_max,
      bedrooms_min,
      bedrooms_max,
      bathrooms_min,
      bathrooms_max,
      source_search_url,
      raw_data
    FROM parsed
    ON CONFLICT DO UPDATE SET
      listing_key = stored.listing_key,
      provider_listing_id = COALESCE(EXCLUDED.provider_listing_id, stored.provider_listing_id),
      zpid = COALESCE(EXCLUDED.zpid, stored.zpid),
      listing_url = COALESCE(EXCLUDED.listing_url, stored.listing_url),
      listing_name = COALESCE(EXCLUDED.listing_name, stored.listing_name),
      listing_kind = COALESCE(EXCLUDED.listing_kind, stored.listing_kind),
      address = COALESCE(EXCLUDED.address, stored.address),
      city = COALESCE(EXCLUDED.city, stored.city),
      state = COALESCE(EXCLUDED.state, stored.state),
      postal_code = COALESCE(EXCLUDED.postal_code, stored.postal_code),
      rent_min = COALESCE(EXCLUDED.rent_min, stored.rent_min),
      rent_max = COALESCE(EXCLUDED.rent_max, stored.rent_max),
      bedrooms_min = COALESCE(EXCLUDED.bedrooms_min, stored.bedrooms_min),
      bedrooms_max = COALESCE(EXCLUDED.bedrooms_max, stored.bedrooms_max),
      bathrooms_min = COALESCE(EXCLUDED.bathrooms_min, stored.bathrooms_min),
      bathrooms_max = COALESCE(EXCLUDED.bathrooms_max, stored.bathrooms_max),
      source_search_url = COALESCE(EXCLUDED.source_search_url, stored.source_search_url),
      raw_data = EXCLUDED.raw_data,
      last_seen_at = now()
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_processed FROM upserted;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_trulia_rental_page(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_trulia_rental_page(JSONB) TO authenticated;