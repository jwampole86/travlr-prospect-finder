-- Lead Tasks: per-lead follow-up task board
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'todo' CHECK (task_type IN ('call', 'email', 'todo', 'follow_up')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date timestamptz,
  completed_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cadence_day integer,
  sequence_order integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS lead_tasks_lead_id_idx ON public.lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS lead_tasks_status_idx ON public.lead_tasks(status);
CREATE INDEX IF NOT EXISTS lead_tasks_due_date_idx ON public.lead_tasks(due_date);
CREATE INDEX IF NOT EXISTS lead_tasks_assigned_to_idx ON public.lead_tasks(assigned_to);

-- RLS
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_tasks_select" ON public.lead_tasks;
DROP POLICY IF EXISTS "lead_tasks_insert" ON public.lead_tasks;
DROP POLICY IF EXISTS "lead_tasks_update" ON public.lead_tasks;
DROP POLICY IF EXISTS "lead_tasks_delete" ON public.lead_tasks;

CREATE POLICY "lead_tasks_select" ON public.lead_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "lead_tasks_insert" ON public.lead_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "lead_tasks_update" ON public.lead_tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "lead_tasks_delete" ON public.lead_tasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_lead_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_tasks_updated_at ON public.lead_tasks;
CREATE TRIGGER lead_tasks_updated_at
  BEFORE UPDATE ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_tasks_updated_at();
