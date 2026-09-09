-- ─── BatchData Enrichment Fields ─────────────────────────────────────────────
-- Add BatchData-specific fields to lead_enrichments if they don't exist

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_enrichments' AND column_name = 'stage1_raw_response'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN stage1_raw_response JSONB DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_enrichments' AND column_name = 'owner_mailing_city'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN owner_mailing_city TEXT DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_enrichments' AND column_name = 'owner_mailing_state'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN owner_mailing_state TEXT DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_enrichments' AND column_name = 'owner_mailing_zip'
  ) THEN
    ALTER TABLE public.lead_enrichments ADD COLUMN owner_mailing_zip TEXT DEFAULT NULL;
  END IF;
END $$;

-- ─── Lead Assignment: Add assigned_agent_id to leads ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'assigned_agent_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'assigned_agent_name'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN assigned_agent_name TEXT DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent ON public.leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_unassigned ON public.leads(assigned_agent_id) WHERE assigned_agent_id IS NULL;

-- ─── Lead Assignment Rules: Sync from localStorage to DB ─────────────────────
-- Ensure lead_assignment_rules table has all needed columns (already created in 20260820090000)
-- Add updated_at trigger if not present

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_assignment_rules' AND column_name = 'last_run_at'
  ) THEN
    ALTER TABLE public.lead_assignment_rules ADD COLUMN last_run_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_assignment_rules' AND column_name = 'total_assigned'
  ) THEN
    ALTER TABLE public.lead_assignment_rules ADD COLUMN total_assigned INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─── Lead Assignment Log: Add execution_id for batch tracking ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_assignment_log' AND column_name = 'execution_id'
  ) THEN
    ALTER TABLE public.lead_assignment_log ADD COLUMN execution_id UUID DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignment_log_execution ON public.lead_assignment_log(execution_id);

-- ─── Enrichment API Logs: Ensure BatchData provider is tracked ───────────────
-- enrichment_api_logs already exists from earlier migrations
-- Add index on provider for cost reporting
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_provider ON public.enrichment_api_logs(provider);
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead_stage ON public.enrichment_api_logs(lead_id, stage);
