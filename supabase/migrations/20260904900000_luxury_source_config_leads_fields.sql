-- Migration: Luxury Source Config + Luxury Lead Fields + RPCs + Source Seeding
-- Timestamp: 20260904900000
-- ADDITIVE ONLY — never deletes existing leads, CSV data, or source associations.

-- ─── 1. Create trulia_source_configs table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trulia_source_configs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id               TEXT NOT NULL,
  source_type             TEXT NOT NULL DEFAULT 'TRULIA_SOURCE_LINK',
  source_name             TEXT NOT NULL,
  state_code              TEXT NOT NULL,
  source_url              TEXT NOT NULL,
  source_tier             TEXT NOT NULL DEFAULT 'STANDARD', -- 'STANDARD' | 'LUXURY'
  minimum_monthly_rent    INTEGER NOT NULL DEFAULT 5000,
  luxury_source           BOOLEAN NOT NULL DEFAULT false,
  active                  BOOLEAN NOT NULL DEFAULT true,
  last_synced_at          TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_error              TEXT,
  listings_fetched        INTEGER NOT NULL DEFAULT 0,
  unique_properties       INTEGER NOT NULL DEFAULT 0,
  new_prospects           INTEGER NOT NULL DEFAULT 0,
  existing_matches        INTEGER NOT NULL DEFAULT 0,
  csv_matches             INTEGER NOT NULL DEFAULT 0,
  duplicates_prevented    INTEGER NOT NULL DEFAULT 0,
  sync_status             TEXT NOT NULL DEFAULT 'PENDING',
  -- sync_status: PENDING | SUCCESS | NO_DATA | PARTIAL | CONFIGURATION_ERROR | SOURCE_ERROR | RATE_LIMITED | TIMEOUT | SOURCE_UNAVAILABLE
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on source_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trulia_source_configs_source_id_key'
  ) THEN
    ALTER TABLE public.trulia_source_configs
      ADD CONSTRAINT trulia_source_configs_source_id_key UNIQUE (source_id);
  END IF;
END $$;

-- Unique constraint on normalized source_url (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trulia_source_configs_source_url_key'
  ) THEN
    ALTER TABLE public.trulia_source_configs
      ADD CONSTRAINT trulia_source_configs_source_url_key UNIQUE (source_url);
  END IF;
END $$;

-- RLS: allow authenticated reads, service-role writes
ALTER TABLE public.trulia_source_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trulia_source_configs' AND policyname = 'trulia_source_configs_select_authenticated'
  ) THEN
    CREATE POLICY trulia_source_configs_select_authenticated
      ON public.trulia_source_configs FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trulia_source_configs' AND policyname = 'trulia_source_configs_select_anon'
  ) THEN
    CREATE POLICY trulia_source_configs_select_anon
      ON public.trulia_source_configs FOR SELECT
      TO anon USING (true);
  END IF;
END $$;

-- ─── 2. Add luxury + verification fields to leads (idempotent) ───────────────

-- luxury: true when ANY active source association is a luxury source
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='luxury') THEN
    ALTER TABLE public.leads ADD COLUMN luxury BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- luxury_source_ids: array of trulia_source_configs.source_id values
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='luxury_source_ids') THEN
    ALTER TABLE public.leads ADD COLUMN luxury_source_ids TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- verified_owner: manually researched owner present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_owner') THEN
    ALTER TABLE public.leads ADD COLUMN verified_owner BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- verified_number: manually researched phone present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_number') THEN
    ALTER TABLE public.leads ADD COLUMN verified_number BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- verified_number_source: e.g. 'MANUAL_CSV'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_number_source') THEN
    ALTER TABLE public.leads ADD COLUMN verified_number_source TEXT;
  END IF;
END $$;

-- verified_number_method: e.g. 'MANUAL_RESEARCH'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_number_method') THEN
    ALTER TABLE public.leads ADD COLUMN verified_number_method TEXT;
  END IF;
END $$;

-- verified_number_at: timestamp when verified
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_number_at') THEN
    ALTER TABLE public.leads ADD COLUMN verified_number_at TIMESTAMPTZ;
  END IF;
END $$;

-- verified_owner_source: e.g. 'MANUAL_CSV'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_owner_source') THEN
    ALTER TABLE public.leads ADD COLUMN verified_owner_source TEXT;
  END IF;
END $$;

-- verified_owner_method: e.g. 'MANUAL_RESEARCH'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='verified_owner_method') THEN
    ALTER TABLE public.leads ADD COLUMN verified_owner_method TEXT;
  END IF;
END $$;

