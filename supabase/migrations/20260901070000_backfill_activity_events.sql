-- ============================================================
-- Migration: Backfill activity events for historical leads
-- ============================================================
-- Leads created before activity tracking was added show nothing
-- in the Recent Activity feed. This migration inserts synthetic
-- 'lead_created' events for all leads that have no activity record.
-- ============================================================

-- Insert lead_created events for all leads with no existing activity
INSERT INTO activity_events (
  user_id,
  lead_id,
  lead_address,
  lead_state,
  event_type,
  description,
  detail,
  source,
  metadata,
  event_timestamp,
  created_at
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid AS user_id,
  l.id AS lead_id,
  l.address AS lead_address,
  l.state AS lead_state,
  'lead_created' AS event_type,
  'Lead added — ' || l.address AS description,
  l.state || ' market' AS detail,
  'backfill' AS source,
  jsonb_build_object('backfilled', true, 'source', COALESCE(l.source, 'Unknown')) AS metadata,
  COALESCE(l.created_at, now()) AS event_timestamp,
  now() AS created_at
FROM leads l
WHERE NOT EXISTS (
  SELECT 1 FROM activity_events ae
  WHERE ae.lead_id = l.id
)
  AND l.address IS NOT NULL
  AND l.address <> ''
-- Limit backfill to avoid inserting millions of rows for synthetic data
-- Only backfill the 5000 most recently created leads without activity
ORDER BY l.created_at DESC NULLS LAST
LIMIT 5000;

-- Add an index to speed up the "no activity" check in the future
CREATE INDEX IF NOT EXISTS idx_activity_events_lead_id
  ON activity_events (lead_id)
  WHERE lead_id IS NOT NULL;
