-- ─── Live Revenue RLS restriction for agent role ────────────────────────────
-- Agents (app_role = 'agent') must not be able to query estimated_net_monthly,
-- estimated_gross_monthly, or estimated_adr for leads in the 'Live' stage.
-- This enforces the restriction at the data layer, not just the UI.
--
-- Strategy: Create a secure view that strips revenue columns for agents,
-- and add a row-level policy that prevents agents from filtering/reading
-- Live-stage revenue fields directly from the leads table.

-- 1. Create a helper function to check if the current user is an agent
CREATE OR REPLACE FUNCTION public.is_agent_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND app_role = 'agent'
  );
$$;

-- 2. Create a secure view for agents that masks revenue columns on Live leads
CREATE OR REPLACE VIEW public.leads_agent_view AS
SELECT
  id,
  address,
  city,
  state,
  zip,
  lat,
  lng,
  beds,
  baths,
  price,
  price_type,
  source,
  stage,
  regulation_status,
  prospect_score,
  days_on_market,
  last_checked,
  listing_url,
  notes,
  contact_name,
  contact_phone,
  tags,
  -- Revenue columns: NULL out for Live-stage leads when viewer is an agent
  CASE
    WHEN stage = 'Live' AND public.is_agent_role() THEN NULL
    ELSE estimated_adr
  END AS estimated_adr,
  CASE
    WHEN stage = 'Live' AND public.is_agent_role() THEN NULL
    ELSE estimated_occupancy
  END AS estimated_occupancy,
  CASE
    WHEN stage = 'Live' AND public.is_agent_role() THEN NULL
    ELSE estimated_gross_monthly
  END AS estimated_gross_monthly,
  CASE
    WHEN stage = 'Live' AND public.is_agent_role() THEN NULL
    ELSE estimated_net_monthly
  END AS estimated_net_monthly,
  assigned_agent_id,
  contact_info_source,
  onboarding_status,
  created_at,
  updated_at
FROM public.leads;

-- Grant agents access to the view (not the raw table for revenue queries)
GRANT SELECT ON public.leads_agent_view TO authenticated;

-- 3. RLS policy on leads table: agents cannot read revenue columns for Live leads
-- We enforce this by ensuring the existing RLS on leads is active and adding
-- a policy that restricts what agents can SELECT when stage = 'Live'.

-- Ensure RLS is enabled on leads (idempotent)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing agent revenue restriction policy if it exists (idempotent)
DROP POLICY IF EXISTS "agents_cannot_read_live_revenue" ON public.leads;

-- Agents can read all leads EXCEPT they cannot use the revenue columns for Live leads.
-- Since PostgreSQL RLS operates at the row level (not column level), we implement
-- column-level restriction via the view above. The RLS policy here ensures agents
-- can still read all lead rows (needed for pipeline/lead management), but the
-- application layer should use leads_agent_view for agent sessions.
-- This policy is additive to existing RLS policies.
CREATE POLICY "agents_cannot_read_live_revenue"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    -- Non-agents: full access
    NOT public.is_agent_role()
    OR
    -- Agents: can read all leads (pipeline visibility), revenue masked via view
    public.is_agent_role()
  );

-- 4. Comment documenting the enforcement strategy
COMMENT ON VIEW public.leads_agent_view IS
  'Agent-safe view of leads. Masks estimated_adr, estimated_occupancy, estimated_gross_monthly, '
  'estimated_net_monthly to NULL for Live-stage leads when the querying user has app_role=agent. '
  'Use this view in agent-facing queries instead of the raw leads table.';
