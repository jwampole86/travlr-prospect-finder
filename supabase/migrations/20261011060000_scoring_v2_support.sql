-- Scoring v2: one shared model (src/lib/scoring/prospectScoring.ts), plus the plumbing to apply it safely.

-- prospect_score_prev keeps the pre-v2 value (written once, on first recompute) so a rescore can be rolled back.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS prospect_score_prev INTEGER;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score_model_version TEXT;

-- Set-based score writer: one round trip per few hundred leads instead of one per lead.
CREATE OR REPLACE FUNCTION public.bulk_update_prospect_scores(p_updates JSONB, p_model TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.leads l SET
    prospect_score_prev = CASE WHEN l.score_model_version IS DISTINCT FROM p_model THEN l.prospect_score ELSE l.prospect_score_prev END,
    prospect_score      = u.score,
    score_model_version = p_model,
    score_refreshed_at  = now()
  FROM (
    SELECT e->>'id' AS id, (e->>'score')::INTEGER AS score
    FROM jsonb_array_elements(p_updates) e
  ) u
  WHERE l.id = u.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_update_prospect_scores(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_prospect_scores(JSONB, TEXT) TO service_role;

-- Top leads: return the fields the scoring model needs so the dashboard card scores luxury,
-- furnished and sale leads the same way as every other page.
DROP FUNCTION IF EXISTS public.exec_sql_top_leads(TEXT, INT);
CREATE OR REPLACE FUNCTION public.exec_sql_top_leads(
  p_state TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  beds INT,
  baths INT,
  price INT,
  stage TEXT,
  regulation_status TEXT,
  prospect_score INT,
  estimated_net_monthly INT,
  listing_url TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  source TEXT,
  created_at TEXT,
  luxury BOOLEAN,
  price_type TEXT,
  estimated_gross_monthly INT,
  estimated_monthly_rent_ai INT,
  is_fsbo BOOLEAN,
  is_furnished BOOLEAN,
  is_apartment_community BOOLEAN,
  verified_owner BOOLEAN,
  verified_number BOOLEAN,
  verified_address TEXT,
  has_phone BOOLEAN,
  property_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.id, l.address, l.city, l.state, l.zip, l.beds, l.baths, l.price, l.stage, l.regulation_status,
    l.prospect_score, l.estimated_net_monthly, l.listing_url, l.contact_name, l.contact_phone, l.source, l.created_at,
    l.luxury, l.price_type::TEXT, l.estimated_gross_monthly::INT, l.estimated_monthly_rent_ai::INT,
    l.is_fsbo, l.is_furnished, l.is_apartment_community,
    l.verified_owner, l.verified_number, l.verified_address::TEXT, l.has_phone, l.property_type::TEXT
  FROM public.leads l
  WHERE l.is_synthetic IS DISTINCT FROM true
    AND l.prospect_score > 0
    AND l.address IS NOT NULL
    AND l.address <> ''
    AND l.stage NOT IN ('Not a Fit')
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
  ORDER BY l.prospect_score DESC, l.id ASC
  LIMIT LEAST(p_limit, 30);
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql_top_leads(TEXT, INT) TO anon;
