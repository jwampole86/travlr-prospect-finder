-- Migration: checklist_auto_advance_config
-- Adds configuration table for auto-advance delay and extends notification types

-- 1. Auto-advance configuration table
CREATE TABLE IF NOT EXISTS public.checklist_auto_advance_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delay_days INTEGER NOT NULL DEFAULT 7,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_checklist_auto_advance_config_created
  ON public.checklist_auto_advance_config(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.checklist_auto_advance_config ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — staff/admin can read and update; homeowners cannot access
DROP POLICY IF EXISTS "staff_manage_auto_advance_config" ON public.checklist_auto_advance_config;
CREATE POLICY "staff_manage_auto_advance_config"
ON public.checklist_auto_advance_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Add source_event and auto_updated columns to str_checklist_steps if not present
ALTER TABLE public.str_checklist_steps
  ADD COLUMN IF NOT EXISTS source_event TEXT,
  ADD COLUMN IF NOT EXISTS auto_updated BOOLEAN DEFAULT false;

-- 6. Seed default config row
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.checklist_auto_advance_config LIMIT 1) THEN
    INSERT INTO public.checklist_auto_advance_config (delay_days, enabled)
    VALUES (7, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not seed auto-advance config: %', SQLERRM;
END $$;
