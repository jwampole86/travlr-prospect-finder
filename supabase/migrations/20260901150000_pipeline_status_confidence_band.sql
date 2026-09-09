-- Migration: Add pipeline_status and confidence_band to leads table
-- Also adds ownership_data and market_comparables JSONB columns

-- Add pipeline_status enum type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_status') THEN
    CREATE TYPE pipeline_status AS ENUM (
      'contacted',
      'callback_scheduled',
      'offer_sent',
      'signed',
      'rejected'
    );
  END IF;
END $$;

-- Add pipeline_status column to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_status pipeline_status NULL;

-- Add confidence_band column (computed from prospect_score, stored for fast querying)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS confidence_band TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN prospect_score >= 80 THEN 'hot'
        WHEN prospect_score >= 60 THEN 'warm'
        ELSE 'cold'
      END
    ) STORED;

-- Add ownership_data JSONB for owner records (name, mailing address, ownership type, purchase date, etc.)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ownership_data JSONB NULL;

-- Add market_comparables JSONB for nearby comparable listings
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS market_comparables JSONB NULL;

-- Add pipeline_status_updated_at timestamp
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_status_updated_at TIMESTAMPTZ NULL;

-- Index for fast hot-lead queue sorting
CREATE INDEX IF NOT EXISTS idx_leads_confidence_band ON public.leads (confidence_band, prospect_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_status ON public.leads (pipeline_status);