-- fully_verified: derived = verified_owner AND verified_address AND verified_number
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fully_verified') THEN
    ALTER TABLE public.leads ADD COLUMN fully_verified BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- priority_tier: 1 = Luxury+FullyVerified, 2 = FullyVerified, 3 = Standard
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='priority_tier') THEN
    ALTER TABLE public.leads ADD COLUMN priority_tier INTEGER NOT NULL DEFAULT 3;
  END IF;
END $$;

-- Field-level provenance
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='address_source') THEN
    ALTER TABLE public.leads ADD COLUMN address_source TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='owner_source') THEN
    ALTER TABLE public.leads ADD COLUMN owner_source TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='phone_source') THEN
    ALTER TABLE public.leads ADD COLUMN phone_source TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='rent_source') THEN
    ALTER TABLE public.leads ADD COLUMN rent_source TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='luxury_source_field') THEN
    ALTER TABLE public.leads ADD COLUMN luxury_source_field TEXT DEFAULT 'SOURCE_CONFIGURATION';
  END IF;
END $$;

-- ─── 3. Composite indexes for luxury queries ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_luxury
  ON public.leads (luxury)
  WHERE luxury = true;

CREATE INDEX IF NOT EXISTS idx_leads_luxury_fully_verified_priority
  ON public.leads (luxury, fully_verified, priority_tier)
  WHERE luxury = true;

CREATE INDEX IF NOT EXISTS idx_leads_luxury_verified_number
  ON public.leads (luxury, verified_number)
  WHERE luxury = true AND verified_number = true;

CREATE INDEX IF NOT EXISTS idx_leads_fully_verified
  ON public.leads (fully_verified)
  WHERE fully_verified = true;

CREATE INDEX IF NOT EXISTS idx_leads_verified_number
  ON public.leads (verified_number)
  WHERE verified_number = true;

CREATE INDEX IF NOT EXISTS idx_leads_priority_tier
  ON public.leads (priority_tier);

CREATE INDEX IF NOT EXISTS idx_leads_portfolio_luxury_priority
  ON public.leads (portfolio_id, luxury, priority_tier)
  WHERE luxury = true;

-- ─── 4. Seed all Trulia source URLs from the PDF ─────────────────────────────
-- Normalized to https://www.trulia.com/... canonical format.
-- source_tier: STANDARD (5000) or LUXURY (10000+).
-- luxury_source: false for STANDARD, true for LUXURY.
-- minimumMonthlyRent is stored separately from luxury_source classification.

INSERT INTO public.trulia_source_configs
  (source_id, source_type, source_name, state_code, source_url, source_tier, minimum_monthly_rent, luxury_source, active)
