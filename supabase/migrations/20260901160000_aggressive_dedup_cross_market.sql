-- ============================================================
-- Migration: Aggressive deduplication — cross-market address reuse
-- ============================================================
-- Problem: The same street address (e.g. "9947 Cedar Ln") appears in multiple
-- cities (Denver CO, Los Angeles CA, Las Vegas NV) with identical beds/baths/price.
-- This is synthetic data collision — the seeded generator reused the same
-- street number + street name across different portfolios/zones.
--
-- Strategy:
--   1. Delete cross-market duplicates: same normalized street address + same
--      beds + same price (strong signal of synthetic collision, not real property)
--   2. Delete any remaining duplicates by address+city+state fingerprint
--   3. Ensure the address_fingerprint unique index is in place
--      (address+city+state is the correct uniqueness boundary — the same
--       street address can legitimately exist in different cities)
-- ============================================================

-- Step 1: Delete cross-market duplicates
-- Same normalized street address + same beds + same price across different cities
-- Keep the row with the highest prospect_score (most recently updated if tied)
DELETE FROM public.leads
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          lower(trim(regexp_replace(address, '\s+', ' ', 'g'))),
          beds,
          price
        ORDER BY prospect_score DESC NULLS LAST, updated_at DESC NULLS LAST, id ASC
      ) AS rn
    FROM public.leads
    WHERE address IS NOT NULL AND address <> ''
      AND beds IS NOT NULL
      AND price IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Delete any remaining duplicates by full address+city+state fingerprint
-- (belt-and-suspenders: catches any that survived step 1)
DELETE FROM public.leads
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          COALESCE(lower(trim(regexp_replace(address, '\s+', ' ', 'g'))), '')
          || '|' || COALESCE(lower(trim(city)), '')
          || '|' || COALESCE(lower(trim(state)), '')
        ORDER BY prospect_score DESC NULLS LAST, updated_at DESC NULLS LAST, id ASC
      ) AS rn
    FROM public.leads
  ) ranked
  WHERE rn > 1
);

-- Step 3: Ensure address_fingerprint column exists with correct expression
-- (idempotent — previous migrations may have already added it)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address_fingerprint TEXT GENERATED ALWAYS AS (
    COALESCE(lower(trim(regexp_replace(address, '\s+', ' ', 'g'))), '')
    || '|' || COALESCE(lower(trim(city)), '')
    || '|' || COALESCE(lower(trim(state)), '')
  ) STORED;

-- Step 4: Drop and recreate the unique index on address_fingerprint
-- (ensures it's non-partial so ON CONFLICT works correctly)
-- NOTE: address+city+state is the correct uniqueness boundary.
-- The same street address (e.g. "3252 Sunset Blvd") can legitimately exist
-- in multiple cities — only the full address+city+state combo must be unique.
DROP INDEX IF EXISTS idx_leads_address_fingerprint;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_address_fingerprint
  ON public.leads (address_fingerprint);

-- Step 5: Drop the street-address-only index if it was previously created
-- (it was too aggressive — real properties share street addresses across cities)
DROP INDEX IF EXISTS idx_leads_street_address_unique;

-- Step 6: Log dedup results
DO $$
DECLARE
  total_count  INTEGER;
  synth_count  INTEGER;
  real_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM public.leads;
  SELECT COUNT(*) INTO synth_count FROM public.leads WHERE is_synthetic = true;
  SELECT COUNT(*) INTO real_count  FROM public.leads WHERE is_synthetic = false;
  RAISE NOTICE '[aggressive_dedup] After cleanup — Total: %, Synthetic: %, Real: %',
    total_count, synth_count, real_count;
END $$;
