-- ============================================================
-- Migration: Refresh Leads indexes + parallel sync columns
-- Timestamp: 20260825080000
-- Purpose:
--   1. Add portfolio_id, synced_at, last_enrichment_date columns
--      to the leads table so the Refresh Leads re-query can use
--      efficient composite indexes instead of full-table scans.
--   2. Create the three composite indexes requested:
--        (portfolio_id, synced_at)
--        (status/stage, portfolio_id)
--        (last_enrichment_date)
--   3. Add portfolio_sync_status table for per-portfolio parallel
--      sync job tracking so the background queue can update leads
--      as each source completes without blocking the UI.
-- ============================================================

-- ── 1. Add columns to leads ───────────────────────────────────────────────────

-- portfolio_id: maps a lead to its owning portfolio (e.g. "Colorado Portfolio")
-- Stored as TEXT to match the existing state-based portfolio naming convention.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS portfolio_id TEXT DEFAULT NULL;

-- synced_at: TIMESTAMPTZ of the last successful data-source sync that touched
-- this lead. Used by the (portfolio_id, synced_at) index to speed up the
-- "give me all leads in this portfolio that were synced after X" re-query.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NULL;

-- last_enrichment_date: TIMESTAMPTZ of the most recent enrichment run for
-- this lead. Used by the (last_enrichment_date) index to quickly find leads
-- that need re-enrichment or to sort by enrichment recency.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_enrichment_date TIMESTAMPTZ DEFAULT NULL;

-- ── 2. Backfill portfolio_id from existing state column ───────────────────────
-- Map the existing state values to portfolio names so existing leads are
-- immediately queryable via the new index without a full-table scan.
UPDATE public.leads
SET portfolio_id = CASE state
  WHEN 'CO' THEN 'Colorado Portfolio'
  WHEN 'CA' THEN 'California Portfolio'
  WHEN 'NV' THEN 'Nevada Portfolio'
  WHEN 'WA' THEN 'Washington Portfolio'
  WHEN 'TX' THEN 'Texas Portfolio'
  WHEN 'FL' THEN 'Florida Portfolio'
  WHEN 'UT' THEN 'Utah Portfolio'
  WHEN 'ME' THEN 'Maine Portfolio'
  WHEN 'OR' THEN 'Oregon Portfolio'
  WHEN 'MA' THEN 'Massachusetts Portfolio'
  ELSE NULL
END
WHERE portfolio_id IS NULL AND state IS NOT NULL;

-- ── 3. Composite indexes for Refresh Leads re-query ──────────────────────────

-- Index 1: (portfolio_id, synced_at)
-- Powers the primary Refresh Leads re-query:
--   SELECT * FROM leads WHERE portfolio_id = $1 ORDER BY synced_at DESC
-- Also accelerates "leads synced since last refresh" incremental queries.
CREATE INDEX IF NOT EXISTS idx_leads_portfolio_synced_at
  ON public.leads (portfolio_id, synced_at DESC)
  WHERE portfolio_id IS NOT NULL;

-- Index 2: (stage, portfolio_id)
-- Powers pipeline board + lead management queries filtered by stage within
-- a portfolio. The stage column is the lead_stage enum (maps to "status"
-- in the user request — the leads table uses "stage" as the status column).
CREATE INDEX IF NOT EXISTS idx_leads_stage_portfolio
  ON public.leads (stage, portfolio_id)
  WHERE portfolio_id IS NOT NULL;

-- Index 3: (last_enrichment_date)
-- Powers enrichment-recency queries:
--   SELECT * FROM leads WHERE last_enrichment_date < NOW() - INTERVAL '7 days'
-- Also used by the auto-enrich scheduler to find stale leads efficiently.
CREATE INDEX IF NOT EXISTS idx_leads_last_enrichment_date
  ON public.leads (last_enrichment_date DESC NULLS LAST);

-- ── 4. portfolio_sync_status table ───────────────────────────────────────────
-- Tracks the real-time status of each parallel sync job per portfolio.
-- The background job queue writes to this table as each of the 10 data
-- sources completes, allowing the UI to poll for progress without blocking.

CREATE TABLE IF NOT EXISTS public.portfolio_sync_status (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id      TEXT NOT NULL,
  source_name       TEXT NOT NULL,
  sync_run_id       UUID NOT NULL,           -- groups all sources in one Refresh click
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  started_at        TIMESTAMPTZ DEFAULT NULL,
  completed_at      TIMESTAMPTZ DEFAULT NULL,
  leads_inserted    INTEGER DEFAULT 0,
  leads_updated     INTEGER DEFAULT 0,
  error_message     TEXT DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one status row per (portfolio, source, sync_run)
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_sync_status_unique
  ON public.portfolio_sync_status (portfolio_id, source_name, sync_run_id);

-- Index for polling: "give me all rows for this sync_run_id"
CREATE INDEX IF NOT EXISTS idx_portfolio_sync_status_run
  ON public.portfolio_sync_status (sync_run_id, status);

-- Index for dashboard: "latest sync status per portfolio"
CREATE INDEX IF NOT EXISTS idx_portfolio_sync_status_portfolio_created
  ON public.portfolio_sync_status (portfolio_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.portfolio_sync_status ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all sync status rows (needed for dashboard polling)
DROP POLICY IF EXISTS "authenticated_read_portfolio_sync_status" ON public.portfolio_sync_status;
CREATE POLICY "authenticated_read_portfolio_sync_status"
  ON public.portfolio_sync_status
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role (API routes) can insert/update sync status rows
DROP POLICY IF EXISTS "service_manage_portfolio_sync_status" ON public.portfolio_sync_status;
CREATE POLICY "service_manage_portfolio_sync_status"
  ON public.portfolio_sync_status
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ── 5. updated_at trigger for portfolio_sync_status ──────────────────────────

CREATE OR REPLACE FUNCTION public.set_portfolio_sync_status_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_sync_status_updated_at ON public.portfolio_sync_status;
CREATE TRIGGER trg_portfolio_sync_status_updated_at
  BEFORE UPDATE ON public.portfolio_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_portfolio_sync_status_updated_at();
