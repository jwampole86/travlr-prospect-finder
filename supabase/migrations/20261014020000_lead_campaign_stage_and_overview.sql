-- Leads filtered by where they are in the text campaign, so the lead list can combine that with every other filter.
CREATE OR REPLACE FUNCTION public.leads_in_campaign_stage(p_stage TEXT)
RETURNS SETOF public.leads
LANGUAGE sql STABLE
AS $$
  SELECT l.* FROM public.leads l JOIN public.pipeline_board_leads b ON b.id = l.id WHERE b.board_stage = p_stage;
$$;
REVOKE ALL ON FUNCTION public.leads_in_campaign_stage(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leads_in_campaign_stage(TEXT) TO service_role;

-- One round trip of headline numbers for the Lead Management overview.
CREATE OR REPLACE FUNCTION public.lead_overview(p_state TEXT DEFAULT NULL, p_agent TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH x AS (
    SELECT v.board_stage AS stage, l.prospect_score AS score, (coalesce(l.contact_phone, '') <> '') AS phone, l.luxury, l.fully_verified AS verified,
           l.primary_agent_id AS agent, left(l.created_at, 10) AS created_day
    FROM public.pipeline_board_leads v JOIN public.leads l ON l.id = v.id
    WHERE (p_state IS NULL OR p_state IN ('', 'all', 'ALL') OR v.state = p_state)
      AND (p_agent IS NULL OR l.primary_agent_id::text = p_agent)
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'hot', count(*) FILTER (WHERE score >= 80),
    'withPhone', count(*) FILTER (WHERE phone),
    'readyToText', count(*) FILTER (WHERE stage = 'prospect' AND phone),
    'luxury', count(*) FILTER (WHERE luxury),
    'fullyVerified', count(*) FILTER (WHERE verified),
    'unassigned', count(*) FILTER (WHERE agent IS NULL),
    'newThisWeek', count(*) FILTER (WHERE created_day >= to_char(now() - interval '7 days', 'YYYY-MM-DD')),
    'stages', coalesce((SELECT jsonb_object_agg(s.stage, s.n) FROM (SELECT stage, count(*) AS n FROM x GROUP BY 1) s), '{}'::jsonb)
  ) FROM x;
$$;
REVOKE ALL ON FUNCTION public.lead_overview(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_overview(TEXT, TEXT) TO service_role;
