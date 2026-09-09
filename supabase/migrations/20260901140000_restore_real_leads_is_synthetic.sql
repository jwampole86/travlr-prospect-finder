-- Migration: Restore real leads — undo the blanket is_synthetic=true marking
-- The previous migration (20260901130000) incorrectly marked ALL leads as synthetic.
-- Real leads from actual listing sources (Zillow, HotPads, Craigslist, Dwellsy,
-- Rent.com, etc.) must be visible. Only leads explicitly seeded by the deterministic
-- test-data generator should remain synthetic.
--
-- Strategy:
--   1. Reset is_synthetic = false for all leads (safe default: show the lead)
--   2. Re-mark only leads that are definitively synthetic:
--      - source = 'synthetic' or 'demo' or 'seed' or 'test'
--      - OR address contains obvious test patterns (e.g. "Test Property", "Demo Lead")
--   3. Leads with NULL source, unknown source, or real listing sources stay visible.

-- Step 1: Reset ALL leads to real (is_synthetic = false)
-- This is the safe default — if we're unsure, show the lead.
UPDATE public.leads
SET is_synthetic = false
WHERE is_synthetic = true OR is_synthetic IS NULL;

-- Step 2: Re-mark only definitively synthetic/demo/test leads
-- Cast source to text first to avoid invalid enum input error when source IS NULL.
UPDATE public.leads
SET is_synthetic = true
WHERE
  -- Explicit synthetic source markers (cast enum to text before comparison)
  LOWER(COALESCE(source::text, '')) IN ('synthetic', 'demo', 'seed', 'test', 'generated', 'fake', 'mock')
  OR
  -- Address-level test patterns (case-insensitive)
  LOWER(COALESCE(address, '')) LIKE '%test property%'
  OR LOWER(COALESCE(address, '')) LIKE '%demo lead%'
  OR LOWER(COALESCE(address, '')) LIKE '%fake address%'
  OR LOWER(COALESCE(address, '')) LIKE '%synthetic%';

-- Step 3: Log counts for verification
DO $$
DECLARE
  real_count   INTEGER;
  synth_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO real_count  FROM public.leads WHERE is_synthetic = false;
  SELECT COUNT(*) INTO synth_count FROM public.leads WHERE is_synthetic = true;
  RAISE NOTICE '[restore_real_leads] Real leads visible: %, Synthetic leads hidden: %', real_count, synth_count;
END $$;

-- Step 4: Recreate the partial indexes for the corrected data distribution
DROP INDEX IF EXISTS idx_leads_real;
DROP INDEX IF EXISTS idx_leads_synthetic;

CREATE INDEX IF NOT EXISTS idx_leads_real
  ON public.leads (prospect_score DESC)
  WHERE is_synthetic = false;

CREATE INDEX IF NOT EXISTS idx_leads_synthetic
  ON public.leads (created_at DESC)
  WHERE is_synthetic = true;
