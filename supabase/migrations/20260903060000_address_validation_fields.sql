-- Migration: 20260903060000_address_validation_fields.sql
-- Adds address validation tracking columns to the leads table.
-- These columns are set during sync/import by the address validation service
-- and drive the Verified/Unverified badge in Lead Management.

-- ── Add addr_validated column ─────────────────────────────────────────────────
-- true  = address passed city+state consistency check
-- false = not yet validated (pending)
-- NULL  = legacy lead imported before this migration
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS addr_validated boolean DEFAULT NULL;

-- ── Add addr_mismatch column ──────────────────────────────────────────────────
-- true = address was detected as mismatched (street from City A, assigned to City B)
-- These leads are also marked is_synthetic=true so they are hidden from agents
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS addr_mismatch boolean DEFAULT false NOT NULL;

-- ── Add addr_validation_reason column ────────────────────────────────────────
-- Human-readable explanation of why a lead failed address validation
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS addr_validation_reason text DEFAULT NULL;

-- ── Index for fast Verified Only filter ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_addr_validated
  ON public.leads (addr_validated)
  WHERE addr_validated = true;

CREATE INDEX IF NOT EXISTS idx_leads_addr_mismatch
  ON public.leads (addr_mismatch)
  WHERE addr_mismatch = true;

-- ── Backfill: mark existing real leads as addr_validated = true ───────────────
-- Leads that are NOT synthetic and have a real-looking address are assumed valid.
-- This ensures the Verified badge appears on existing good leads immediately.
UPDATE public.leads
SET addr_validated = true
WHERE
  is_synthetic IS NOT TRUE
  AND addr_mismatch IS NOT TRUE
  AND address IS NOT NULL
  AND address != ''
  AND address !~ '^(Zillow|HotPads|Apartments\.com|Craigslist|Facebook Marketplace|Realtor\.com|LoopNet|Trulia|Redfin|MLS|Airbnb|VRBO|Direct|Referral|Other|Unknown)\s+Listing\s+#\d+$'
  AND address !~ '^Imported Property'
  AND addr_validated IS NULL;

-- ── Backfill: mark known mismatched leads ────────────────────────────────────
-- Leads already flagged synthetic with Denver zip codes on non-CO records
-- are also marked addr_mismatch for the data quality monitor.
UPDATE public.leads
SET addr_mismatch = true
WHERE
  is_synthetic = true
  AND addr_mismatch = false
  AND (
    -- Denver zip on non-CO lead
    (zip LIKE '802%' AND state != 'CO')
    OR
    -- Denver city on non-CO lead
    (lower(city) = 'denver' AND state != 'CO')
  );