VALUES
  -- AZ
  ('trulia_AZ_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia AZ Standard $5K+',  'AZ', 'https://www.trulia.com/for_rent/AZ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_AZ_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia AZ Luxury $15K+',   'AZ', 'https://www.trulia.com/for_rent/AZ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- CA
  ('trulia_CA_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia CA Standard $5K+',  'CA', 'https://www.trulia.com/for_rent/CA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_CA_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia CA Luxury $15K+',   'CA', 'https://www.trulia.com/for_rent/CA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- CO
  ('trulia_CO_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia CO Standard $5K+',  'CO', 'https://www.trulia.com/for_rent/CO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_CO_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia CO Luxury $15K+',   'CO', 'https://www.trulia.com/for_rent/CO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- FL
  ('trulia_FL_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia FL Standard $5K+',  'FL', 'https://www.trulia.com/for_rent/FL/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_FL_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia FL Luxury $15K+',   'FL', 'https://www.trulia.com/for_rent/FL/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- GA
  ('trulia_GA_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia GA Standard $5K+',  'GA', 'https://www.trulia.com/for_rent/GA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_GA_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia GA Luxury $15K+',   'GA', 'https://www.trulia.com/for_rent/GA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- ID
  ('trulia_ID_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia ID Standard $5K+',  'ID', 'https://www.trulia.com/for_rent/ID/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_ID_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia ID Luxury $15K+',   'ID', 'https://www.trulia.com/for_rent/ID/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- KS
  ('trulia_KS_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia KS Standard $5K+',  'KS', 'https://www.trulia.com/for_rent/KS/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_KS_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia KS Luxury $15K+',   'KS', 'https://www.trulia.com/for_rent/KS/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- MA (two luxury tiers)
  ('trulia_MA_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia MA Standard $5K+',  'MA', 'https://www.trulia.com/for_rent/MA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_MA_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MA Luxury $15K+',   'MA', 'https://www.trulia.com/for_rent/MA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  ('trulia_MA_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MA Luxury $10K+',   'MA', 'https://www.trulia.com/for_rent/MA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  -- MD
  ('trulia_MD_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia MD Standard $5K+',  'MD', 'https://www.trulia.com/for_rent/MD/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_MD_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MD Luxury $10K+',   'MD', 'https://www.trulia.com/for_rent/MD/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  -- MN
  ('trulia_MN_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia MN Standard $5K+',  'MN', 'https://www.trulia.com/for_rent/MN/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_MN_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MN Luxury $10K+',   'MN', 'https://www.trulia.com/for_rent/MN/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  -- MO (two luxury tiers)
  ('trulia_MO_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia MO Standard $5K+',  'MO', 'https://www.trulia.com/for_rent/MO/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_MO_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MO Luxury $10K+',   'MO', 'https://www.trulia.com/for_rent/MO/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_MO_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MO Luxury $15K+',   'MO', 'https://www.trulia.com/for_rent/MO/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- MT (two luxury tiers)
  ('trulia_MT_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia MT Standard $5K+',  'MT', 'https://www.trulia.com/for_rent/MT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_MT_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MT Luxury $10K+',   'MT', 'https://www.trulia.com/for_rent/MT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_MT_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia MT Luxury $15K+',   'MT', 'https://www.trulia.com/for_rent/MT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NE (unique $7500 luxury tier + $10K)
  ('trulia_NE_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NE Standard $5K+',  'NE', 'https://www.trulia.com/for_rent/NE/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NE_7500_luxury',    'TRULIA_SOURCE_LINK', 'Trulia NE Luxury $7.5K+',  'NE', 'https://www.trulia.com/for_rent/NE/7500p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'LUXURY',   7500,  true,  true),
  ('trulia_NE_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NE Luxury $10K+',   'NE', 'https://www.trulia.com/for_rent/NE/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  -- NH (two luxury tiers)
  ('trulia_NH_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NH Standard $5K+',  'NH', 'https://www.trulia.com/for_rent/NH/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NH_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NH Luxury $10K+',   'NH', 'https://www.trulia.com/for_rent/NH/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_NH_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NH Luxury $15K+',   'NH', 'https://www.trulia.com/for_rent/NH/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NJ (two luxury tiers)
  ('trulia_NJ_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NJ Standard $5K+',  'NJ', 'https://www.trulia.com/for_rent/NJ/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NJ_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NJ Luxury $10K+',   'NJ', 'https://www.trulia.com/for_rent/NJ/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_NJ_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NJ Luxury $15K+',   'NJ', 'https://www.trulia.com/for_rent/NJ/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NM (two luxury tiers)
  ('trulia_NM_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NM Standard $5K+',  'NM', 'https://www.trulia.com/for_rent/NM/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NM_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NM Luxury $10K+',   'NM', 'https://www.trulia.com/for_rent/NM/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_NM_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NM Luxury $15K+',   'NM', 'https://www.trulia.com/for_rent/NM/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NV (two luxury tiers)
  ('trulia_NV_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NV Standard $5K+',  'NV', 'https://www.trulia.com/for_rent/NV/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NV_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NV Luxury $10K+',   'NV', 'https://www.trulia.com/for_rent/NV/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_NV_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NV Luxury $15K+',   'NV', 'https://www.trulia.com/for_rent/NV/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NY
  ('trulia_NY_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NY Standard $5K+',  'NY', 'https://www.trulia.com/for_rent/NY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NY_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NY Luxury $15K+',   'NY', 'https://www.trulia.com/for_rent/NY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- NC (two luxury tiers — normalized from bare trulia.com/ prefix)
  ('trulia_NC_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia NC Standard $5K+',  'NC', 'https://www.trulia.com/for_rent/NC/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_NC_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NC Luxury $10K+',   'NC', 'https://www.trulia.com/for_rent/NC/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_NC_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia NC Luxury $15K+',   'NC', 'https://www.trulia.com/for_rent/NC/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- OR (two luxury tiers)
  ('trulia_OR_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia OR Standard $5K+',  'OR', 'https://www.trulia.com/for_rent/OR/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_OR_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia OR Luxury $10K+',   'OR', 'https://www.trulia.com/for_rent/OR/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_OR_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia OR Luxury $15K+',   'OR', 'https://www.trulia.com/for_rent/OR/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- TX (two luxury tiers — normalized from bare trulia.com/ prefix)
  ('trulia_TX_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia TX Standard $5K+',  'TX', 'https://www.trulia.com/for_rent/TX/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_TX_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia TX Luxury $10K+',   'TX', 'https://www.trulia.com/for_rent/TX/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_TX_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia TX Luxury $15K+',   'TX', 'https://www.trulia.com/for_rent/TX/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- UT (two luxury tiers)
  ('trulia_UT_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia UT Standard $5K+',  'UT', 'https://www.trulia.com/for_rent/UT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_UT_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia UT Luxury $10K+',   'UT', 'https://www.trulia.com/for_rent/UT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_UT_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia UT Luxury $15K+',   'UT', 'https://www.trulia.com/for_rent/UT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- VT (two luxury tiers)
  ('trulia_VT_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia VT Standard $5K+',  'VT', 'https://www.trulia.com/for_rent/VT/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_VT_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia VT Luxury $10K+',   'VT', 'https://www.trulia.com/for_rent/VT/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_VT_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia VT Luxury $15K+',   'VT', 'https://www.trulia.com/for_rent/VT/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- WA (two luxury tiers — normalized from bare trulia.com/ prefix)
  ('trulia_WA_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia WA Standard $5K+',  'WA', 'https://www.trulia.com/for_rent/WA/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_WA_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WA Luxury $10K+',   'WA', 'https://www.trulia.com/for_rent/WA/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_WA_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WA Luxury $15K+',   'WA', 'https://www.trulia.com/for_rent/WA/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- WI (two luxury tiers)
  ('trulia_WI_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia WI Standard $5K+',  'WI', 'https://www.trulia.com/for_rent/WI/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_WI_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WI Luxury $10K+',   'WI', 'https://www.trulia.com/for_rent/WI/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_WI_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WI Luxury $15K+',   'WI', 'https://www.trulia.com/for_rent/WI/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true),
  -- WY (two luxury tiers)
  ('trulia_WY_5000_standard',  'TRULIA_SOURCE_LINK', 'Trulia WY Standard $5K+',  'WY', 'https://www.trulia.com/for_rent/WY/5000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',  'STANDARD', 5000,  false, true),
  ('trulia_WY_10000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WY Luxury $10K+',   'WY', 'https://www.trulia.com/for_rent/WY/10000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   10000, true,  true),
  ('trulia_WY_15000_luxury',   'TRULIA_SOURCE_LINK', 'Trulia WY Luxury $15K+',   'WY', 'https://www.trulia.com/for_rent/WY/15000p_price/SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/', 'LUXURY',   15000, true,  true)
ON CONFLICT (source_id) DO UPDATE SET
  source_url           = EXCLUDED.source_url,
  source_tier          = EXCLUDED.source_tier,
  minimum_monthly_rent = EXCLUDED.minimum_monthly_rent,
  luxury_source        = EXCLUDED.luxury_source,
  active               = EXCLUDED.active,
  updated_at           = now();

-- ─── 5. Backfill luxury=true on existing leads in luxury-source states ────────
-- A lead in a luxury-source state with price >= the lowest luxury threshold for
-- that state is classified as luxury. This is a conservative backfill — it marks
-- leads that clearly qualify. Future source syncs will set luxury_source_ids precisely.
-- NEVER resets: stage, agent, notes, outreach history, createdAt, verification.

DO $$
DECLARE
  luxury_states TEXT[] := ARRAY['AZ','CA','CO','FL','GA','ID','KS','MA','MD','MN','MO','MT',
                                 'NC','NE','NH','NJ','NM','NV','NY','OR','TX','UT','VT','WA','WI','WY'];
  -- Per-state minimum luxury rent thresholds (lowest luxury tier per state)
  state_code_val TEXT;
  min_rent_val   INTEGER;
BEGIN
  -- AZ: $15K
  UPDATE public.leads SET
    luxury = true,
    luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE
      WHEN (luxury = true OR price >= 15000) AND COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
      WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
      WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2
      ELSE 3
    END
  WHERE state = 'AZ' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- CA: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'CA' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- CO: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'CO' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- FL: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'FL' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- GA: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'GA' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- ID: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'ID' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- KS: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'KS' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- MA: $10K (lowest luxury tier)
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'MA' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- MD: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'MD' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- MN: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'MN' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- MO: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'MO' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- MT: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'MT' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NC: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NC' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NE: $7500 (lowest luxury tier)
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NE' AND price >= 7500 AND COALESCE(is_synthetic, false) = false;

  -- NH: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NH' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NJ: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NJ' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NM: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NM' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NV: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NV' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- NY: $15K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'NY' AND price >= 15000 AND COALESCE(is_synthetic, false) = false;

  -- OR: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'OR' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- TX: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'TX' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- UT: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'UT' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- VT: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'VT' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- WA: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'WA' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- WI: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'WI' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

  -- WY: $10K
  UPDATE public.leads SET luxury = true, luxury_source_field = 'SOURCE_CONFIGURATION',
    priority_tier = CASE WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number,false) THEN 1 WHEN COALESCE(verified_owner,false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2 ELSE 3 END
  WHERE state = 'WY' AND price >= 10000 AND COALESCE(is_synthetic, false) = false;

END $$;

-- ─── 6. Backfill priority_tier for ALL existing leads ────────────────────────
-- fully_verified is a generated column — it auto-derives from verified_owner,
-- verified_address, and verified_number. Only priority_tier needs explicit update.
UPDATE public.leads
SET
  priority_tier = CASE
    WHEN luxury = true AND COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
    WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
    WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2
    ELSE 3
  END
WHERE COALESCE(is_synthetic, false) = false;

-- ─── 7. Backfill verified_owner + verified_number for existing CSV leads ──────
-- Any lead imported from CSV that has contact_name → verified_owner = true
-- Any lead imported from CSV that has contact_phone → verified_number = true
-- NEVER overwrites a value that is already true (additive only).
UPDATE public.leads
SET
  verified_owner        = true,
  verified_owner_source = COALESCE(verified_owner_source, 'MANUAL_CSV'),
  verified_owner_method = COALESCE(verified_owner_method, 'MANUAL_RESEARCH'),
  owner_source          = COALESCE(owner_source, 'MANUAL_CSV')
WHERE
  COALESCE(ingestion_source, '') = 'MANUAL_CSV'
  AND contact_name IS NOT NULL
  AND contact_name <> ''
  AND COALESCE(is_synthetic, false) = false;

UPDATE public.leads
SET
  verified_number        = true,
  verified_number_source = COALESCE(verified_number_source, 'MANUAL_CSV'),
  verified_number_method = COALESCE(verified_number_method, 'MANUAL_RESEARCH'),
  verified_number_at     = COALESCE(verified_number_at, now()),
  phone_source           = COALESCE(phone_source, 'MANUAL_CSV'),
  has_phone              = true
WHERE
  COALESCE(ingestion_source, '') = 'MANUAL_CSV'
  AND contact_phone IS NOT NULL
  AND contact_phone <> ''
  AND COALESCE(is_synthetic, false) = false;

-- Re-derive priority_tier after CSV backfill
-- (fully_verified is generated and auto-updates when verified_owner/verified_number change)
UPDATE public.leads
SET
  priority_tier = CASE
    WHEN luxury = true AND COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
    WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') AND COALESCE(verified_number, false) THEN 1
    WHEN COALESCE(verified_owner, false) AND (verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false') THEN 2
    ELSE 3
  END
WHERE COALESCE(is_synthetic, false) = false;

-- ─── 8. RPCs for luxury KPI counts ───────────────────────────────────────────

-- Luxury prospects count
CREATE OR REPLACE FUNCTION public.get_luxury_prospects_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE luxury = true
    AND COALESCE(is_synthetic, false) = false
    AND (p_state = 'all' OR state = p_state);
$$;

-- Luxury + Fully Verified count
CREATE OR REPLACE FUNCTION public.get_luxury_fully_verified_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE luxury = true
    AND fully_verified = true
    AND COALESCE(is_synthetic, false) = false
    AND (p_state = 'all' OR state = p_state);
$$;

-- Luxury + Verified Number count
CREATE OR REPLACE FUNCTION public.get_luxury_verified_number_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE luxury = true
    AND verified_number = true
    AND COALESCE(is_synthetic, false) = false
    AND (p_state = 'all' OR state = p_state);
$$;

-- Luxury + High Priority (priority_tier = 1) count
CREATE OR REPLACE FUNCTION public.get_luxury_priority_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE luxury = true
    AND priority_tier = 1
    AND COALESCE(is_synthetic, false) = false
    AND (p_state = 'all' OR state = p_state);
$$;

-- Luxury + High Priority + Unassigned count
CREATE OR REPLACE FUNCTION public.get_luxury_unassigned_priority_count(p_state TEXT DEFAULT 'all')
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.leads
  WHERE luxury = true
    AND priority_tier = 1
    AND primary_agent_id IS NULL
    AND COALESCE(is_synthetic, false) = false
    AND (p_state = 'all' OR state = p_state);
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.get_luxury_prospects_count(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_luxury_fully_verified_count(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_luxury_verified_number_count(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_luxury_priority_count(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_luxury_unassigned_priority_count(TEXT) TO authenticated, anon;
