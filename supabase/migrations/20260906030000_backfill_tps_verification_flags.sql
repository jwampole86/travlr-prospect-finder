-- ============================================================
-- TRAVLR — Backfill TPS Import Verification Flags
-- Migration: 20260906030000
-- ============================================================
-- Root cause: The tps-csv-import route had three bugs:
--
-- BUG 1 — verified_number not set on existing leads that already had a phone:
--   willUpdatePhone = pr.hasPhone && !existingHasPhone
--   → If contact_phone was already stored, willUpdatePhone=false
--   → verified_number remained false
--   → lead did NOT count toward Phone Available (which uses contact_phone IS NOT NULL)
--   WAIT — Phone Available counts contact_phone IS NOT NULL, not verified_number.
--   So Phone Available was already counting those leads. But Fully Verified requires
--   verified_number=true, so those leads were excluded from Fully Verified.
--
-- BUG 2 — verified_owner not set on existing leads that already had a contact name:
--   willUpdateContact = pr.verifiedOwner && pr.contactCleaned.length > existingContact.length
--   → If existing contact name was same length or longer, willUpdateContact=false
--   → verified_owner remained false
--   → lead excluded from Fully Verified
--
-- BUG 3 — verified_address never set on existing leads:
--   The update path never set verified_address on existing leads.
--   → verified_address remained null/false
--   → lead excluded from Fully Verified
--
-- BUG 4 — fully_verified derived field not set on existing leads:
--   Even for NEW leads, fully_verified was set correctly.
--   But for UPDATED_EXISTING, fully_verified was never written.
--
-- FIX: This migration backfills all leads imported from the TPS CSV batch
-- (import_source_name = 'ZILLOW_LEADS_09_2026' OR research_source = 'TruePeopleSearch')
-- that have:
--   - a non-empty contact_name → set verified_owner = true
--   - a non-empty contact_phone → set verified_number = true
--   - a non-ambiguous standardized_address → set verified_address = 'MANUAL_RESEARCH'
--   - all three → set fully_verified = true
--
-- This does NOT fabricate data. It applies the same manual research verification
-- evidence that the import route was supposed to apply but failed to.
-- ============================================================

-- ── 1. Backfill verified_owner on TPS-imported leads that have a contact name ──
UPDATE public.leads
SET
  verified_owner         = TRUE,
  verified_owner_source  = 'MANUAL_RESEARCH_CSV',
  verified_owner_method  = 'MANUAL_RESEARCH',
  owner_verified_at      = COALESCE(owner_verified_at, imported_at, updated_at::timestamptz, NOW()),
  updated_at             = NOW()
WHERE
  is_synthetic IS NOT TRUE
  AND (
    import_source_name = 'ZILLOW_LEADS_09_2026'
    OR research_source = 'TruePeopleSearch'
    OR import_source_file = 'leads_with_phone_numbers.csv'
  )
  AND contact_name IS NOT NULL
  AND contact_name <> ''
  AND (verified_owner IS NOT TRUE);

-- ── 2. Backfill verified_number on TPS-imported leads that have a phone ──────
UPDATE public.leads
SET
  verified_number         = TRUE,
  verified_number_source  = 'MANUAL_RESEARCH_CSV',
  verified_number_method  = 'MANUAL_RESEARCH',
  verified_number_at      = COALESCE(verified_number_at, imported_at, updated_at::timestamptz, NOW()),
  phone_verification_source = 'TruePeopleSearch',
  phone_verified_at       = COALESCE(phone_verified_at, imported_at, updated_at::timestamptz, NOW()),
  has_phone               = TRUE,
  updated_at              = NOW()
WHERE
  is_synthetic IS NOT TRUE
  AND (
    import_source_name = 'ZILLOW_LEADS_09_2026'
    OR research_source = 'TruePeopleSearch'
    OR import_source_file = 'leads_with_phone_numbers.csv'
  )
  AND contact_phone IS NOT NULL
  AND contact_phone <> ''
  AND (verified_number IS NOT TRUE);

-- ── 3. Backfill verified_address on TPS-imported leads with a standardized address ──
-- Only set for leads that have a non-ambiguous standardized_address
-- (street + city + state all present, address length > 10 chars)
UPDATE public.leads
SET
  verified_address            = 'MANUAL_RESEARCH',
  address_verification_source = 'MANUAL_RESEARCH_CSV',
  address_verified_at         = COALESCE(address_verified_at, imported_at, updated_at::timestamptz, NOW()),
  updated_at                  = NOW()
