-- Expand lead_source enum to include additional listing platforms
-- Uses ALTER TYPE ... ADD VALUE to safely add new values without dropping the enum

DO $$
BEGIN
  -- Add HotPads
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'HotPads'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'HotPads';
  END IF;

  -- Add Apartments.com
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Apartments.com'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Apartments.com';
  END IF;

  -- Add Trulia
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Trulia'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Trulia';
  END IF;

  -- Add Redfin
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Redfin'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Redfin';
  END IF;

  -- Add MLS
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'MLS'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'MLS';
  END IF;

  -- Add Airbnb
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Airbnb'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Airbnb';
  END IF;

  -- Add VRBO
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'VRBO'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'VRBO';
  END IF;

  -- Add Other
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.lead_source'::regtype
      AND enumlabel = 'Other'
  ) THEN
    ALTER TYPE public.lead_source ADD VALUE 'Other';
  END IF;
END $$;
