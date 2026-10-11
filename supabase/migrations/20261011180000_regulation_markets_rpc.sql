-- Markets for the dashboard "STR Regulations" panel: every city that has real (non-synthetic) leads, joined to the canonical
-- city_regulations record when one exists, plus rule-only cities with no leads yet. state = 'all' returns every market.
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
