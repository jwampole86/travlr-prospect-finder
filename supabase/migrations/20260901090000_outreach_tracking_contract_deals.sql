-- Migration: Outreach Tracking logs + Contract/Deal fields on leads
-- Adds outreach_logs table for agent communication tracking
-- Adds contract fields to leads for Live stage deal capture

-- ─── outreach_logs table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES auth.users(id),
  agent_name text,
  comm_type text NOT NULL CHECK (comm_type IN ('call', 'text', 'email', 'other')),
  notes text,
  response_status text NOT NULL DEFAULT 'No Answer'
    CHECK (response_status IN ('No Answer', 'Interested', 'Not Interested', 'Follow-up Needed', 'Voicemail', 'Callback Requested', 'Wrong Number', 'Do Not Contact')),
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_logs_lead_id ON public.outreach_logs (lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_agent_id ON public.outreach_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_logged_at ON public.outreach_logs (logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_response_status ON public.outreach_logs (response_status);

-- RLS for outreach_logs
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_logs' AND policyname = 'outreach_logs_authenticated_select'
  ) THEN
    CREATE POLICY outreach_logs_authenticated_select ON public.outreach_logs
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_logs' AND policyname = 'outreach_logs_authenticated_insert'
  ) THEN
    CREATE POLICY outreach_logs_authenticated_insert ON public.outreach_logs
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_logs' AND policyname = 'outreach_logs_authenticated_update'
  ) THEN
    CREATE POLICY outreach_logs_authenticated_update ON public.outreach_logs
      FOR UPDATE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_logs' AND policyname = 'outreach_logs_authenticated_delete'
  ) THEN
    CREATE POLICY outreach_logs_authenticated_delete ON public.outreach_logs
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ─── Contract fields on leads ─────────────────────────────────────────────────
-- These fields capture the signed contract details when a lead moves to Live
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contract_date date,
  ADD COLUMN IF NOT EXISTS contract_terms text,
  ADD COLUMN IF NOT EXISTS contract_monthly_revenue numeric(12,2),
  ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS contract_signed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_contract_date ON public.leads (contract_date)
  WHERE contract_date IS NOT NULL;
