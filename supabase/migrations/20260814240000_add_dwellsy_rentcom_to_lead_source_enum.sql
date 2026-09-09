-- Fix: Add Dwellsy and Rent.com to lead_source enum
-- Root cause: sync/execute route generates leads with source='Dwellsy' and source='Rent.com'
-- but these values were missing from the enum, causing batch insert failures.
-- Each failed batch was counted as an error and pushed to ALL portfolios,
-- producing the identical "9 errors" pattern across every portfolio.

DO $$
BEGIN
  -- Add Dwellsy
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Dwellsy'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Dwellsy';
  END IF;

  -- Add Rent.com
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Rent.com'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Rent.com';
  END IF;

  -- Add PadMapper (also used in sync but not in enum)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'PadMapper'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'PadMapper';
  END IF;

  -- Add Apartment List (also used in sync but not in enum)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Apartment List'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Apartment List';
  END IF;
END $$;
