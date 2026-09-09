-- ============================================================
-- Add Zillow, HotPads, Craigslist, and Apartments.com as
-- configurable lead source records (brings total to 10 sources)
-- ============================================================

INSERT INTO public.lead_source_configs (
  source_name, source_key, market, state, city,
  filter_url, property_type_filters, furnished_required,
  ingestion_method, sync_status, is_active, notes
)
VALUES
  -- Zillow
  ('Zillow', 'zillow', 'Denver, CO', 'CO', 'Denver',
   'https://www.zillow.com/denver-co/rentals/?searchQueryState=%7B%22isAllHomes%22%3Atrue%7D',
   ARRAY['condo','single_family','townhouse'], false, 'manual', 'pending', true,
   'Confirm individual listing permalink capture before enabling automated sync. Zillow ToS restricts scraping — use manual import or official Zillow API.'),

  ('Zillow', 'zillow', 'Las Vegas, NV', 'NV', 'Las Vegas',
   'https://www.zillow.com/las-vegas-nv/rentals/',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Manual import. Verify listing_url is per-property permalink, not search URL.'),

  ('Zillow', 'zillow', 'Los Angeles, CA', 'CA', 'Los Angeles',
   'https://www.zillow.com/los-angeles-ca/rentals/',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Manual import. Verify listing_url is per-property permalink, not search URL.'),

  ('Zillow', 'zillow', 'Seattle, WA', 'WA', 'Seattle',
   'https://www.zillow.com/seattle-wa/rentals/',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Manual import. Verify listing_url is per-property permalink, not search URL.'),

  ('Zillow', 'zillow', 'Miami, FL', 'FL', 'Miami',
   'https://www.zillow.com/miami-fl/rentals/',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Manual import. Verify listing_url is per-property permalink, not search URL.'),

  -- HotPads (Zillow Group property — listing data may overlap with Zillow feed)
  ('HotPads', 'hotpads', 'Denver, CO', 'CO', 'Denver',
   'https://hotpads.com/denver-co/rentals',
   ARRAY['condo','single_family','townhouse'], false, 'manual', 'pending', true,
   'HotPads is part of Zillow Group. Listing data may overlap with Zillow — apply cross-source deduplication. Confirm ingestion path before enabling sync.'),

  ('HotPads', 'hotpads', 'Las Vegas, NV', 'NV', 'Las Vegas',
   'https://hotpads.com/las-vegas-nv/rentals',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'HotPads/Zillow Group overlap — deduplicate against Zillow records.'),

  ('HotPads', 'hotpads', 'Los Angeles, CA', 'CA', 'Los Angeles',
   'https://hotpads.com/los-angeles-ca/rentals',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'HotPads/Zillow Group overlap — deduplicate against Zillow records.'),

  ('HotPads', 'hotpads', 'Seattle, WA', 'WA', 'Seattle',
   'https://hotpads.com/seattle-wa/rentals',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'HotPads/Zillow Group overlap — deduplicate against Zillow records.'),

  -- Craigslist (volatile permalinks — snapshot + re-match logic required per Phase 12)
  ('Craigslist', 'craigslist', 'Denver, CO', 'CO', 'Denver',
   'https://denver.craigslist.org/search/apa',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Craigslist listings expire ~30-45 days. Snapshot listing content at import. Enable Phase 12 re-match job. ToS review required before automated scraping.'),

  ('Craigslist', 'craigslist', 'Las Vegas, NV', 'NV', 'Las Vegas',
   'https://lasvegas.craigslist.org/search/apa',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Volatile permalinks — snapshot at import. Phase 12 re-match logic applies.'),

  ('Craigslist', 'craigslist', 'Los Angeles, CA', 'CA', 'Los Angeles',
   'https://losangeles.craigslist.org/search/apa',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Volatile permalinks — snapshot at import. Phase 12 re-match logic applies.'),

  ('Craigslist', 'craigslist', 'Seattle, WA', 'WA', 'Seattle',
   'https://seattle.craigslist.org/search/apa',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Volatile permalinks — snapshot at import. Phase 12 re-match logic applies.'),

  ('Craigslist', 'craigslist', 'Miami, FL', 'FL', 'Miami',
   'https://miami.craigslist.org/search/apa',
   ARRAY[]::TEXT[], false, 'manual', 'pending', true,
   'Volatile permalinks — snapshot at import. Phase 12 re-match logic applies.'),

  -- Apartments.com
  ('Apartments.com', 'apartments', 'Denver, CO', 'CO', 'Denver',
   'https://www.apartments.com/denver-co/furnished-apartments/',
   ARRAY['apartment','condo','townhouse'], true, 'manual', 'pending', true,
   'Confirm individual listing permalink capture before enabling automated sync.'),

  ('Apartments.com', 'apartments', 'Las Vegas, NV', 'NV', 'Las Vegas',
   'https://www.apartments.com/las-vegas-nv/furnished-apartments/',
   ARRAY[]::TEXT[], true, 'manual', 'pending', true,
   'Manual import. Verify per-property listing_url at import time.'),

  ('Apartments.com', 'apartments', 'Los Angeles, CA', 'CA', 'Los Angeles',
   'https://www.apartments.com/los-angeles-ca/furnished-apartments/',
   ARRAY[]::TEXT[], true, 'manual', 'pending', true,
   'Manual import. Verify per-property listing_url at import time.'),

  ('Apartments.com', 'apartments', 'Seattle, WA', 'WA', 'Seattle',
   'https://www.apartments.com/seattle-wa/furnished-apartments/',
   ARRAY[]::TEXT[], true, 'manual', 'pending', true,
   'Manual import. Verify per-property listing_url at import time.'),

  ('Apartments.com', 'apartments', 'Miami, FL', 'FL', 'Miami',
   'https://www.apartments.com/miami-fl/furnished-apartments/',
   ARRAY[]::TEXT[], true, 'manual', 'pending', true,
   'Manual import. Verify per-property listing_url at import time.')

ON CONFLICT DO NOTHING;
