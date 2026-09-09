-- Migration: Upsert all 25 CSV-represented state portfolios + backfill portfolio assignments
-- Timestamp: 20260904500000

-- ─── 1. Ensure portfolio_registry table exists (idempotent) ──────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      TEXT NOT NULL,
  state_name      TEXT NOT NULL,
  portfolio_key   TEXT NOT NULL,
  portfolio_label TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  auto_created    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on state_code (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_registry_state_code_key'
  ) THEN
    ALTER TABLE public.portfolio_registry
      ADD CONSTRAINT portfolio_registry_state_code_key UNIQUE (state_code);
  END IF;
END $$;

-- Unique constraint on portfolio_key (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_registry_portfolio_key_key'
  ) THEN
    ALTER TABLE public.portfolio_registry
      ADD CONSTRAINT portfolio_registry_portfolio_key_key UNIQUE (portfolio_key);
  END IF;
END $$;

-- ─── 2. Upsert all 25 CSV-represented state portfolios ───────────────────────
-- Uses ON CONFLICT DO UPDATE so existing portfolios are preserved and activated.
-- DO NOT delete any existing portfolios.

INSERT INTO public.portfolio_registry (state_code, state_name, portfolio_key, portfolio_label, is_active, auto_created)
VALUES
  ('AZ', 'Arizona',        'az', 'Arizona Portfolio',        true, false),
  ('CA', 'California',     'ca', 'California Portfolio',     true, false),
  ('CO', 'Colorado',       'co', 'Colorado Portfolio',       true, false),
  ('FL', 'Florida',        'fl', 'Florida Portfolio',        true, false),
  ('GA', 'Georgia',        'ga', 'Georgia Portfolio',        true, false),
  ('ID', 'Idaho',          'id', 'Idaho Portfolio',          true, false),
  ('KS', 'Kansas',         'ks', 'Kansas Portfolio',         true, false),
  ('MA', 'Massachusetts',  'ma', 'Massachusetts Portfolio',  true, false),
  ('ME', 'Maine',          'me', 'Maine Portfolio',          true, false),
  ('MO', 'Missouri',       'mo', 'Missouri Portfolio',       true, false),
  ('MT', 'Montana',        'mt', 'Montana Portfolio',        true, false),
  ('NC', 'North Carolina', 'nc', 'North Carolina Portfolio', true, false),
  ('NE', 'Nebraska',       'ne', 'Nebraska Portfolio',       true, false),
  ('NH', 'New Hampshire',  'nh', 'New Hampshire Portfolio',  true, false),
  ('NJ', 'New Jersey',     'nj', 'New Jersey Portfolio',     true, false),
  ('NM', 'New Mexico',     'nm', 'New Mexico Portfolio',     true, false),
  ('NV', 'Nevada',         'nv', 'Nevada Portfolio',         true, false),
  ('NY', 'New York',       'ny', 'New York Portfolio',       true, false),
  ('OR', 'Oregon',         'or', 'Oregon Portfolio',         true, false),
  ('TX', 'Texas',          'tx', 'Texas Portfolio',          true, false),
  ('UT', 'Utah',           'ut', 'Utah Portfolio',           true, false),
  ('VT', 'Vermont',        'vt', 'Vermont Portfolio',        true, false),
  ('WA', 'Washington',     'wa', 'Washington Portfolio',     true, false),
  ('WI', 'Wisconsin',      'wi', 'Wisconsin Portfolio',      true, false),
  ('WY', 'Wyoming',        'wy', 'Wyoming Portfolio',        true, false)
ON CONFLICT (state_code) DO UPDATE SET
  is_active       = true,
  portfolio_label = EXCLUDED.portfolio_label,
  portfolio_key   = EXCLUDED.portfolio_key,
  updated_at      = now();

-- Also upsert the existing Maryland portfolio (preserve it)
INSERT INTO public.portfolio_registry (state_code, state_name, portfolio_key, portfolio_label, is_active, auto_created)
VALUES ('MD', 'Maryland', 'md', 'Maryland Portfolio', true, false)
ON CONFLICT (state_code) DO UPDATE SET
  is_active  = true,
  updated_at = now();

-- ─── 3. Backfill portfolio_id on leads that have a state but no portfolio_id ─
-- For every lead with a known state code, assign the correct portfolio_key.
-- NEVER deletes leads. NEVER changes agent assignments, notes, or history.
-- Only sets portfolio_id / portfolio_name when they are missing or incorrect.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT pr.state_code, pr.portfolio_key, pr.portfolio_label
    FROM public.portfolio_registry pr
    WHERE pr.is_active = true
  LOOP
    -- Update leads whose state matches but portfolio_id is wrong or missing
    UPDATE public.leads
    SET
      portfolio_id   = rec.portfolio_key,
      portfolio_name = rec.portfolio_label,
      updated_at     = now()
    WHERE
      UPPER(TRIM(state)) = rec.state_code
      AND (
        portfolio_id IS NULL
        OR portfolio_id = ''
        OR portfolio_id != rec.portfolio_key
      );
  END LOOP;
END $$;

-- ─── 4. Index for fast portfolio lookups ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portfolio_registry_state_code ON public.portfolio_registry (state_code);
CREATE INDEX IF NOT EXISTS idx_portfolio_registry_is_active  ON public.portfolio_registry (is_active);
CREATE INDEX IF NOT EXISTS idx_leads_portfolio_id            ON public.leads (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_leads_state_upper             ON public.leads (UPPER(state));

-- ─── 5. RLS: allow authenticated users to read portfolio_registry ─────────────
ALTER TABLE public.portfolio_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portfolio_registry' AND policyname = 'portfolio_registry_read_authenticated'
  ) THEN
    CREATE POLICY portfolio_registry_read_authenticated
      ON public.portfolio_registry
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portfolio_registry' AND policyname = 'portfolio_registry_insert_authenticated'
  ) THEN
    CREATE POLICY portfolio_registry_insert_authenticated
      ON public.portfolio_registry
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portfolio_registry' AND policyname = 'portfolio_registry_update_authenticated'
  ) THEN
    CREATE POLICY portfolio_registry_update_authenticated
      ON public.portfolio_registry
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
