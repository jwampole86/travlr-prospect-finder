SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS public.dashboard_lead_facts (
  lead_id TEXT PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  state TEXT,
  stage TEXT NOT NULL DEFAULT 'New Lead',
  regulation_status TEXT NOT NULL DEFAULT 'Unknown',
  prospect_score INTEGER NOT NULL DEFAULT 0,
  has_address BOOLEAN NOT NULL DEFAULT false,
  has_price BOOLEAN NOT NULL DEFAULT false,
  has_beds BOOLEAN NOT NULL DEFAULT false,
  verified_owner BOOLEAN NOT NULL DEFAULT false,
  verified_address BOOLEAN NOT NULL DEFAULT false,
  verified_number BOOLEAN NOT NULL DEFAULT false,
  phone_available BOOLEAN NOT NULL DEFAULT false,
  assigned BOOLEAN NOT NULL DEFAULT false,
  luxury BOOLEAN NOT NULL DEFAULT false,
  priority_tier INTEGER NOT NULL DEFAULT 3,
  created_at_text TEXT
);

CREATE INDEX IF NOT EXISTS dashboard_lead_facts_state_idx ON public.dashboard_lead_facts(state);
CREATE INDEX IF NOT EXISTS dashboard_lead_facts_stage_idx ON public.dashboard_lead_facts(stage);
CREATE INDEX IF NOT EXISTS dashboard_lead_facts_regulation_idx ON public.dashboard_lead_facts(regulation_status);
CREATE INDEX IF NOT EXISTS dashboard_lead_facts_score_idx ON public.dashboard_lead_facts(prospect_score);

