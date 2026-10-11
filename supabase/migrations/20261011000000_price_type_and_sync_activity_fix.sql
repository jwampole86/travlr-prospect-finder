-- ============================================================
-- Migration: 20261011000000_price_type_and_sync_activity_fix
-- ============================================================
-- Fixes two confirmed data-accuracy bugs:
--
-- 1. activity_events.event_type CHECK constraint had no way to distinguish
--    a live RapidAPI sync from a true manual CSV upload — both were forced
--    into 'csv_imported', so Recent Activity showed "CSV import completed"
--    for both, even though the `source` column already (quietly) recorded
--    'sync' vs 'csv_upload'. Add 'sync_imported' as a first-class type.
--
-- 2. leads.price_type was hardcoded to 'rent' on every CSV/RapidAPI-sourced
--    insert (src/app/api/leads/csv-import/route.ts), regardless of whether
--    the source listing was actually for-sale. Several RapidAPI providers
--    (Zillow Detail Scraper, Zillow Scraper API/ToolzerHub, Zillow Real
--    Estate API, US Property Data) can return for-sale/sold listings, whose
--    SALE price was being silently stored as if it were a monthly rent.
--    Adds a column to hold an AI-estimated long-term rent for those
--    for-sale leads (populated by a separate batch job — see
--    /api/cron/rent-estimate), kept clearly distinct from the real `price`.
-- ============================================================

-- ─── 1. activity_events: add 'sync_imported' event type ──────────────────────
ALTER TABLE public.activity_events DROP CONSTRAINT IF EXISTS activity_events_event_type_check;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_event_type_check CHECK (event_type IN (
  'lead_created',
  'csv_imported',
  'sync_imported',
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
  'sms_sent',
  'call_completed'
));

-- ─── 2. leads: AI-estimated monthly rent for for-sale properties ────────────
-- Populated only for price_type='sale' leads that have no real rent data —
-- never overwrites a genuine listed/verified rent price. Kept separate from
-- `price` (which, for price_type='sale' leads, correctly holds the sale price).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_monthly_rent_ai NUMERIC;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_monthly_rent_ai_source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_monthly_rent_ai_confidence TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_monthly_rent_ai_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.estimated_monthly_rent_ai IS
  'AI-estimated long-term monthly rent, populated only for price_type=sale leads with no real rent data. Not a substitute for a verified listed rent price.';
