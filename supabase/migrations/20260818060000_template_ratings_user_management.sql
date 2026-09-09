-- Migration: template_ratings table + lazy-load support columns
-- Timestamp: 20260818060000

-- ─── Template Ratings ────────────────────────────────────────────────────────
-- Stores agent ratings on cadence templates from call transcript view

CREATE TABLE IF NOT EXISTS public.template_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id TEXT NOT NULL,
  template_id     TEXT,
  template_name   TEXT,
  rating          TEXT NOT NULL CHECK (rating IN ('effective', 'needs_refinement')),
  rated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_session_id)
);

CREATE INDEX IF NOT EXISTS idx_template_ratings_template_id ON public.template_ratings(template_id);
CREATE INDEX IF NOT EXISTS idx_template_ratings_rating ON public.template_ratings(rating);
CREATE INDEX IF NOT EXISTS idx_template_ratings_rated_at ON public.template_ratings(rated_at DESC);

-- RLS
ALTER TABLE public.template_ratings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'template_ratings' AND policyname = 'template_ratings_select'
  ) THEN
    CREATE POLICY template_ratings_select ON public.template_ratings
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'template_ratings' AND policyname = 'template_ratings_insert'
  ) THEN
    CREATE POLICY template_ratings_insert ON public.template_ratings
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'template_ratings' AND policyname = 'template_ratings_update'
  ) THEN
    CREATE POLICY template_ratings_update ON public.template_ratings
      FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── Add cadence_template_id to call_sessions (if not exists) ─────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'cadence_template_id'
  ) THEN
    ALTER TABLE public.call_sessions ADD COLUMN cadence_template_id TEXT;
  END IF;
END $$;

-- ─── User Management: add dashboard visibility columns to user_profiles ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'dash_leads'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN dash_leads       BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN dash_pipeline    BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN dash_analytics   BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN dash_calls       BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN dash_outreach    BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─── Add status column to user_profiles (if not exists) ───────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending'));
  END IF;
END $$;
