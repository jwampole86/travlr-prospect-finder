-- Rules that need permit detail researched, biggest markets (by real leads) first. Rules where a permit, licence, registration or
-- inspection is involved, with no detail yet (or an earlier attempt found nothing citable more than 30 days ago).
CREATE OR REPLACE FUNCTION public.get_permit_details_queue(p_limit INTEGER DEFAULT 5)
RETURNS TABLE(rule_id UUID, city TEXT, state TEXT, lead_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout = '60s'
AS $$
  WITH lc AS (
    SELECT upper(btrim(state)) st, lower(btrim(city)) ck, count(*) n
    FROM public.leads WHERE is_synthetic IS NOT TRUE AND coalesce(btrim(city), '') <> ''
    GROUP BY 1, 2
  )
  SELECT r.id, r.city, upper(btrim(r.state)), coalesce(lc.n, 0)::BIGINT
  FROM public.city_regulations r
  LEFT JOIN lc ON lc.st = upper(btrim(r.state)) AND lc.ck = lower(btrim(r.city))
  WHERE r.city IS NOT NULL
    AND r.status IN ('ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED', 'RESTRICTED', 'PRIMARY_RESIDENCE_REQUIRED', 'ALLOWED')
    AND (r.permit_required IS TRUE OR r.license_required IS TRUE OR r.registration_required IS TRUE OR r.inspection_required IS TRUE
         OR r.status IN ('ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED', 'PRIMARY_RESIDENCE_REQUIRED'))
    AND (r.permit_details_updated_at IS NULL
         OR (r.permit_steps IS NULL AND r.permit_cost_summary IS NULL AND r.permit_details_updated_at < now() - INTERVAL '30 days'))
  ORDER BY coalesce(lc.n, 0) DESC, r.city
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_permit_details_queue(INTEGER) TO service_role;
