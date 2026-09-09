-- Migration: KPI Monitor Alerts + Teleprompter Session Enhancements
-- Adds kpi_monitor_alerts table for tracking Dashboard KPI divergences
-- and ensures teleprompter_sessions table has the needed fields

-- ── KPI Monitor Alerts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kpi_monitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  portfolio_state TEXT,
  metric TEXT NOT NULL,
  displayed_value INTEGER NOT NULL,
  canonical_value INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  tolerance INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'critical')),
  definition TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_monitor_alerts_checked_at ON public.kpi_monitor_alerts(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_monitor_alerts_status ON public.kpi_monitor_alerts(status);
CREATE INDEX IF NOT EXISTS idx_kpi_monitor_alerts_metric ON public.kpi_monitor_alerts(metric);

ALTER TABLE public.kpi_monitor_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_kpi_monitor_alerts" ON public.kpi_monitor_alerts;
CREATE POLICY "admin_manage_kpi_monitor_alerts"
ON public.kpi_monitor_alerts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.app_role IN ('admin', 'owner', 'operator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.app_role IN ('admin', 'owner', 'operator')
  )
);

-- ── Teleprompter Session Enhancements ─────────────────────────────────────────
-- Ensure call_notes column exists on teleprompter_sessions if table exists

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'teleprompter_sessions'
  ) THEN
    ALTER TABLE public.teleprompter_sessions
    ADD COLUMN IF NOT EXISTS call_notes TEXT,
    ADD COLUMN IF NOT EXISTS covered_line_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS active_section_idx INTEGER DEFAULT 0;
  END IF;
END $$;

-- ── Outreach Calls: ensure disposition_notes column exists ────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'outreach_calls'
  ) THEN
    ALTER TABLE public.outreach_calls
    ADD COLUMN IF NOT EXISTS disposition_notes TEXT,
    ADD COLUMN IF NOT EXISTS script_id TEXT;
  END IF;
END $$;
