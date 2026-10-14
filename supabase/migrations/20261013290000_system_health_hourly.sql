-- Per service per hour for the last p_hours, so the status page can draw a 24-hour heat map from one small query.
CREATE OR REPLACE FUNCTION public.system_health_hourly(p_hours INTEGER)
RETURNS TABLE (service TEXT, hour TIMESTAMPTZ, checks BIGINT, degraded BIGINT, outage BIGINT, avg_ms NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.service,
         date_trunc('hour', c.checked_at),
         count(*),
         count(*) FILTER (WHERE c.status = 'degraded'),
         count(*) FILTER (WHERE c.status = 'outage'),
         round(avg(c.response_ms) FILTER (WHERE c.response_ms IS NOT NULL))
  FROM public.system_health_checks c
  WHERE c.checked_at > now() - make_interval(hours => p_hours) AND c.status <> 'maintenance'
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.system_health_hourly(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_health_hourly(INTEGER) TO service_role;
