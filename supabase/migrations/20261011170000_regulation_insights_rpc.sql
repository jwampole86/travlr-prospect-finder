-- Per-status, per-state metrics for the dashboard Regulation Status chart (non-synthetic leads only).
-- action_needed mirrors the dashboard definition: score >= 70 AND stage = 'New Lead'.
CREATE OR REPLACE FUNCTION public.get_regulation_insights(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT
      f.regulation_status AS status,
      f.state,
      count(*)::INT AS count,
      round(avg(f.prospect_score))::INT AS avg_score,
      (count(*) FILTER (WHERE f.prospect_score >= 70 AND f.stage = 'New Lead'))::INT AS action_needed,
      (count(*) FILTER (WHERE f.luxury))::INT AS luxury,
      (count(*) FILTER (WHERE f.phone_available))::INT AS phone
    FROM public.dashboard_lead_facts f
    WHERE NOT f.is_synthetic
      AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state)
    GROUP BY f.regulation_status, f.state
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_regulation_insights(TEXT) TO anon, authenticated;
