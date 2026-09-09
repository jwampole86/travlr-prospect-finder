-- Migration: Lead assignment tracking for hot lead queue
-- Adds assignment_timestamp to lead_assignments if not present, ensures RLS

-- Ensure lead_assignments has all needed columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_assignments' AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE public.lead_assignments ADD COLUMN assigned_at timestamptz DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_assignments' AND column_name = 'assigned_by'
  ) THEN
    ALTER TABLE public.lead_assignments ADD COLUMN assigned_by text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_assignments' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.lead_assignments ADD COLUMN notes text;
  END IF;
END $$;

-- Index for conversion attribution queries
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_at ON public.lead_assignments(assigned_at);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_agent ON public.lead_assignments(agent_user_id);

-- Enable RLS if not already
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read/insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignments' AND policyname = 'lead_assignments_auth_all'
  ) THEN
    CREATE POLICY lead_assignments_auth_all ON public.lead_assignments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
