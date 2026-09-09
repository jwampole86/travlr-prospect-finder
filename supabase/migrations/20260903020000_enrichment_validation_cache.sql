-- ─── Enrichment Validation Cache (7-day memoization) ────────────────────────
-- Stores Anthropic validation results keyed by lead fingerprint so identical
-- leads skip re-validation for 7 days, cutting API calls and speeding up
-- lead queue loads under concurrent agent access.

CREATE TABLE IF NOT EXISTS public.enrichment_validation_cache (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_fingerprint        text NOT NULL,
  lead_id                 text REFERENCES public.leads(id) ON DELETE CASCADE,
  ownership_confidence    integer,
  market_comp_confidence  integer,
  overall_confidence      integer,
  field_confidence_scores jsonb,
  validation_anomalies    text[],
  validation_recommendation text CHECK (validation_recommendation IN ('accept', 'review', 'reject')),
  ownership_field_scores  jsonb,
  market_comp_field_scores jsonb,
  source                  text,
  validated_at            timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Unique index on fingerprint for fast cache lookups
CREATE UNIQUE INDEX IF NOT EXISTS enrichment_validation_cache_fingerprint_idx
  ON public.enrichment_validation_cache (lead_fingerprint);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS enrichment_validation_cache_expires_idx
  ON public.enrichment_validation_cache (expires_at);

-- Index for lead_id lookups
CREATE INDEX IF NOT EXISTS enrichment_validation_cache_lead_id_idx
  ON public.enrichment_validation_cache (lead_id);

-- ─── Enrichment Validation Events (for analytics screen) ─────────────────────
-- Tracks every validation attempt: pass/fail, field scores, source, cache hits.

CREATE TABLE IF NOT EXISTS public.enrichment_validation_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 text REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_fingerprint        text,
  source                  text,
  validation_type         text NOT NULL CHECK (validation_type IN ('ownership', 'market_comp', 'combined')),
  passed                  boolean NOT NULL,
  overall_confidence      integer,
  ownership_confidence    integer,
  market_comp_confidence  integer,
  field_confidence_scores jsonb,
  anomalies               text[],
  recommendation          text CHECK (recommendation IN ('accept', 'review', 'reject')),
  cache_hit               boolean NOT NULL DEFAULT false,
  triggered_by            text DEFAULT 'sync_import',
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrichment_validation_events_created_idx
  ON public.enrichment_validation_events (created_at DESC);

CREATE INDEX IF NOT EXISTS enrichment_validation_events_source_idx
  ON public.enrichment_validation_events (source, created_at DESC);

CREATE INDEX IF NOT EXISTS enrichment_validation_events_passed_idx
  ON public.enrichment_validation_events (passed, created_at DESC);

-- Enable RLS
ALTER TABLE public.enrichment_validation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_validation_events ENABLE ROW LEVEL SECURITY;

-- RLS policies — authenticated users can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'enrichment_validation_cache' AND policyname = 'auth_all_enrichment_validation_cache'
  ) THEN
    CREATE POLICY auth_all_enrichment_validation_cache
      ON public.enrichment_validation_cache
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'enrichment_validation_events' AND policyname = 'auth_all_enrichment_validation_events'
  ) THEN
    CREATE POLICY auth_all_enrichment_validation_events
      ON public.enrichment_validation_events
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for events table
ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_validation_events;
