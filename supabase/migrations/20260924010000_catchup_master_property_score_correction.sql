-- Migration: Catch up leads missed by the master-property score correction
-- Timestamp: 20260924010000
--
-- ROOT CAUSE:
--   20260922090000_correct_master_property_scores.sql was a one-time UPDATE
--   (not a trigger) that capped prospect_score at 50 for property-only leads
--   (address_source = 'MASTER_HOMEOWNER_DATA', master_property_data->>'source'
--   = 'MASTER_PROPERTY_DATA', no active listing) since property-only data is
--   not evidence of lead quality.
--
--   A concurrent bulk import (master homeowner data load) raced with that
--   migration — many qualifying rows were inserted/updated around the same
--   timestamp and were never touched by the one-time UPDATE. Verified via
--   direct query: 95,202 leads still match the exact same rule but still sit
--   at the stale, uncorrected prospect_score (mostly 100):
--     - Maryland (MD): 57,636 leads
--     - Illinois (IL): 37,566 leads
--   None of these 95,202 leads are currently assigned to an agent, so this
--   is safe to correct.
--
--   Downstream impact of the stale scores:
--     - dashboard high_priority / action_needed KPIs were inflated to
--       ~100,295 (nearly all of it these unenriched property-only leads).
--     - exec_sql_top_leads() ORDER BY prospect_score DESC LIMIT 30 returned
--       only these fake-100-score, factually-empty rows for MD/IL, so
--       /api/dashboard/top-leads always fell through to its slow fallback
--       and still came back empty — the direct cause of "takes forever to
--       load" when switching to those portfolios.
--
-- FIX: re-run the exact same (idempotent) UPDATE from 20260922090000 so it
-- also catches the rows that were missed the first time.

SET LOCAL statement_timeout = '10min';

UPDATE public.leads
SET prospect_score = least(coalesce(prospect_score, 50), 50),
    lat = NULL,
    lng = NULL,
    beds = NULL,
    baths = NULL,
    price = NULL,
    days_on_market = NULL,
    estimated_adr = NULL,
    estimated_occupancy = NULL,
    estimated_gross_monthly = NULL,
    estimated_net_monthly = NULL,
    updated_at = now()::TEXT
WHERE address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND coalesce(listing_status, '') <> 'Active'
  AND prospect_score > 50;
