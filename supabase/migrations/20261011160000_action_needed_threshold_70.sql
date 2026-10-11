-- Action Needed threshold 75 -> 70 (New Lead stage). High Priority and Unassigned Priority stay at 75.
-- The calibrated score model tops out near 72 for real leads, so 75 left Action Needed at 1.
-- Both the dashboard summary and the KPI Monitor's canonical counts must agree or the monitor flags a mismatch.
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_prospects', count(*),
    'active_leads', count(*) FILTER (WHERE f.has_address AND f.has_price AND f.has_beds AND f.stage NOT IN ('Not a Fit', 'Live') AND f.prospect_score > 0),
    'high_priority', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage NOT IN ('Not a Fit', 'Live')),
    'fully_verified', count(*) FILTER (WHERE f.verified_owner AND f.verified_address AND f.verified_number),
    'verified_owner', count(*) FILTER (WHERE f.verified_owner),
    'verified_number', count(*) FILTER (WHERE f.verified_number),
    'phone_available', count(*) FILTER (WHERE f.phone_available),
    'assigned_leads', count(*) FILTER (WHERE f.assigned),
    'unassigned_priority', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage NOT IN ('Not a Fit', 'Live') AND NOT f.assigned),
    'action_needed', count(*) FILTER (WHERE f.prospect_score >= 70 AND f.stage = 'New Lead'),
    'active_pipeline', count(*) FILTER (WHERE f.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')),
    'new_leads_30d', count(*) FILTER (WHERE f.stage = 'New Lead' AND f.created_at_text >= (now() - interval '30 days')::TEXT),
    'avg_score', coalesce(round(avg(f.prospect_score) FILTER (WHERE f.prospect_score > 0)), 0),
    'str_eligible', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted')),
    'fully_allowed', count(*) FILTER (WHERE f.regulation_status = 'Allowed'),
    'regulation_friendly', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted') AND f.has_address AND f.has_price AND f.has_beds AND f.stage <> 'Not a Fit'),
    'luxury_prospects', count(*) FILTER (WHERE f.luxury),
    'luxury_fully_verified', count(*) FILTER (WHERE f.luxury AND f.verified_owner AND f.verified_address AND f.verified_number),
    'luxury_verified_number', count(*) FILTER (WHERE f.luxury AND f.verified_number),
    'luxury_phone_available', count(*) FILTER (WHERE f.luxury AND f.phone_available),
    'luxury_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND f.stage NOT IN ('Not a Fit', 'Live')),
    'luxury_unassigned_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND NOT f.assigned AND f.stage NOT IN ('Not a Fit', 'Live')),
    'active_portfolios', (SELECT count(DISTINCT pr.id) FROM public.portfolio_registry pr WHERE pr.is_active IS TRUE)
  ) FROM public.dashboard_lead_facts f
  WHERE NOT f.is_synthetic
    AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_canonical_kpi_counts(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_leads',
    COUNT(DISTINCT CASE
      WHEN (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'high_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'action_needed',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 70
        AND l.stage = 'New Lead'
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'fully_verified',
    COUNT(DISTINCT CASE
      WHEN l.verified_owner IS TRUE
        AND (l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_address <> 'false')
        AND l.verified_number IS TRUE
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'phone_available',
    COUNT(DISTINCT CASE
      WHEN l.contact_phone IS NOT NULL AND l.contact_phone <> ''
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'unassigned_priority',
    COUNT(DISTINCT CASE
      WHEN l.prospect_score >= 75
        AND l.stage NOT IN ('Not a Fit', 'Live')
        AND l.primary_agent_id IS NULL
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'assigned',
    COUNT(DISTINCT CASE
      WHEN l.primary_agent_id IS NOT NULL
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'active_pipeline',
    COUNT(DISTINCT CASE
      WHEN l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END),

    'str_eligible',
    COUNT(DISTINCT CASE
      WHEN l.regulation_status IN ('Allowed', 'Restricted')
        AND (p_state IS NULL OR p_state = 'all' OR p_state = '' OR l.state = p_state)
      THEN l.id END)
  )
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_kpi_counts(TEXT) TO anon, authenticated;
