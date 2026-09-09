-- STR Onboarding Checklist Portal
-- Tracks per-step status and document uploads for homeowner self-service portal

-- 1. Checklist step status table
CREATE TABLE IF NOT EXISTS public.str_checklist_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  homeowner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 6),
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lead_id, step_number)
);

-- 2. Document uploads table for STR checklist
CREATE TABLE IF NOT EXISTS public.str_checklist_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  homeowner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 6),
  document_category TEXT NOT NULL CHECK (document_category IN (
    'str_permit', 'hoa_approval', 'tot_registration', 'inspection_report',
    'property_photos', 'floor_plan', 'insurance', 'other'
  )),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_str_checklist_steps_lead_id ON public.str_checklist_steps(lead_id);
CREATE INDEX IF NOT EXISTS idx_str_checklist_steps_homeowner ON public.str_checklist_steps(homeowner_user_id);
CREATE INDEX IF NOT EXISTS idx_str_checklist_docs_lead_id ON public.str_checklist_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_str_checklist_docs_step ON public.str_checklist_documents(lead_id, step_number);

-- 4. Enable RLS
ALTER TABLE public.str_checklist_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.str_checklist_documents ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for str_checklist_steps
DROP POLICY IF EXISTS "homeowners_manage_own_checklist_steps" ON public.str_checklist_steps;
CREATE POLICY "homeowners_manage_own_checklist_steps"
ON public.str_checklist_steps
FOR ALL
TO authenticated
USING (homeowner_user_id = auth.uid())
WITH CHECK (homeowner_user_id = auth.uid());

DROP POLICY IF EXISTS "staff_view_all_checklist_steps" ON public.str_checklist_steps;
CREATE POLICY "staff_view_all_checklist_steps"
ON public.str_checklist_steps
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('admin', 'operator', 'agent')
  )
);

DROP POLICY IF EXISTS "staff_update_checklist_steps" ON public.str_checklist_steps;
CREATE POLICY "staff_update_checklist_steps"
ON public.str_checklist_steps
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('admin', 'operator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('admin', 'operator')
  )
);

-- 6. RLS Policies for str_checklist_documents
DROP POLICY IF EXISTS "homeowners_manage_own_checklist_docs" ON public.str_checklist_documents;
CREATE POLICY "homeowners_manage_own_checklist_docs"
ON public.str_checklist_documents
FOR ALL
TO authenticated
USING (homeowner_user_id = auth.uid())
WITH CHECK (homeowner_user_id = auth.uid());

DROP POLICY IF EXISTS "staff_view_all_checklist_docs" ON public.str_checklist_documents;
CREATE POLICY "staff_view_all_checklist_docs"
ON public.str_checklist_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('admin', 'operator', 'agent')
  )
);
