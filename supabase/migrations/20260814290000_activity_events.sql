-- Migration: Activity Events — Live Dashboard Feed
-- Timestamp: 20260814290000

-- ─── activity_events ─────────────────────────────────────────────────────────
-- Purpose-built table for the Recent Activity dashboard panel.
-- Records are written at the moment an action occurs, never reconstructed.

-- Drop and recreate to ensure a clean schema (handles partial prior runs)
DROP TABLE IF EXISTS public.activity_events CASCADE;

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ownership: the authenticated user who owns this workspace
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Lead association (nullable for non-lead events like regulation refreshes)
  lead_id text NULL,
  -- Human-readable address for display (denormalised for fast reads)
  lead_address text NULL,
  -- State code for portfolio-scoped filtering (e.g. 'CO', 'CA')
  lead_state text NULL,
  -- Structured event type for icon/colour mapping
  event_type text NOT NULL CHECK (event_type IN (
    'lead_created',
    'csv_imported',
    'stage_changed',
    'score_updated',
    'note_added',
    'note_edited',
    'regulation_refreshed',
    'live_status',
    'lead_edited',
    'contact_updated',
    'lead_assigned',
    'lead_archived',
    'lead_restored',
    'bulk_update',
    'enrichment_completed',
    'outreach_sent',
    'email_sent',
    'sms_sent'
  )),
  -- Human-readable description shown in the feed row
  description text NOT NULL DEFAULT '',
  -- Optional supporting detail shown as sub-text
  detail text NULL,
  -- Previous value (for stage changes, score changes, etc.)
  previous_value text NULL,
  -- New value
  new_value text NULL,
  -- Who or what caused the event
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NULL,
  -- Source system (e.g. 'csv_upload', 'manual', 'enrichment', 'sync')
  source text NULL,
  -- Arbitrary extra data
  metadata jsonb NOT NULL DEFAULT '{}',
  -- When the event actually occurred
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_activity_events_user_id
  ON public.activity_events(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_lead_id
  ON public.activity_events(lead_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_event_type
  ON public.activity_events(event_type);

-- Primary query pattern: user + portfolio state + timestamp DESC
CREATE INDEX IF NOT EXISTS idx_activity_events_user_state_ts
  ON public.activity_events(user_id, lead_state, event_timestamp DESC);

-- Dashboard feed query: user + timestamp DESC (all portfolios)
CREATE INDEX IF NOT EXISTS idx_activity_events_user_ts
  ON public.activity_events(user_id, event_timestamp DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_activity_events" ON public.activity_events;
CREATE POLICY "users_manage_own_activity_events"
ON public.activity_events FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Allow public (unauthenticated preview) access for null user_id rows
DROP POLICY IF EXISTS "public_preview_activity_events" ON public.activity_events;
CREATE POLICY "public_preview_activity_events"
ON public.activity_events FOR ALL TO public
USING (user_id IS NULL) WITH CHECK (user_id IS NULL);
