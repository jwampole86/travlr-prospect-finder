-- Migration: Delete all placeholder-named leads so user can re-upload clean CSVs
-- Targets: "HotPads Listing #N", "Zillow Listing #N", "Craigslist Listing #N",
--          "Other Listing #N", "Apartments.com Listing #N"
-- Also catches any remaining "Imported Property #N" or "[Source] Listing #N" patterns

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.leads
  WHERE
    address ILIKE 'HotPads Listing #%'
    OR address ILIKE 'Zillow Listing #%'
    OR address ILIKE 'Craigslist Listing #%'
    OR address ILIKE 'Other Listing #%'
    OR address ILIKE 'Apartments.com Listing #%'
    OR address ILIKE 'Imported Property #%'
    OR address ILIKE 'Imported Property %'
    OR address ~ '^.+ Listing #[0-9]+$';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % placeholder-named lead(s).', deleted_count;
END $$;
