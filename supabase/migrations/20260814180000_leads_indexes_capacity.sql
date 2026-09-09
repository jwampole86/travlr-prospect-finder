-- ============================================================
-- Migration: leads indexes + capacity tracking
-- Timestamp: 20260814180000
-- Purpose:
--   1. Add indexes on commonly filtered leads columns so query
--      performance stays fast at 25k–50k+ rows.
--   2. Create a lightweight capacity_report view that surfaces
--      current row counts and a configurable soft-cap so the
--      admin UI can show an 80% warning without any hardcoded
--      limit in application code.
-- ============================================================

-- ─── 1. Indexes on leads (all idempotent) ────────────────────

-- Portfolio / state filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_leads_state
  ON public.leads (state);

-- Stage filtering (pipeline, kanban, lead management)
CREATE INDEX IF NOT EXISTS idx_leads_stage
  ON public.leads (stage);

-- Prospect score (sorting, action-needed queries)
CREATE INDEX IF NOT EXISTS idx_leads_prospect_score
  ON public.leads (prospect_score DESC);

-- Source filtering
CREATE INDEX IF NOT EXISTS idx_leads_source
  ON public.leads (source);

-- Created-at ordering (default sort in getAll())
CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON public.leads (created_at DESC);

-- Composite: state + stage (portfolio-scoped pipeline queries)
CREATE INDEX IF NOT EXISTS idx_leads_state_stage
  ON public.leads (state, stage);

-- Composite: state + prospect_score (portfolio-scoped scoring)
CREATE INDEX IF NOT EXISTS idx_leads_state_score
  ON public.leads (state, prospect_score DESC);

-- User ownership (RLS + agent-scoped queries)
CREATE INDEX IF NOT EXISTS idx_leads_user_id
  ON public.leads (user_id);

-- ─── 2. Capacity config table ────────────────────────────────
-- Stores the admin-configurable soft cap and plan metadata.
-- The app reads this to show the capacity bar and 80% alert.
-- There is no hard enforcement here — this is informational only.

CREATE TABLE IF NOT EXISTS public.capacity_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supabase Free tier: unlimited rows, 500 MB database storage.
  -- Pro tier: unlimited rows, 8 GB storage.
  -- Setting soft_cap to 0 means "no cap enforced".
  soft_cap        INTEGER NOT NULL DEFAULT 0,
  -- Human-readable plan description shown in the admin UI
  plan_label      TEXT NOT NULL DEFAULT 'Supabase Free — unlimited rows, 500 MB storage',
  -- Optional: next tier description for upgrade prompt
  next_tier_label TEXT DEFAULT 'Supabase Pro — unlimited rows, 8 GB storage (~$25/month)',
  -- Alert threshold as a fraction (0.8 = 80%)
  alert_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.capacity_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_capacity_config" ON public.capacity_config;
CREATE POLICY "admins_manage_capacity_config"
  ON public.capacity_config
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed one row (idempotent)
INSERT INTO public.capacity_config (id, soft_cap, plan_label, next_tier_label, alert_threshold)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  0,
  'Supabase Free — unlimited rows, 500 MB database storage',
  'Supabase Pro — unlimited rows, 8 GB storage (~$25/month)',
  0.80
)
ON CONFLICT (id) DO UPDATE
  SET plan_label      = EXCLUDED.plan_label,
      next_tier_label = EXCLUDED.next_tier_label,
      alert_threshold = EXCLUDED.alert_threshold,
      updated_at      = now();
