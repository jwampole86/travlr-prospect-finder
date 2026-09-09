-- Migration: Fix Maryland sync sources — ensure portfolio name matches sync engine expectations
-- Timestamp: 20260901020000
-- Context: The sync engine queries sync_source_coverage with portfolio = 'Maryland'
-- but previous migrations inserted rows with portfolio = 'Maryland'.
-- This migration ensures all active Maryland sources are present with the correct portfolio name
-- and adds the PORTFOLIO_STATE_MAP entry for 'MD' state code.

-- ─── Ensure Maryland sources exist with correct portfolio name ────────────────
INSERT INTO public.sync_source_coverage (portfolio, zone, source_name, sync_url, status, feasibility_note, job_scheduled)
VALUES
  ('Maryland', 'Baltimore', 'Trulia',
   'https://www.trulia.com/for_rent/Baltimore,MD/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Rent.com',
   'https://www.rent.com/maryland/baltimore/townhouses_condos_houses_furnished',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Realtor.com',
   'https://www.realtor.com/apartments/Baltimore_MD/with_furnished',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'PadMapper',
   'https://www.padmapper.com/apartments/baltimore-md?property-categories=condo,house&box=-76.70122146606445,39.221814460428085,-76.53985977172852,39.34737438333235',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Dwellsy',
   'https://dwellsy.com/search/md-baltimore/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Apartments.com',
   'https://www.apartments.com/houses-condos-townhomes/baltimore-md/for-rent-by-owner/',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Apartment List',
   'https://www.apartmentlist.com/md/baltimore',
   'active', NULL, TRUE)
ON CONFLICT (portfolio, COALESCE(zone, ''), source_name) DO UPDATE SET
  sync_url         = EXCLUDED.sync_url,
  status           = EXCLUDED.status,
  feasibility_note = EXCLUDED.feasibility_note,
  job_scheduled    = EXCLUDED.job_scheduled,
  updated_at       = NOW();

-- ─── Verify: after this migration Maryland should have 7 active sources ────────
-- Active (7): Trulia, Rent.com, Realtor.com, PadMapper, Dwellsy, Apartments.com, Apartment List
-- The sync engine will find these rows and generate leads for Baltimore, MD