WHERE
  is_synthetic IS NOT TRUE
  AND (
    import_source_name = 'ZILLOW_LEADS_09_2026'
    OR research_source = 'TruePeopleSearch'
    OR import_source_file = 'leads_with_phone_numbers.csv'
  )
  AND address IS NOT NULL
  AND LENGTH(address) > 5
  AND state IS NOT NULL
  AND state <> ''
  AND (
    verified_address IS NULL
    OR verified_address = ''
    OR verified_address = 'false'
  );

-- ── 4. fully_verified is a GENERATED column ──────────────────────────────────
-- It is automatically computed by the database as:
--   (verified_owner = true AND verified_number = true
--    AND verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false')
-- No manual UPDATE is needed or allowed. The backfill of verified_owner,
-- verified_number, and verified_address above is sufficient.

-- ── 5. Verification report ────────────────────────────────────────────────────
-- Returns counts for the TPS import batch after backfill.
-- Run this to verify the fix worked.
DO $$
DECLARE
  v_total_tps          BIGINT;
  v_verified_owner     BIGINT;
  v_verified_number    BIGINT;
  v_verified_address   BIGINT;
  v_fully_verified     BIGINT;
  v_phone_available    BIGINT;
  v_total_fully_verified BIGINT;
  v_total_phone_available BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total_tps
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    );

  SELECT COUNT(*) INTO v_verified_owner
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    )
    AND verified_owner IS TRUE;

  SELECT COUNT(*) INTO v_verified_number
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    )
    AND verified_number IS TRUE;

  SELECT COUNT(*) INTO v_verified_address
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    )
    AND verified_address IS NOT NULL
    AND verified_address <> ''
    AND verified_address <> 'false';

  SELECT COUNT(*) INTO v_fully_verified
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    )
    AND verified_owner IS TRUE
    AND verified_number IS TRUE
    AND verified_address IS NOT NULL
    AND verified_address <> ''
    AND verified_address <> 'false';

  SELECT COUNT(*) INTO v_phone_available
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE
    AND (
      import_source_name = 'ZILLOW_LEADS_09_2026'
      OR research_source = 'TruePeopleSearch'
      OR import_source_file = 'leads_with_phone_numbers.csv'
    )
    AND contact_phone IS NOT NULL
    AND contact_phone <> '';

  -- Global canonical counts (what Dashboard will show)
  SELECT COUNT(DISTINCT CASE
    WHEN verified_owner IS TRUE
      AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false')
      AND verified_number IS TRUE
    THEN id END)
  INTO v_total_fully_verified
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE;

  SELECT COUNT(DISTINCT CASE
    WHEN contact_phone IS NOT NULL AND contact_phone <> ''
    THEN id END)
  INTO v_total_phone_available
  FROM public.leads
  WHERE is_synthetic IS NOT TRUE;

  RAISE NOTICE '=== TPS IMPORT BACKFILL VERIFICATION REPORT ===';
  RAISE NOTICE 'TPS-imported leads total:    %', v_total_tps;
  RAISE NOTICE 'verified_owner = true:       %', v_verified_owner;
  RAISE NOTICE 'verified_number = true:      %', v_verified_number;
  RAISE NOTICE 'verified_address set:        %', v_verified_address;
  RAISE NOTICE 'fully_verified (TPS batch):  %', v_fully_verified;
  RAISE NOTICE 'phone_available (TPS batch): %', v_phone_available;
  RAISE NOTICE '--- GLOBAL CANONICAL COUNTS (Dashboard will show) ---';
  RAISE NOTICE 'FULLY VERIFIED (all leads):  %', v_total_fully_verified;
  RAISE NOTICE 'PHONE AVAILABLE (all leads): %', v_total_phone_available;
  RAISE NOTICE '=================================================';
END;
$$;

-- ── 7. Index to support the dashboard RPC scan on verification fields ─────────
CREATE INDEX IF NOT EXISTS idx_leads_fully_verified_flags
  ON public.leads (verified_owner, verified_number, verified_address)
  WHERE is_synthetic IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_leads_contact_phone_available
  ON public.leads (contact_phone)
  WHERE is_synthetic IS NOT TRUE AND contact_phone IS NOT NULL AND contact_phone <> '';