CREATE OR REPLACE FUNCTION public.sync_dashboard_lead_fact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dashboard_lead_facts (
    lead_id, state, stage, regulation_status, prospect_score,
    has_address, has_price, has_beds, verified_owner, verified_address,
    verified_number, phone_available, assigned, luxury, priority_tier,
    created_at_text
  ) VALUES (
    NEW.id, NEW.state, coalesce(NEW.stage::TEXT, 'New Lead'), coalesce(NEW.regulation_status::TEXT, 'Unknown'), coalesce(NEW.prospect_score, 0),
    coalesce(NEW.address, '') <> '', coalesce(NEW.price, 0) > 0, coalesce(NEW.beds, 0) > 0,
    NEW.verified_owner IS TRUE, coalesce(NEW.verified_address, '') NOT IN ('', 'false'), NEW.verified_number IS TRUE,
    coalesce(NEW.contact_phone, '') <> '', NEW.primary_agent_id IS NOT NULL, NEW.luxury IS TRUE, coalesce(NEW.priority_tier, 3),
    NEW.created_at
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    state = EXCLUDED.state, stage = EXCLUDED.stage, regulation_status = EXCLUDED.regulation_status,
    prospect_score = EXCLUDED.prospect_score, has_address = EXCLUDED.has_address,
    has_price = EXCLUDED.has_price, has_beds = EXCLUDED.has_beds,
    verified_owner = EXCLUDED.verified_owner, verified_address = EXCLUDED.verified_address,
    verified_number = EXCLUDED.verified_number, phone_available = EXCLUDED.phone_available,
    assigned = EXCLUDED.assigned, luxury = EXCLUDED.luxury,
    priority_tier = EXCLUDED.priority_tier, created_at_text = EXCLUDED.created_at_text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_dashboard_lead_fact_on_write ON public.leads;
CREATE TRIGGER sync_dashboard_lead_fact_on_write
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_dashboard_lead_fact();

INSERT INTO public.dashboard_lead_facts (
  lead_id, state, stage, regulation_status, prospect_score,
  has_address, has_price, has_beds, verified_owner, verified_address,
  verified_number, phone_available, assigned, luxury, priority_tier,
  created_at_text
)
SELECT
  id, state, coalesce(stage::TEXT, 'New Lead'), coalesce(regulation_status::TEXT, 'Unknown'), coalesce(prospect_score, 0),
  coalesce(address, '') <> '', coalesce(price, 0) > 0, coalesce(beds, 0) > 0,
  verified_owner IS TRUE, coalesce(verified_address, '') NOT IN ('', 'false'), verified_number IS TRUE,
  coalesce(contact_phone, '') <> '', primary_agent_id IS NOT NULL, luxury IS TRUE, coalesce(priority_tier, 3),
  created_at
FROM public.leads
ON CONFLICT (lead_id) DO UPDATE SET
  state = EXCLUDED.state, stage = EXCLUDED.stage, regulation_status = EXCLUDED.regulation_status,
  prospect_score = EXCLUDED.prospect_score, has_address = EXCLUDED.has_address,
  has_price = EXCLUDED.has_price, has_beds = EXCLUDED.has_beds,
  verified_owner = EXCLUDED.verified_owner, verified_address = EXCLUDED.verified_address,
  verified_number = EXCLUDED.verified_number, phone_available = EXCLUDED.phone_available,
  assigned = EXCLUDED.assigned, luxury = EXCLUDED.luxury,
  priority_tier = EXCLUDED.priority_tier, created_at_text = EXCLUDED.created_at_text;

CREATE OR REPLACE FUNCTION public.get_stage_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(stage TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT f.stage, count(*)::BIGINT FROM public.dashboard_lead_facts f
  WHERE p_state IS NULL OR p_state = 'all' OR f.state = p_state
  GROUP BY f.stage;
$$;

CREATE OR REPLACE FUNCTION public.get_regulation_breakdown(p_state TEXT DEFAULT NULL)
RETURNS TABLE(regulation_status TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT f.regulation_status, count(*)::BIGINT FROM public.dashboard_lead_facts f
  WHERE p_state IS NULL OR p_state = 'all' OR f.state = p_state
  GROUP BY f.regulation_status;
$$;

CREATE OR REPLACE FUNCTION public.get_canonical_avg_score(p_state TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'avg_score', coalesce(round(avg(f.prospect_score) FILTER (WHERE f.prospect_score > 0)), 0),
    'scored_count', count(*) FILTER (WHERE f.prospect_score > 0),
    'total_count', count(*)
  ) FROM public.dashboard_lead_facts f
  WHERE p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state;
$$;

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
    'action_needed', count(*) FILTER (WHERE f.prospect_score >= 75 AND f.stage = 'New Lead'),
    'active_pipeline', count(*) FILTER (WHERE f.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')),
    'new_leads_30d', count(*) FILTER (WHERE f.stage = 'New Lead' AND f.created_at_text >= (now() - interval '30 days')::TEXT),
    'avg_score', coalesce(round(avg(f.prospect_score) FILTER (WHERE f.prospect_score > 0)), 0),
    'str_eligible', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted')),
    'fully_allowed', count(*) FILTER (WHERE f.regulation_status = 'Allowed'),
    'regulation_friendly', count(*) FILTER (WHERE f.regulation_status IN ('Allowed', 'Restricted') AND f.has_address AND f.has_price AND f.has_beds AND f.stage <> 'Not a Fit'),
    'luxury_prospects', count(*) FILTER (WHERE f.luxury),
    'luxury_fully_verified', count(*) FILTER (WHERE f.luxury AND f.verified_owner AND f.verified_address AND f.verified_number),
    'luxury_verified_number', count(*) FILTER (WHERE f.luxury AND f.verified_number),
    'luxury_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND f.stage NOT IN ('Not a Fit', 'Live')),
    'luxury_unassigned_priority', count(*) FILTER (WHERE f.luxury AND (f.priority_tier = 1 OR f.prospect_score >= 75) AND NOT f.assigned AND f.stage NOT IN ('Not a Fit', 'Live')),
    'active_portfolios', (SELECT count(DISTINCT pr.id) FROM public.portfolio_registry pr WHERE pr.is_active IS TRUE)
  ) FROM public.dashboard_lead_facts f
  WHERE p_state IS NULL OR p_state = 'all' OR p_state = '' OR f.state = p_state;
$$;

ALTER TABLE public.dashboard_lead_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_dashboard_lead_facts" ON public.dashboard_lead_facts;
CREATE POLICY "authenticated_read_dashboard_lead_facts" ON public.dashboard_lead_facts FOR SELECT TO authenticated USING (true);

GRANT EXECUTE ON FUNCTION public.get_stage_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_regulation_breakdown(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canonical_avg_score(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(TEXT) TO anon, authenticated;
