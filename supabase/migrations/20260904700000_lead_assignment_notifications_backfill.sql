-- ============================================================
-- TRAVLR: Lead Assignment Notifications + Data Sync Backfill
-- ============================================================
-- 1. Add fully_verified derived column to leads
-- 2. Add unassigned_priority_count RPC
-- 3. Backfill fully_verified, priority, portfolio assignments
-- 4. Add lead_assignment_notifications table
-- 5. Add dashboard aggregate RPCs for live counts
-- ============================================================

-- ── 1. Add columns to leads ──────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fully_verified BOOLEAN GENERATED ALWAYS AS (
    (verified_owner = true) AND
    (verified_number = true) AND
    (verified_address IS NOT NULL AND verified_address != '' AND verified_address != 'false')
  ) STORED;

-- Add is_high_priority flag (derived from priority_tier or verification)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_high_priority BOOLEAN DEFAULT false;

-- Add primary_agent_name if missing
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primary_agent_name TEXT;

-- ── 2. Lead assignment notifications table ───────────────────
CREATE TABLE IF NOT EXISTS public.lead_assignment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  agent_id UUID,
  agent_name TEXT,
  agent_email TEXT,
  assigned_by UUID,
  assigned_by_name TEXT,
  prospect_name TEXT,
  prospect_phone TEXT,
  prospect_address TEXT,
  priority_tier INTEGER,
  priority_label TEXT,
  revenue_opportunity NUMERIC,
  notification_sent_at TIMESTAMPTZ DEFAULT now(),
  email_sent BOOLEAN DEFAULT false,
  in_app_sent BOOLEAN DEFAULT false,
  email_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lead_assignment_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_users_lead_assignment_notifications" ON public.lead_assignment_notifications;
CREATE POLICY "auth_users_lead_assignment_notifications"
  ON public.lead_assignment_notifications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lan_lead_id ON public.lead_assignment_notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lan_agent_id ON public.lead_assignment_notifications(agent_id);
CREATE INDEX IF NOT EXISTS idx_lan_created_at ON public.lead_assignment_notifications(created_at DESC);

-- ── 3. Dashboard aggregate RPCs ──────────────────────────────

