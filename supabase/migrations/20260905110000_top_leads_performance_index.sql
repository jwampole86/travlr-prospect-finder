-- Migration: Add partial index to speed up top leads dashboard query
-- This index supports the ORDER BY prospect_score DESC query with common filters

-- Drop existing index if it exists (idempotent)
DROP INDEX IF EXISTS public.idx_leads_top_leads_query;

-- Partial index: only real leads with a score, not synthetic, not terminal stage
-- Covers: neq(is_synthetic, true) + gt(prospect_score, 0) + order(prospect_score DESC)
CREATE INDEX IF NOT EXISTS idx_leads_top_leads_query
  ON public.leads (prospect_score DESC, state, stage)
  WHERE is_synthetic IS DISTINCT FROM true
    AND prospect_score > 0
    AND address IS NOT NULL
    AND address <> '';

-- Also ensure we have an index on (state, prospect_score) for portfolio-filtered queries
CREATE INDEX IF NOT EXISTS idx_leads_state_score
  ON public.leads (state, prospect_score DESC)
  WHERE is_synthetic IS DISTINCT FROM true
    AND prospect_score > 0;
