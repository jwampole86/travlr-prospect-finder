-- Rows imported before is_apartment_community existed: apply the same rules the live importers use (building URL, #unit marker).
UPDATE public.leads
SET is_apartment_community = true
WHERE is_apartment_community IS NULL
  AND source IN ('Trulia', 'Zillow', 'PadMapper', 'HotPads', 'Craigslist')
  AND (listing_url LIKE '%trulia.com/building/%' OR address LIKE '%#%');
