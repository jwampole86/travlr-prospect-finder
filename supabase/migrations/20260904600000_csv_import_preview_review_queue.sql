-- ============================================================
-- Migration: CSV Import Preview + Review Queue + Idempotency
-- ============================================================

-- 1. Add possible_duplicate fields to leads (idempotent)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS possible_duplicate BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS possible_duplicate_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS possible_duplicate_batch_id TEXT;

-- 2. Create import_review_queue table for uncertain matches
CREATE TABLE IF NOT EXISTS public.import_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  raw_address TEXT,
  normalized_address TEXT,
  raw_contact TEXT,
  raw_phone TEXT,
  state_code TEXT,
  normalized_phone TEXT,
  csv_data JSONB,
  possible_match_lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  possible_match_address TEXT,
  possible_match_confidence NUMERIC(5,2),
  possible_match_strategy TEXT,
  review_reason TEXT,
  resolution TEXT CHECK (resolution IN ('MERGE', 'CREATE_NEW', 'SKIP', 'PENDING')) DEFAULT 'PENDING',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add index for batch lookups
CREATE INDEX IF NOT EXISTS idx_import_review_queue_batch ON public.import_review_queue(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_review_queue_resolution ON public.import_review_queue(resolution);
CREATE INDEX IF NOT EXISTS idx_leads_possible_duplicate ON public.leads(possible_duplicate) WHERE possible_duplicate = TRUE;

-- 4. Ensure csv_import_batches has idempotency key (import_batch_id unique)
ALTER TABLE public.csv_import_batches
  ADD COLUMN IF NOT EXISTS is_preview_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preview_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commit_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. RLS for import_review_queue
ALTER TABLE public.import_review_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_review_queue' AND policyname = 'import_review_queue_auth'
  ) THEN
    CREATE POLICY import_review_queue_auth ON public.import_review_queue
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Backfill dedup_fingerprint for any leads missing it (using standardized_address as proxy)
UPDATE public.leads
SET dedup_fingerprint = LOWER(REGEXP_REPLACE(standardized_address, '[^a-z0-9\s]', '', 'g'))
WHERE dedup_fingerprint IS NULL
  AND standardized_address IS NOT NULL
  AND standardized_address != '';
