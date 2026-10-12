-- Research queue + richer AI upsert for the regulation-research cron, and source_type exposed to the dashboard panel.

-- Markets with real leads that have no rule yet (NEW), plus AI-researched rules that came back unresolved and are due for another attempt (RETRY).
CREATE OR REPLACE FUNCTION public.get_regulation_research_queue(
  p_limit INTEGER DEFAULT 5,
  p_min_leads INTEGER DEFAULT 2,
  p_state TEXT DEFAULT NULL,
  p_retry_days INTEGER DEFAULT 14
)
RETURNS TABLE(city TEXT, state TEXT, lead_count BIGINT, reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout = '60s'
AS $$
  WITH m AS (
    SELECT upper(btrim(l.state)) AS state,
           lower(btrim(l.city)) AS city_key,
           min(btrim(l.city)) AS city,
           count(*) AS leads
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE
      AND coalesce(btrim(l.city), '') <> '' AND coalesce(btrim(l.state), '') <> ''
      AND (p_state IS NULL OR p_state = '' OR upper(btrim(l.state)) = upper(p_state))
    GROUP BY upper(btrim(l.state)), lower(btrim(l.city))
  )
  SELECT CASE WHEN m.city = upper(m.city) THEN initcap(m.city) ELSE m.city END,
         m.state,
         m.leads::BIGINT,
         CASE WHEN r.id IS NULL THEN 'NEW' ELSE 'RETRY' END
  FROM m
  LEFT JOIN public.city_regulations r
    ON upper(btrim(r.state)) = m.state
   AND lower(btrim(coalesce(r.city, r.jurisdiction_name))) = m.city_key
  WHERE m.leads >= p_min_leads
    AND (r.id IS NULL
         OR (r.source_type = 'AI_RESEARCHED'
             AND r.status IN ('UNKNOWN', 'REVIEW_REQUIRED')
             AND r.updated_at < now() - make_interval(days => p_retry_days)))
  ORDER BY m.leads DESC, m.state, m.city
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_regulation_research_queue(INTEGER, INTEGER, TEXT, INTEGER) TO service_role;

-- Never overwrites a human-entered or officially sourced rule: returns NULL when the existing row is not AI_RESEARCHED.
CREATE OR REPLACE FUNCTION public.upsert_ai_regulation_v2(
  p_city TEXT,
  p_state TEXT,
  p_status TEXT,
  p_str_allowed BOOLEAN,
  p_permit_required BOOLEAN,
  p_license_required BOOLEAN,
  p_registration_required BOOLEAN,
  p_primary_residence_required BOOLEAN,
  p_night_cap INTEGER,
  p_minimum_stay INTEGER,
  p_tax_requirements TEXT,
  p_additional_restrictions TEXT,
  p_summary TEXT,
  p_agent_summary TEXT,
  p_source_name TEXT,
  p_source_url TEXT,
  p_confidence TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.city_regulations
    (jurisdiction_name, city, state, jurisdiction_type, status, str_allowed,
     permit_required, license_required, registration_required, primary_residence_required,
     night_cap, minimum_stay, tax_requirements, additional_restrictions,
     summary, agent_summary, source_name, source_url, source_type,
     last_verified_at, next_review_at, review_status, confidence, regulation_version)
  VALUES
    (p_city || ', ' || p_state, p_city, p_state, 'CITY', p_status, p_str_allowed,
     p_permit_required, p_license_required, p_registration_required, p_primary_residence_required,
     p_night_cap, p_minimum_stay, p_tax_requirements, p_additional_restrictions,
     p_summary, coalesce(p_agent_summary, p_summary),
     coalesce(p_source_name, 'Claude (Anthropic), AI-researched'), p_source_url, 'AI_RESEARCHED',
     NOW(), NOW() + INTERVAL '90 days', 'REVIEW_REQUIRED', p_confidence, 1)
  ON CONFLICT (LOWER(TRIM(state)), LOWER(TRIM(COALESCE(city, ''))), LOWER(TRIM(COALESCE(county, ''))))
  DO UPDATE SET
    status = EXCLUDED.status,
    str_allowed = EXCLUDED.str_allowed,
    permit_required = EXCLUDED.permit_required,
    license_required = EXCLUDED.license_required,
    registration_required = EXCLUDED.registration_required,
    primary_residence_required = EXCLUDED.primary_residence_required,
    night_cap = EXCLUDED.night_cap,
    minimum_stay = EXCLUDED.minimum_stay,
    tax_requirements = EXCLUDED.tax_requirements,
    additional_restrictions = EXCLUDED.additional_restrictions,
    summary = EXCLUDED.summary,
    agent_summary = EXCLUDED.agent_summary,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    last_verified_at = EXCLUDED.last_verified_at,
    next_review_at = EXCLUDED.next_review_at,
    review_status = 'REVIEW_REQUIRED',
    confidence = EXCLUDED.confidence,
    regulation_version = public.city_regulations.regulation_version + 1,
    updated_at = NOW()
  WHERE public.city_regulations.source_type = 'AI_RESEARCHED'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_ai_regulation_v2(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Dashboard panel: also return source_type so AI-researched rules can be labelled as such.
CREATE OR REPLACE FUNCTION public.get_regulation_markets(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH lead_markets AS (
    SELECT upper(btrim(l.state)) AS state,
           lower(btrim(l.city)) AS city_key,
           min(btrim(l.city)) AS city,
           count(*)::INT AS leads,
           round(avg(l.prospect_score))::INT AS avg_score
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE
      AND coalesce(btrim(l.city), '') <> '' AND coalesce(btrim(l.state), '') <> ''
      AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR upper(btrim(l.state)) = upper(p_state))
    GROUP BY upper(btrim(l.state)), lower(btrim(l.city))
  ), rules AS (
    SELECT r.*, upper(btrim(r.state)) AS state_u, lower(btrim(coalesce(r.city, r.jurisdiction_name))) AS city_key
    FROM public.city_regulations r
    WHERE (p_state IS NULL OR p_state = 'all' OR p_state = '' OR upper(btrim(r.state)) = upper(p_state))
  )
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.leads DESC, t.state, t.city), '[]'::jsonb) FROM (
    SELECT
      coalesce(m.state, r.state_u) AS state,
      coalesce(m.city, r.city, r.jurisdiction_name) AS city,
      coalesce(m.leads, 0) AS leads,
      m.avg_score,
      r.id AS rule_id,
      r.status,
      r.review_status,
      r.confidence,
      r.source_type,
      r.last_verified_at,
      r.agent_summary,
      r.summary,
      r.source_name,
      r.source_url,
      r.str_allowed,
      r.permit_required,
      r.license_required,
      r.primary_residence_required,
      r.night_cap,
      r.minimum_stay
    FROM lead_markets m
    FULL OUTER JOIN rules r ON r.state_u = m.state AND r.city_key = m.city_key
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_regulation_markets(TEXT) TO anon, authenticated;
