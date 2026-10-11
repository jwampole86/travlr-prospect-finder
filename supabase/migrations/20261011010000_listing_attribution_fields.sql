-- ============================================================
-- Migration: 20261011010000_listing_attribution_fields
-- ============================================================
-- Adds listing attribution fields (agent/broker/MLS) surfaced by the Zillow
-- Detail Scraper so FSBO (for-sale-by-owner) listings' direct owner contact
-- info — and agent/broker info when it's an agent-listed property — can
-- populate lead details instead of being discarded. Also tracks when a
-- listing was last confirmed live, to support a price/status re-verification
-- backfill across already-synced leads.
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_agent_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_agent_phone TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_broker_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_broker_phone TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mls_number TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mls_source_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_updated_at TIMESTAMPTZ;
-- TRUE only when a listing shows no agent/broker attribution at all — the
-- strongest available signal that contact_name/contact_phone (if present)
-- is the owner's own info rather than a listing agent's.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_fsbo BOOLEAN;
-- Last time price/price_type/status was confirmed against the live source,
-- distinct from `last_checked` (regulation/general freshness field).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS price_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.is_fsbo IS
  'TRUE when the live listing had no agent/broker attribution (likely for-sale-by-owner) — contact_name/contact_phone are more likely the actual homeowner.';
COMMENT ON COLUMN public.leads.price_verified_at IS
  'Last time price/price_type was confirmed against a live source (e.g. Zillow Detail Scraper), distinct from last_checked.';
