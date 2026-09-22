CREATE OR REPLACE FUNCTION public.get_stage_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(stage TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(l.stage::TEXT, 'Unknown'), count(*)::BIGINT
  FROM public.leads l
  WHERE p_state IS NULL OR p_state = 'all' OR l.state = p_state
  GROUP BY l.stage;
$$;

CREATE OR REPLACE FUNCTION public.get_regulation_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(regulation_status TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(l.regulation_status::TEXT, 'Unknown'), count(*)::BIGINT
  FROM public.leads l
  WHERE p_state IS NULL OR p_state = 'all' OR l.state = p_state
  GROUP BY l.regulation_status;
$$;

CREATE OR REPLACE FUNCTION public.get_canonical_avg_score(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'avg_score', coalesce(round(avg(l.prospect_score) FILTER (WHERE l.prospect_score > 0)), 0),
    'scored_count', count(*) FILTER (WHERE l.prospect_score > 0),
    'total_count', count(*)
  )
  FROM public.leads l
  WHERE p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_prospects', count(*),
    'active_leads', count(*) FILTER (WHERE l.address <> '' AND l.price > 0 AND l.beds > 0 AND l.stage NOT IN ('Not a Fit', 'Live') AND l.prospect_score > 0),
    'high_priority', count(*) FILTER (WHERE l.prospect_score >= 75 AND l.stage NOT IN ('Not a Fit', 'Live')),
    'fully_verified', count(*) FILTER (WHERE l.verified_owner IS TRUE AND l.verified_number IS TRUE AND coalesce(l.verified_address, '') NOT IN ('', 'false')),
    'verified_owner', count(*) FILTER (WHERE l.verified_owner IS TRUE),
    'verified_number', count(*) FILTER (WHERE l.verified_number IS TRUE),
    'phone_available', count(*) FILTER (WHERE coalesce(l.contact_phone, '') <> ''),
    'assigned_leads', count(*) FILTER (WHERE l.primary_agent_id IS NOT NULL),
    'unassigned_priority', count(*) FILTER (WHERE l.prospect_score >= 75 AND l.stage NOT IN ('Not a Fit', 'Live') AND l.primary_agent_id IS NULL),
    'action_needed', count(*) FILTER (WHERE l.prospect_score >= 75 AND l.stage = 'New Lead'),
    'active_pipeline', count(*) FILTER (WHERE l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')),
    'new_leads_30d', count(*) FILTER (WHERE l.stage = 'New Lead' AND l.created_at >= (now() - interval '30 days')::TEXT),
    'avg_score', coalesce(round(avg(l.prospect_score) FILTER (WHERE l.prospect_score > 0)), 0),
    'str_eligible', count(*) FILTER (WHERE l.regulation_status IN ('Allowed', 'Restricted')),
    'fully_allowed', count(*) FILTER (WHERE l.regulation_status = 'Allowed'),
    'regulation_friendly', count(*) FILTER (WHERE l.regulation_status IN ('Allowed', 'Restricted') AND l.address <> '' AND l.price > 0 AND l.beds > 0 AND l.stage <> 'Not a Fit'),
    'luxury_prospects', count(*) FILTER (WHERE l.luxury IS TRUE),
    'luxury_fully_verified', count(*) FILTER (WHERE l.luxury IS TRUE AND l.verified_owner IS TRUE AND l.verified_number IS TRUE AND coalesce(l.verified_address, '') NOT IN ('', 'false')),
    'luxury_verified_number', count(*) FILTER (WHERE l.luxury IS TRUE AND l.verified_number IS TRUE),
    'luxury_priority', count(*) FILTER (WHERE l.luxury IS TRUE AND (l.priority_tier = 1 OR l.prospect_score >= 75) AND l.stage NOT IN ('Not a Fit', 'Live')),
    'luxury_unassigned_priority', count(*) FILTER (WHERE l.luxury IS TRUE AND (l.priority_tier = 1 OR l.prospect_score >= 75) AND l.primary_agent_id IS NULL AND l.stage NOT IN ('Not a Fit', 'Live')),
    'active_portfolios', (SELECT count(DISTINCT pr.id) FROM public.portfolio_registry pr WHERE pr.is_active IS TRUE)
  )
  FROM public.leads l
  WHERE p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state;
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_regulation_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canonical_avg_score(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(TEXT) TO anon, authenticated;