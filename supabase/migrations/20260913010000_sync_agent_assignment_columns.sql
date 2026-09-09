-- ─── Sync legacy assigned_agent_id with canonical primary_agent_id ────────────
-- primary_agent_id (added 2026-09-04) is the canonical assignment field used by
-- /api/leads/assign-agent, /api/agent/leads, dashboard KPIs, and scoring.
-- assigned_agent_id (added 2026-08-20) is a legacy field still read by several
-- pages/routes (agent-self-performance, agent-field-view, manager-team-metrics,
-- escalated-leads, owner-portal, DocuSign webhook commission trigger, cadence
-- escalation notifications, checklist auto-advance reminders, info-request,
-- base44 webhook) and still written by /api/leads/auto-assign.
-- Without this sync, auto-assigned leads never appear in an agent's real queue,
-- commissions can fail to trigger for the correct agent, and every agent
-- performance page silently shows stale/empty data for auto-assigned leads.
-- This trigger keeps both columns identical going forward; the codebase should
-- migrate fully to primary_agent_id over time, but this closes the gap safely
-- without requiring every call site to change at once.

-- One-time backfill: whichever column has a value wins if the other is null.
UPDATE public.leads
SET primary_agent_id = assigned_agent_id
WHERE primary_agent_id IS NULL AND assigned_agent_id IS NOT NULL;

UPDATE public.leads
SET assigned_agent_id = primary_agent_id
WHERE assigned_agent_id IS NULL AND primary_agent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_agent_assignment_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Whichever column changed in this write wins and propagates to the other.
  IF NEW.primary_agent_id IS DISTINCT FROM OLD.primary_agent_id THEN
    NEW.assigned_agent_id := NEW.primary_agent_id;
  ELSIF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    NEW.primary_agent_id := NEW.assigned_agent_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agent_assignment_columns ON public.leads;
CREATE TRIGGER trg_sync_agent_assignment_columns
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_assignment_columns();

-- Also cover INSERT (e.g. CSV import setting one or the other directly).
CREATE OR REPLACE FUNCTION public.sync_agent_assignment_columns_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_agent_id IS NOT NULL AND NEW.assigned_agent_id IS NULL THEN
    NEW.assigned_agent_id := NEW.primary_agent_id;
  ELSIF NEW.assigned_agent_id IS NOT NULL AND NEW.primary_agent_id IS NULL THEN
    NEW.primary_agent_id := NEW.assigned_agent_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agent_assignment_columns_insert ON public.leads;
CREATE TRIGGER trg_sync_agent_assignment_columns_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_assignment_columns_insert();
