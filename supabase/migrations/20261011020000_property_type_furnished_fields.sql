-- ============================================================
-- Migration: 20261011020000_property_type_furnished_fields
-- ============================================================
-- Adds unit-type and furnished signals (confirmed live against the Trulia
-- Real Estate Scraper's search response) so apartment-community units can
-- be deprioritized vs standalone homes/townhomes, and furnished listings
-- (STR-ready) can be scored higher. Also fixes a gap where Alaska had no
-- luxury-rent threshold configured at all (see LUXURY_THRESHOLDS in
-- csv-import/route.ts), meaning no AK property could ever be flagged luxury
-- regardless of price — fixed in application code, not here.
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_apartment_community BOOLEAN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS property_type_label TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_furnished BOOLEAN;

COMMENT ON COLUMN public.leads.is_apartment_community IS
  'TRUE when the unit is part of a multi-unit apartment/condo community rather than a standalone home/townhome — lower STR conversion priority.';
COMMENT ON COLUMN public.leads.is_furnished IS
  'TRUE when the source listing was explicitly marked furnished — strong STR-readiness signal.';
