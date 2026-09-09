-- Migration: Add deal_closed and deal_revenue fields to leads table
-- Also adds a closed_deals log table for revenue tracking

-- Add deal tracking columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deal_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deal_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deal_revenue numeric(12,2),
  ADD COLUMN IF NOT EXISTS deal_notes text;

-- Create index for fast portfolio close-rate queries
CREATE INDEX IF NOT EXISTS idx_leads_deal_closed ON public.leads (deal_closed, state)
  WHERE deal_closed = true;

-- Closed deals log table for revenue history
CREATE TABLE IF NOT EXISTS public.closed_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  state text,
  portfolio_key text,
  revenue numeric(12,2),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closed_deals_lead_id ON public.closed_deals (lead_id);
CREATE INDEX IF NOT EXISTS idx_closed_deals_state ON public.closed_deals (state);
CREATE INDEX IF NOT EXISTS idx_closed_deals_closed_at ON public.closed_deals (closed_at DESC);

-- RLS for closed_deals
ALTER TABLE public.closed_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'closed_deals' AND policyname = 'closed_deals_authenticated_read'
  ) THEN
    CREATE POLICY closed_deals_authenticated_read ON public.closed_deals
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'closed_deals' AND policyname = 'closed_deals_authenticated_insert'
  ) THEN
    CREATE POLICY closed_deals_authenticated_insert ON public.closed_deals
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'closed_deals' AND policyname = 'closed_deals_authenticated_update'
  ) THEN
    CREATE POLICY closed_deals_authenticated_update ON public.closed_deals
      FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;
