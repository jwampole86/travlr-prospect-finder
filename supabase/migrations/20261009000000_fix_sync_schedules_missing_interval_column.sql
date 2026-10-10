-- ============================================================
-- Migration: 20261009000000_fix_sync_schedules_missing_interval_column
--
-- PURPOSE:
--   syncSchedulerService.ts (ensureSyncSchedules / runScheduledSyncs) has
--   always written a `sync_interval_ms` field on every upsert/update to
--   public.sync_schedules, but the column was never created by the original
--   20260813040000_operator_settings_notifications.sql migration.
--
-- IMPACT:
--   Every single call to ensureSyncSchedules() (run on every app load via
--   SyncSchedulerRunner) failed with PostgREST error PGRST204
--   ("Could not find the 'sync_interval_ms' column of 'sync_schedules' in
--   the schema cache") for every source, for every user, since inception.
--   Because the upsert always failed, no schedule rows were ever created,
--   so runScheduledSyncs() always loaded zero schedules and the entire
--   automated background sync loop never actually ran for anyone.
--
-- FIX: add the missing column.
-- ============================================================

ALTER TABLE public.sync_schedules
  ADD COLUMN IF NOT EXISTS sync_interval_ms BIGINT NOT NULL DEFAULT 3600000;

COMMENT ON COLUMN public.sync_schedules.sync_interval_ms IS
  'Per-source sync interval in milliseconds, written by syncSchedulerService.ts (ensureSyncSchedules/runScheduledSyncs). Default 1 hour matches SYNC_INTERVAL_MS.';
