-- Fix: Ensure enrichment_status column exists on lead_enrichments
-- This migration safely restores any columns that may have been dropped
-- by the CASCADE in the previous migration, without dropping types again.

DO $$
BEGIN
  -- Restore enrichment_status_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'enrichment_status_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.enrichment_status_type AS ENUM ('Not Enriched', 'Partial', 'Complete');
  END IF;

  -- Restore ownership_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'ownership_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.ownership_type AS ENUM ('Individual', 'LLC', 'Trust', 'Other', 'Unknown');
  END IF;

  -- Restore enrichment_stage if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'enrichment_stage' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.enrichment_stage AS ENUM ('stage1', 'stage2', 'stage3');
  END IF;

  -- Restore contact_verified_status if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'contact_verified_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.contact_verified_status AS ENUM ('Verified', 'Unverified');
  END IF;
END $$;

-- Restore enrichment_status column on lead_enrichments if missing
ALTER TABLE public.lead_enrichments
  ADD COLUMN IF NOT EXISTS enrichment_status public.enrichment_status_type DEFAULT 'Not Enriched';

-- Restore ownership_type column on lead_enrichments if missing
ALTER TABLE public.lead_enrichments
  ADD COLUMN IF NOT EXISTS ownership_type public.ownership_type DEFAULT 'Unknown';

-- Restore stage column on enriched_emails if missing
ALTER TABLE public.enriched_emails
  ADD COLUMN IF NOT EXISTS stage public.enrichment_stage DEFAULT 'stage2';

-- Restore verified_status column on enriched_emails if missing
ALTER TABLE public.enriched_emails
  ADD COLUMN IF NOT EXISTS verified_status public.contact_verified_status DEFAULT 'Unverified';

-- Restore stage column on enriched_phones if missing
ALTER TABLE public.enriched_phones
  ADD COLUMN IF NOT EXISTS stage public.enrichment_stage DEFAULT 'stage2';

-- Restore verified_status column on enriched_phones if missing
ALTER TABLE public.enriched_phones
  ADD COLUMN IF NOT EXISTS verified_status public.contact_verified_status DEFAULT 'Unverified';

-- Restore stage column on enrichment_api_logs if missing
ALTER TABLE public.enrichment_api_logs
  ADD COLUMN IF NOT EXISTS stage public.enrichment_stage;
