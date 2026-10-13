-- AI-suggested follow-up tasks: a cached plan per lead, and a flag on the tasks an agent accepts from it.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_task_plan JSONB;
ALTER TABLE public.lead_tasks ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE;
