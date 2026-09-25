-- Migration: Register the Illinois portfolio + backfill portfolio_id on IL leads
-- Timestamp: 20260924000000
--
-- ROOT CAUSE:
--   leads.state = 'IL' holds 100,083 real leads (60% of the 166,909-row table,
--   genuine Chicago-area addresses ingested via LINK_SYNC/Direct source — NOT
--   synthetic/test data) but portfolio_registry never had an 'IL' row.
--   Result: Illinois has never been selectable in the dashboard/sidebar
--   portfolio switcher — its leads only ever appeared under "All Portfolios",
--   making per-state totals look wrong/incomplete to users switching states.
--
-- FIX: mirror the exact upsert pattern used in
--   20260904500000_25state_portfolio_upsert_backfill.sql

SET LOCAL statement_timeout = '10min';

INSERT INTO public.portfolio_registry (state_code, state_name, portfolio_key, portfolio_label, is_active, auto_created)
VALUES ('IL', 'Illinois', 'il', 'Illinois Portfolio', true, false)
ON CONFLICT (state_code) DO UPDATE SET
  is_active       = true,
  portfolio_label = EXCLUDED.portfolio_label,
  portfolio_key   = EXCLUDED.portfolio_key,
  updated_at      = now();

-- Backfill portfolio_id / portfolio_name on IL leads that are missing or
-- mismatched, same as the original 25-state backfill. Never deletes leads,
-- never touches agent assignments, notes, or history.
UPDATE public.leads
SET
  portfolio_id   = 'il',
  portfolio_name = 'Illinois Portfolio',
  updated_at     = now()::TEXT
WHERE
  UPPER(TRIM(state)) = 'IL'
  AND (
    portfolio_id IS NULL
    OR portfolio_id = ''
    OR portfolio_id != 'il'
  );
