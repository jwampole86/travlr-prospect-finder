-- ============================================================
-- Migration: Fix address_fingerprint unique constraint for ON CONFLICT
-- ============================================================
-- Problem: The sync engine uses onConflict: 'address_fingerprint' but the
-- existing index is a PARTIAL unique index (with WHERE clause).
-- PostgreSQL's ON CONFLICT clause requires a non-partial unique constraint
-- or a unique index WITHOUT a WHERE clause to work correctly.
-- This migration replaces the partial index with a full unique constraint
-- on a coalesced fingerprint so ON CONFLICT works for all rows.
-- ============================================================

-- 1. Drop the old partial unique index (if it exists)
DROP INDEX IF EXISTS idx_leads_address_fingerprint;

-- 2. Drop the generated column so we can recreate it with a different expression
--    that handles NULLs/empty strings gracefully (COALESCE to empty string)
ALTER TABLE leads DROP COLUMN IF EXISTS address_fingerprint;

-- 3. Re-add address_fingerprint as a STORED generated column using COALESCE
--    so rows with NULL/empty address still get a deterministic fingerprint
--    (they'll all share the same empty-string fingerprint, which is fine —
--     we only want uniqueness for rows that have real addresses)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address_fingerprint TEXT GENERATED ALWAYS AS (
    COALESCE(lower(trim(regexp_replace(address, '\s+', ' ', 'g'))), '')
    || '|' || COALESCE(lower(trim(city)), '')
    || '|' || COALESCE(lower(trim(state)), '')
  ) STORED;

-- 4. Clean up any remaining duplicates before creating the unique constraint
--    Keep the row with the highest prospect_score (most recently updated if tied)
DELETE FROM leads
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          COALESCE(lower(trim(regexp_replace(address, '\s+', ' ', 'g'))), '')
          || '|' || COALESCE(lower(trim(city)), '')
          || '|' || COALESCE(lower(trim(state)), '')
        ORDER BY prospect_score DESC NULLS LAST, updated_at DESC NULLS LAST
      ) AS rn
    FROM leads
  ) ranked
  WHERE rn > 1
);

-- 5. Create a NON-PARTIAL unique index on address_fingerprint
--    This is what ON CONFLICT: 'address_fingerprint' requires.
--    Non-partial means it covers ALL rows including those with empty/null addresses.
--    Rows with empty addresses will all share the same fingerprint '||' which means
--    only one empty-address row can exist — acceptable since those are placeholder rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_address_fingerprint
  ON leads (address_fingerprint);

-- 6. Add is_synthetic flag to leads table for data quality labeling
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false;

-- 7. Add contact_info_requested flag for homeowner consent gating
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contact_info_requested BOOLEAN NOT NULL DEFAULT false;

-- 8. Add contact_info_requested_at timestamp
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contact_info_requested_at TIMESTAMPTZ;

-- 9. Mark all existing synced leads as synthetic
--    (leads with IDs starting with 'sync-' are deterministically generated)
UPDATE leads
SET is_synthetic = true
WHERE id LIKE 'sync-%';

-- 10. Index for synthetic filtering
CREATE INDEX IF NOT EXISTS idx_leads_is_synthetic
  ON leads (is_synthetic);

-- 11. Index for contact_info_requested filtering
CREATE INDEX IF NOT EXISTS idx_leads_contact_info_requested
  ON leads (contact_info_requested)
  WHERE contact_info_requested = true;
