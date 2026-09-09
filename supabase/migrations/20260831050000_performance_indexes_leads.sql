-- Performance indexes for leads table
-- Optimizes: Top Scored Leads query, lead-by-id lookup, portfolio filtering, stage filtering

-- Index on prospect_score DESC for top-leads queries (ORDER BY prospect_score DESC LIMIT N)
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score_desc
  ON public.leads (prospect_score DESC)
  WHERE stage != 'Not a Fit';

-- Index on state for portfolio filtering (WHERE state = $1)
CREATE INDEX IF NOT EXISTS idx_leads_state
  ON public.leads (state);

-- Composite index for dashboard KPI queries (stage + state)
CREATE INDEX IF NOT EXISTS idx_leads_stage_state
  ON public.leads (stage, state);

-- Index for single-lead lookup by id (already PK, but ensure it exists)
-- (Primary key index is automatic — this is a no-op safety guard)

-- Index on created_at DESC for default sort in getAll()
CREATE INDEX IF NOT EXISTS idx_leads_created_at_desc
  ON public.leads (created_at DESC);

-- Composite index for deduplication queries (address + price)
CREATE INDEX IF NOT EXISTS idx_leads_address_price
  ON public.leads (lower(address), price);
