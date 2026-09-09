-- Migration: Add document review fields and onboarding event triggers
-- Timestamp: 20260831010000

-- Add review fields to str_checklist_documents if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'str_checklist_documents'
    AND column_name = 'review_status'
  ) THEN
    ALTER TABLE public.str_checklist_documents
      ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (review_status IN ('pending_review', 'under_review', 'approved', 'rejected')),
      ADD COLUMN reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN reviewed_at TIMESTAMPTZ,
      ADD COLUMN review_notes TEXT;
  END IF;
END $$;

-- Add source_event column to str_checklist_steps for auto-update tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'str_checklist_steps'
    AND column_name = 'source_event'
  ) THEN
    ALTER TABLE public.str_checklist_steps
      ADD COLUMN source_event TEXT,
      ADD COLUMN auto_updated BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Index for agent review queue
CREATE INDEX IF NOT EXISTS idx_str_checklist_docs_review_status
  ON public.str_checklist_documents(review_status);

CREATE INDEX IF NOT EXISTS idx_str_checklist_docs_lead_id
  ON public.str_checklist_documents(lead_id);

-- RLS: agents (admin/agent roles) can read all documents for review
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'str_checklist_documents'
    AND policyname = 'agents_can_read_all_docs_for_review'
  ) THEN
    CREATE POLICY agents_can_read_all_docs_for_review
      ON public.str_checklist_documents
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.app_role IN ('admin', 'agent')
        )
        OR homeowner_user_id = auth.uid()
      );
  END IF;
END $$;

-- RLS: agents can update review fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'str_checklist_documents'
    AND policyname = 'agents_can_review_docs'
  ) THEN
    CREATE POLICY agents_can_review_docs
      ON public.str_checklist_documents
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.app_role IN ('admin', 'agent')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.app_role IN ('admin', 'agent')
        )
      );
  END IF;
END $$;
