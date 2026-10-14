-- One row per service per check, written by the system-health cron. Only the service role reads or writes it.
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  service     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'outage', 'maintenance')),
  response_ms INTEGER,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS system_health_checks_service_time_idx ON public.system_health_checks (service, checked_at DESC);
CREATE INDEX IF NOT EXISTS system_health_checks_time_idx ON public.system_health_checks (checked_at DESC);
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

-- Per service per Mountain-time day, so a 90-day uptime bar needs one small query.
CREATE OR REPLACE FUNCTION public.system_health_daily(p_days INTEGER)
RETURNS TABLE (service TEXT, day DATE, checks BIGINT, ok BIGINT, degraded BIGINT, outage BIGINT, avg_ms NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.service,
         (c.checked_at AT TIME ZONE 'America/Denver')::date,
         count(*),
         count(*) FILTER (WHERE c.status = 'operational'),
         count(*) FILTER (WHERE c.status = 'degraded'),
         count(*) FILTER (WHERE c.status = 'outage'),
         round(avg(c.response_ms) FILTER (WHERE c.response_ms IS NOT NULL))
  FROM public.system_health_checks c
  WHERE c.checked_at > now() - make_interval(days => p_days) AND c.status <> 'maintenance'
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.system_health_daily(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_health_daily(INTEGER) TO service_role;
