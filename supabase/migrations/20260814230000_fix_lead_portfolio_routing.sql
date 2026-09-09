-- Migration: Fix lead portfolio routing and add per-portfolio cap tracking
-- Timestamp: 20260814230000
-- Purpose:
--   1. Fix leads that were incorrectly assigned to CO due to placeholder address fallback bug
--   2. Add portfolio_cap_warnings view for per-portfolio lead count vs cap
--   3. Add index on leads.state for fast portfolio-scoped queries

-- ─── 1. Fix misrouted leads: update state/city for leads whose city belongs to a different state ───

DO $$
BEGIN
  -- Fix leads where city is in CA but state is CO (common misrouting from placeholder fallback)
  UPDATE public.leads
  SET state = 'CA', zip = COALESCE(NULLIF(zip, ''), '90028')
  WHERE state = 'CO'
    AND city IN ('Los Angeles', 'Sherman Oaks', 'Hollywood', 'Malibu', 'Newport Beach', 'West Hollywood');

  -- Fix leads where city is in NV but state is CO
  UPDATE public.leads
  SET state = 'NV', zip = COALESCE(NULLIF(zip, ''), '89101')
  WHERE state = 'CO'
    AND city IN ('Las Vegas', 'Henderson');

  -- Fix leads where city is in WA but state is CO
  UPDATE public.leads
  SET state = 'WA', zip = COALESCE(NULLIF(zip, ''), '98101')
  WHERE state = 'CO'
    AND city IN ('Seattle', 'Bellevue', 'Renton');

  -- Fix leads where city is in TX but state is CO
  UPDATE public.leads
  SET state = 'TX', zip = COALESCE(NULLIF(zip, ''), '75201')
  WHERE state = 'CO'
    AND city IN ('Dallas', 'Houston');

  -- Fix leads where city is in FL but state is CO
  UPDATE public.leads
  SET state = 'FL', zip = COALESCE(NULLIF(zip, ''), '33101')
  WHERE state = 'CO'
    AND city IN ('Miami', 'Miami Beach');

  -- Fix leads where city is in UT but state is CO
  UPDATE public.leads
  SET state = 'UT', zip = COALESCE(NULLIF(zip, ''), '84101')
  WHERE state = 'CO'
    AND city IN ('Salt Lake City', 'Park City');

  -- Fix leads where city is in ME but state is CO
  UPDATE public.leads
  SET state = 'ME', zip = COALESCE(NULLIF(zip, ''), '04101')
  WHERE state = 'CO'
    AND city IN ('Portland')
    AND zip LIKE '04%';

  -- Fix leads where city is in OR but state is CO
  UPDATE public.leads
  SET state = 'OR', zip = COALESCE(NULLIF(zip, ''), '97201')
  WHERE state = 'CO'
    AND city = 'Portland'
    AND (zip LIKE '97%' OR zip = '00000');

  -- Fix leads where city is in MA but state is CO
  UPDATE public.leads
  SET state = 'MA', zip = COALESCE(NULLIF(zip, ''), '02101')
  WHERE state = 'CO'
    AND city IN ('Boston', 'Cambridge', 'Somerville');

  RAISE NOTICE 'Lead state correction complete.';
END $$;

-- ─── 2. Add index on state for fast portfolio-scoped queries ─────────────────

CREATE INDEX IF NOT EXISTS idx_leads_state ON public.leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_state_stage ON public.leads(state, stage);
CREATE INDEX IF NOT EXISTS idx_leads_state_score ON public.leads(state, prospect_score);

-- ─── 3. Create portfolio_lead_counts view for cap monitoring ─────────────────

CREATE OR REPLACE VIEW public.portfolio_lead_counts AS
SELECT
  state,
  COUNT(*) AS lead_count,
  1000 AS cap,
  CASE WHEN COUNT(*) >= 1000 THEN true ELSE false END AS at_cap,
  CASE WHEN COUNT(*) >= 900 THEN true ELSE false END AS near_cap
FROM public.leads
WHERE state IN ('CO', 'CA', 'NV', 'WA', 'TX', 'FL', 'UT', 'ME', 'OR', 'MA')
GROUP BY state;
