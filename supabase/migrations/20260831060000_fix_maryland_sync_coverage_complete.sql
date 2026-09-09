-- Migration: Complete Maryland sync source coverage — add missing 5 of 10 sources
-- Timestamp: 20260831060000
-- Context: 20260831040000 added only 5 sources (Trulia, Rent.com, Realtor.com, PadMapper, Dwellsy).
-- This migration adds the remaining 5 to complete the standard 10-source audit matrix for Maryland/Baltimore.

INSERT INTO public.sync_source_coverage (portfolio, zone, source_name, sync_url, status, feasibility_note, job_scheduled)
VALUES
  -- Zillow (unconfirmed — high Trulia overlap, same parent company)
  ('Maryland', 'Baltimore', 'Zillow',
   'https://www.zillow.com/baltimore-md/rentals/?searchQueryState=%7B%22filterState%22%3A%7B%22fr%22%3A%7B%22value%22%3Atrue%7D%7D%7D',
   'unconfirmed',
   'Zillow and Trulia share parent company — high listing overlap expected. Confirm dedup before activating to avoid duplicate wave.',
   FALSE),

  -- HotPads (unconfirmed — same parent as Zillow/Trulia)
  ('Maryland', 'Baltimore', 'HotPads',
   'https://hotpads.com/baltimore-md/for-rent-by-owner?isListedByOwner=true&maxCreated=720&orderBy=score',
   'unconfirmed',
   'Same parent as Zillow/Trulia — likely high overlap. Deprioritize until dedup logic confirmed.',
   FALSE),

  -- Craigslist (unconfirmed — requires snapshot ingestion)
  ('Maryland', 'Baltimore', 'Craigslist',
   'https://baltimore.craigslist.org/search/apa',
   'unconfirmed',
   'Craigslist requires snapshot-based ingestion + stale-link detection. Build separately per Craigslist spec.',
   FALSE),

  -- Apartments.com (active — FSBO/owner-listed filter)
  ('Maryland', 'Baltimore', 'Apartments.com',
   'https://www.apartments.com/houses-condos-townhomes/baltimore-md/for-rent-by-owner/',
   'active',
   NULL,
   TRUE),

  -- Apartment List (active — Baltimore furnished/STR-adjacent listings)
  ('Maryland', 'Baltimore', 'Apartment List',
   'https://www.apartmentlist.com/md/baltimore',
   'active',
   NULL,
   TRUE)

ON CONFLICT (portfolio, COALESCE(zone, ''), source_name) DO UPDATE SET
  sync_url         = EXCLUDED.sync_url,
  status           = EXCLUDED.status,
  feasibility_note = EXCLUDED.feasibility_note,
  job_scheduled    = EXCLUDED.job_scheduled,
  updated_at       = NOW();

-- ─── Verify final coverage count for Maryland ─────────────────────────────────
-- After this migration, Maryland/Baltimore should have 10 source rows:
-- Active (7):   Trulia, Rent.com, Realtor.com, PadMapper, Dwellsy, Apartments.com, Apartment List
-- Unconfirmed (3): Zillow, HotPads, Craigslist
-- Total: 10 — matches the standard 10-source audit matrix used for all other portfolios
