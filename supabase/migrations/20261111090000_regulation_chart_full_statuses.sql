-- The dashboard Regulation Status chart only showed Allowed / Restricted / Prohibited because
-- leads.regulation_status (and dashboard_lead_facts) collapse the canonical statuses.
-- Refine from city_regulations so Permit Required, Primary Residence Required and Review Required show up too.
-- Allowed-with-requirements and Restricted rules keep their existing Allowed / Restricted buckets, and Prohibited is never overridden.

CREATE OR REPLACE VIEW public.dashboard_lead_regulation_facts AS
WITH rules AS (
  SELECT st, ct, status FROM (
    SELECT DISTINCT ON (lower(btrim(r.state)), lower(btrim(r.city)))
      lower(btrim(r.state)) AS st, lower(btrim(r.city)) AS ct, r.status
    FROM public.city_regulations r
    WHERE r.city IS NOT NULL AND btrim(r.city) <> '' AND r.status <> 'UNKNOWN'
    ORDER BY lower(btrim(r.state)), lower(btrim(r.city)), r.updated_at DESC
  ) s
  WHERE s.status IN ('PERMIT_REQUIRED', 'PRIMARY_RESIDENCE_REQUIRED', 'REVIEW_REQUIRED')
)
SELECT
  f.*,
  CASE
    WHEN f.regulation_status IN ('Allowed', 'Restricted', 'Unknown') AND rules.status IS NOT NULL THEN
      CASE rules.status
        WHEN 'PERMIT_REQUIRED' THEN 'Permit Required'
        WHEN 'PRIMARY_RESIDENCE_REQUIRED' THEN 'Primary Residence Required'
        ELSE 'Review Required'
      END
    ELSE f.regulation_status
  END AS regulation_label
FROM public.dashboard_lead_facts f
LEFT JOIN public.leads l ON l.id = f.lead_id
LEFT JOIN rules ON rules.st = lower(btrim(l.state)) AND rules.ct = lower(btrim(l.city));

CREATE OR REPLACE FUNCTION public.get_regulation_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(regulation_status TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT f.regulation_label, count(*)::BIGINT FROM public.dashboard_lead_regulation_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR f.state = p_state)
  GROUP BY f.regulation_label;
$$;

CREATE OR REPLACE FUNCTION public.get_regulation_insights(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT
      f.regulation_label AS status,
      f.state,
      count(*)::INT AS count,
      round(avg(f.prospect_score))::INT AS avg_score,
      (count(*) FILTER (WHERE f.prospect_score >= 70 AND f.stage = 'New Lead'))::INT AS action_needed,
      (count(*) FILTER (WHERE f.luxury))::INT AS luxury,
      (count(*) FILTER (WHERE f.phone_available))::INT AS phone
    FROM public.dashboard_lead_regulation_facts f
    WHERE NOT f.is_synthetic
      AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state)
    GROUP BY f.regulation_label, f.state
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_regulation_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_regulation_insights(TEXT) TO anon, authenticated;

-- Only the SECURITY DEFINER RPCs above should read it.
REVOKE ALL ON public.dashboard_lead_regulation_facts FROM anon, authenticated;
