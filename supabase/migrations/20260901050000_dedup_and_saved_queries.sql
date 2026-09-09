-- ============================================================
-- Migration: Robust deduplication + saved_queries table
-- ============================================================

-- 1. Add a normalized address fingerprint column for dedup
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address_fingerprint TEXT GENERATED ALWAYS AS (
    lower(trim(regexp_replace(address, '\s+', ' ', 'g')))
    || '|' || lower(trim(city))
    || '|' || lower(trim(state))
  ) STORED;

-- 2. Clean up existing duplicates BEFORE creating the unique index
--    Keep the row with the highest prospect_score
--    (or most recently updated if scores are equal)
DELETE FROM leads
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) || '|' || lower(trim(city)) || '|' || lower(trim(state))
        ORDER BY prospect_score DESC NULLS LAST, updated_at DESC NULLS LAST
      ) AS rn
    FROM leads
    WHERE address IS NOT NULL AND address <> ''
      AND city    IS NOT NULL AND city    <> ''
      AND state   IS NOT NULL AND state   <> ''
  ) ranked
  WHERE rn > 1
);

-- 3. Now create the unique index — duplicates have been removed so this will succeed
--    We use a partial index to skip rows with empty address/city/state
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_address_fingerprint
  ON leads (address_fingerprint)
  WHERE address IS NOT NULL AND address <> '' AND city IS NOT NULL AND city <> '' AND state IS NOT NULL AND state <> '';

-- 4. Create saved_queries table for operator named lead queries
CREATE TABLE IF NOT EXISTS saved_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  filters     JSONB NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  color       TEXT DEFAULT 'blue',
  icon        TEXT DEFAULT 'bookmark',
  use_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS for saved_queries
ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_queries' AND policyname = 'saved_queries_select'
  ) THEN
    CREATE POLICY saved_queries_select ON saved_queries
      FOR SELECT USING (user_id = auth.uid() OR is_shared = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_queries' AND policyname = 'saved_queries_insert'
  ) THEN
    CREATE POLICY saved_queries_insert ON saved_queries
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_queries' AND policyname = 'saved_queries_update'
  ) THEN
    CREATE POLICY saved_queries_update ON saved_queries
      FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_queries' AND policyname = 'saved_queries_delete'
  ) THEN
    CREATE POLICY saved_queries_delete ON saved_queries
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- 6. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_saved_queries_user_id ON saved_queries (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_shared ON saved_queries (is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_saved_queries_pinned ON saved_queries (user_id, is_pinned) WHERE is_pinned = true;
