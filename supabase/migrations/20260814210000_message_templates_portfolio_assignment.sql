-- Migration: message_templates table for /templates screen
-- Timestamp: 20260814210000

CREATE TABLE IF NOT EXISTS public.message_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'email' CHECK (type IN ('email', 'sms')),
  subject     text,
  body        text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'Initial Outreach',
  variables   text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_message_templates_user_id ON public.message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_type ON public.message_templates(type);

-- RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'message_templates_user_select'
  ) THEN
    CREATE POLICY message_templates_user_select ON public.message_templates
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'message_templates_user_insert'
  ) THEN
    CREATE POLICY message_templates_user_insert ON public.message_templates
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'message_templates_user_update'
  ) THEN
    CREATE POLICY message_templates_user_update ON public.message_templates
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'message_templates_user_delete'
  ) THEN
    CREATE POLICY message_templates_user_delete ON public.message_templates
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add portfolio_configs and assignment_config columns to operator_settings if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'portfolio_configs'
  ) THEN
    ALTER TABLE public.operator_settings ADD COLUMN portfolio_configs jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'assignment_config'
  ) THEN
    ALTER TABLE public.operator_settings ADD COLUMN assignment_config jsonb DEFAULT '{
      "strategy": "round-robin",
      "capacityWarningThreshold": 80,
      "maxLeadsPerAgent": 50,
      "autoReassignOnOverflow": false
    }'::jsonb;
  END IF;
END $$;