-- Total prospects (live count)
CREATE OR REPLACE FUNCTION public.get_total_prospects(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (p_state = 'all' OR state = p_state);
$$;

-- Priority leads (high priority)
CREATE OR REPLACE FUNCTION public.get_priority_leads_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (is_high_priority = true OR priority_tier >= 3 OR prospect_score >= 75)
    AND stage NOT IN ('Not a Fit', 'closed_won', 'closed_dead')
    AND (p_state = 'all' OR state = p_state);
$$;

-- Fully verified leads count
CREATE OR REPLACE FUNCTION public.get_fully_verified_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND verified_owner = true
    AND verified_number = true
    AND verified_address IS NOT NULL
    AND verified_address != ''
    AND verified_address != 'false'
    AND (p_state = 'all' OR state = p_state);
$$;

-- Unassigned priority leads
CREATE OR REPLACE FUNCTION public.get_unassigned_priority_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (is_high_priority = true OR priority_tier >= 3 OR prospect_score >= 75)
    AND verified_owner = true
    AND verified_number = true
    AND verified_address IS NOT NULL
    AND verified_address != ''
    AND verified_address != 'false'
    AND primary_agent_id IS NULL
    AND stage NOT IN ('Not a Fit', 'closed_won', 'closed_dead')
    AND (p_state = 'all' OR state = p_state);
$$;

-- Assigned leads count
CREATE OR REPLACE FUNCTION public.get_assigned_leads_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND primary_agent_id IS NOT NULL
    AND (p_state = 'all' OR state = p_state);
$$;

-- Verified owner count
CREATE OR REPLACE FUNCTION public.get_verified_owner_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND verified_owner = true
    AND (p_state = 'all' OR state = p_state);
$$;

-- Verified number count
CREATE OR REPLACE FUNCTION public.get_verified_number_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND verified_number = true
    AND (p_state = 'all' OR state = p_state);
$$;

-- Phone available count
CREATE OR REPLACE FUNCTION public.get_phone_available_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND has_phone = true
    AND (p_state = 'all' OR state = p_state);
$$;

-- New leads (created in last 30 days)
CREATE OR REPLACE FUNCTION public.get_new_leads_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND created_at::timestamptz >= now() - INTERVAL '30 days'
    AND (p_state = 'all' OR state = p_state);
$$;

-- Portfolio breakdown with live counts
CREATE OR REPLACE FUNCTION public.get_portfolio_breakdown(p_state TEXT DEFAULT 'all')
RETURNS TABLE(
  portfolio_id TEXT,
  portfolio_name TEXT,
  state_code TEXT,
  total_prospects BIGINT,
  priority_count BIGINT,
  fully_verified_count BIGINT,
  assigned_count BIGINT,
  unassigned_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pr.id::TEXT AS portfolio_id,
    COALESCE(pr.portfolio_label, pr.state_name, pr.state_code) AS portfolio_name,
    pr.state_code,
    COUNT(l.id)::BIGINT AS total_prospects,
    COUNT(l.id) FILTER (WHERE l.is_high_priority = true OR l.priority_tier >= 3 OR l.prospect_score >= 75)::BIGINT AS priority_count,
    COUNT(l.id) FILTER (WHERE l.verified_owner = true AND l.verified_number = true AND l.verified_address IS NOT NULL AND l.verified_address != '' AND l.verified_address != 'false')::BIGINT AS fully_verified_count,
    COUNT(l.id) FILTER (WHERE l.primary_agent_id IS NOT NULL)::BIGINT AS assigned_count,
    COUNT(l.id) FILTER (WHERE l.primary_agent_id IS NULL)::BIGINT AS unassigned_count
  FROM public.portfolio_registry pr
  LEFT JOIN public.leads l ON l.state = pr.state_code AND l.is_synthetic IS NOT TRUE
  WHERE pr.is_active = true
    AND (p_state = 'all' OR pr.state_code = p_state)
  GROUP BY pr.id, pr.portfolio_label, pr.state_name, pr.state_code
  ORDER BY total_prospects DESC;
$$;

-- Source breakdown
CREATE OR REPLACE FUNCTION public.get_source_breakdown(p_state TEXT DEFAULT 'all')
RETURNS TABLE(
  source TEXT,
  total BIGINT,
  new_count BIGINT,
  fully_verified_count BIGINT,
  priority_count BIGINT,
  assigned_count BIGINT,
  unassigned_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(source, 'Other') AS source,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE created_at::timestamptz >= now() - INTERVAL '30 days')::BIGINT AS new_count,
    COUNT(*) FILTER (WHERE verified_owner = true AND verified_number = true AND verified_address IS NOT NULL AND verified_address != '' AND verified_address != 'false')::BIGINT AS fully_verified_count,
    COUNT(*) FILTER (WHERE is_high_priority = true OR priority_tier >= 3 OR prospect_score >= 75)::BIGINT AS priority_count,
    COUNT(*) FILTER (WHERE primary_agent_id IS NOT NULL)::BIGINT AS assigned_count,
    COUNT(*) FILTER (WHERE primary_agent_id IS NULL)::BIGINT AS unassigned_count
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (p_state = 'all' OR state = p_state)
  GROUP BY source
  ORDER BY total DESC;
$$;

-- ── 4. Backfill is_high_priority ────────────────────────────
UPDATE public.leads
SET is_high_priority = true
WHERE is_synthetic IS NOT TRUE
  AND verified_owner = true
  AND verified_number = true
  AND verified_address IS NOT NULL
  AND verified_address != ''
  AND verified_address != 'false'
  AND stage NOT IN ('Not a Fit', 'closed_won', 'closed_dead')
  AND is_high_priority IS NOT TRUE;

-- Also mark high priority by score
UPDATE public.leads
SET is_high_priority = true
WHERE is_synthetic IS NOT TRUE
  AND prospect_score >= 80
  AND stage NOT IN ('Not a Fit', 'closed_won', 'closed_dead')
  AND is_high_priority IS NOT TRUE;

-- ── 5. Backfill portfolio assignments ───────────────────────
UPDATE public.leads l
SET
  portfolio_id = pr.id,
  portfolio_name = COALESCE(pr.portfolio_label, pr.state_name, pr.state_code)
FROM public.portfolio_registry pr
WHERE pr.state_code = l.state
  AND pr.is_active = true
  AND (l.portfolio_id IS NULL OR l.portfolio_id = '')
  AND l.state IS NOT NULL
  AND l.state != '';

-- ── 6. Indexes for performance ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_verified_owner ON public.leads(verified_owner) WHERE verified_owner = true;
CREATE INDEX IF NOT EXISTS idx_leads_verified_number ON public.leads(verified_number) WHERE verified_number = true;
CREATE INDEX IF NOT EXISTS idx_leads_is_high_priority ON public.leads(is_high_priority) WHERE is_high_priority = true;
CREATE INDEX IF NOT EXISTS idx_leads_primary_agent_id ON public.leads(primary_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_state_synthetic ON public.leads(state, is_synthetic);
CREATE INDEX IF NOT EXISTS idx_leads_created_at_synthetic ON public.leads(created_at DESC) WHERE is_synthetic IS NOT TRUE;
