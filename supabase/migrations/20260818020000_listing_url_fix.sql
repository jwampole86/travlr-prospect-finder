-- Migration: listing_url field fix + extraction log
-- Ensures listing_url column exists on leads table (separate from sync_source_url)
-- Adds sync_source_url column to store the search URL used during sync
-- Adds listing_url_extraction_log for Claude-assisted extraction audit trail

-- ── 1. Ensure listing_url column exists on leads ──────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS listing_url TEXT DEFAULT '';

-- ── 2. Add sync_source_url column (stores the search/filter URL from sync job) ─
-- This is distinct from listing_url (individual property detail page URL).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sync_source_url TEXT DEFAULT NULL;

-- ── 3. Backfill: clear listing_url values that look like search pages ──────────
-- These are the "broken" URLs that were stored as listing_url but are actually
-- search/filter page URLs. Setting to empty string triggers the "unavailable" UI.
UPDATE public.leads
SET listing_url = ''
WHERE listing_url IS NOT NULL
  AND (
    listing_url LIKE '%/search?%'
    OR listing_url LIKE '%/search/%'
    OR listing_url LIKE '%/for-rent%'
    OR listing_url LIKE '%/category/%'
    OR listing_url LIKE '%realestateandhomes-search%'
    OR listing_url LIKE '%synthetic.travlr%'
    OR listing_url LIKE '%example.com%'
    OR listing_url LIKE '%/apartments/?%'
    OR listing_url LIKE '%?query=%'
    OR listing_url LIKE '%?sk=%'
  );

-- ── 4. Create listing_url_extraction_log table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_url_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  source TEXT NOT NULL,
  trigger_reason TEXT NOT NULL, -- 'no_url' | 'search_url_detected' | 'low_confidence' | 'verification' | 'backfill'
  original_url TEXT,
  extracted_url TEXT,
  confidence TEXT, -- 'high' | 'medium' | 'low' | 'none'
  method TEXT NOT NULL, -- 'standard_valid' | 'claude_fallback' | 'claude_verification' | 'claude_backfill' | 'deterministic'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by lead
CREATE INDEX IF NOT EXISTS idx_listing_url_log_lead_id
  ON public.listing_url_extraction_log(lead_id);

-- Index for querying by method (to track Claude fallback frequency)
CREATE INDEX IF NOT EXISTS idx_listing_url_log_method
  ON public.listing_url_extraction_log(method, created_at DESC);

-- ── 5. RLS for listing_url_extraction_log ─────────────────────────────────────
ALTER TABLE public.listing_url_extraction_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listing_url_extraction_log'
      AND policyname = 'listing_url_log_auth_read'
  ) THEN
    CREATE POLICY listing_url_log_auth_read
      ON public.listing_url_extraction_log
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listing_url_extraction_log'
      AND policyname = 'listing_url_log_auth_insert'
  ) THEN
    CREATE POLICY listing_url_log_auth_insert
      ON public.listing_url_extraction_log
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
