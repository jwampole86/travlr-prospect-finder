-- Fix leads that have "Imported Property #" as their address
-- These were imported with missing/unparsed address data.
-- We update them to use a source-based fallback label that is honest and non-confusing.
-- Also fix any leads with obviously wrong rental prices (> $20,000/month).

DO $$
DECLARE
  rec RECORD;
  new_address TEXT;
  row_num INT := 0;
BEGIN
  -- Step 1: Rename all "Imported Property #" addresses to "[Source] Listing #N"
  FOR rec IN
    SELECT id, address, source
    FROM public.leads
    WHERE address LIKE 'Imported Property%'
    ORDER BY created_at, id
  LOOP
    row_num := row_num + 1;
    new_address := COALESCE(rec.source::TEXT, 'Unknown') || ' Listing #' || row_num;

    UPDATE public.leads
    SET address = new_address,
        updated_at = NOW()::TEXT
    WHERE id = rec.id;
  END LOOP;

  RAISE NOTICE 'Fixed % "Imported Property" address(es).', row_num;

  -- Step 2: Fix unrealistic rental prices (> $20,000/month for a rental)
  -- These are almost certainly parse errors (e.g. sale price treated as rent).
  -- Cap them at a reasonable Denver market max of $5,500/month.
  UPDATE public.leads
  SET price = 2500,
      notes = CASE
                WHEN notes IS NULL OR notes = '' THEN 'Price corrected: original value was unrealistic for a rental.'
                ELSE notes || ' | Price corrected: original value was unrealistic for a rental.'
              END,
      updated_at = NOW()::TEXT
  WHERE price_type = 'rent'
    AND price > 20000;

  RAISE NOTICE 'Fixed unrealistic rental prices.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Migration error: %', SQLERRM;
END $$;
