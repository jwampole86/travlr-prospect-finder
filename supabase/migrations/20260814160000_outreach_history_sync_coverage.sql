-- Migration: outreach_history table + sync_sources coverage for all 10 portfolios
-- Timestamp: 20260814160000

-- ─── 1. Outreach History Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_history (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  lead_id             TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  subject             TEXT,
  body_preview        TEXT,
  full_body           TEXT,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'delivered', 'bounced', 'failed', 'opened', 'replied')),
  failure_reason      TEXT,
  bounce_type         TEXT CHECK (bounce_type IN ('hard', 'soft')),
  reply_detected      BOOLEAN NOT NULL DEFAULT FALSE,
  reply_snippet       TEXT,
  recipient_email     TEXT,
  recipient_phone     TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  replied_at          TIMESTAMPTZ,
  next_followup_due   TIMESTAMPTZ,
  template_id         TEXT,
  agent_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for outreach_history
CREATE INDEX IF NOT EXISTS idx_outreach_history_lead_id    ON public.outreach_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_history_status     ON public.outreach_history(status);
CREATE INDEX IF NOT EXISTS idx_outreach_history_channel    ON public.outreach_history(channel);
CREATE INDEX IF NOT EXISTS idx_outreach_history_sent_at    ON public.outreach_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_history_agent_id   ON public.outreach_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_outreach_history_reply      ON public.outreach_history(reply_detected) WHERE reply_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_outreach_history_followup   ON public.outreach_history(next_followup_due) WHERE next_followup_due IS NOT NULL;

-- RLS for outreach_history
ALTER TABLE public.outreach_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_history' AND policyname = 'outreach_history_select'
  ) THEN
    CREATE POLICY outreach_history_select ON public.outreach_history
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_history' AND policyname = 'outreach_history_insert'
  ) THEN
    CREATE POLICY outreach_history_insert ON public.outreach_history
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'outreach_history' AND policyname = 'outreach_history_update'
  ) THEN
    CREATE POLICY outreach_history_update ON public.outreach_history
      FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 2. Sync Sources Coverage Table ──────────────────────────────────────────
-- Tracks which source URLs are configured per portfolio/zone, and their job status
CREATE TABLE IF NOT EXISTS public.sync_source_coverage (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  portfolio       TEXT NOT NULL,   -- e.g. 'Colorado', 'Texas'
  zone            TEXT,            -- e.g. 'Denver', 'Dallas', NULL = statewide
  source_name     TEXT NOT NULL,   -- e.g. 'Trulia', 'Zillow'
  sync_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'unconfirmed', 'deprioritized', 'infeasible')),
  feasibility_note TEXT,           -- for infeasible/deprioritized sources
  last_synced_at  TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'failed', 'partial', 'pending')),
  last_sync_error TEXT,
  leads_imported  INTEGER DEFAULT 0,
  job_scheduled   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_coverage_portfolio_zone_source
  ON public.sync_source_coverage(portfolio, COALESCE(zone, ''), source_name);

CREATE INDEX IF NOT EXISTS idx_sync_coverage_portfolio ON public.sync_source_coverage(portfolio);
CREATE INDEX IF NOT EXISTS idx_sync_coverage_status    ON public.sync_source_coverage(status);

ALTER TABLE public.sync_source_coverage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sync_source_coverage' AND policyname = 'sync_coverage_select'
  ) THEN
    CREATE POLICY sync_coverage_select ON public.sync_source_coverage
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sync_source_coverage' AND policyname = 'sync_coverage_all'
  ) THEN
    CREATE POLICY sync_coverage_all ON public.sync_source_coverage
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── 3. Seed Sync Coverage Audit Matrix (10 portfolios × 10 sources) ─────────
-- Coverage audit: confirmed working URLs marked 'active', gaps marked 'unconfirmed' or 'infeasible'

INSERT INTO public.sync_source_coverage (portfolio, zone, source_name, sync_url, status, feasibility_note, job_scheduled)
VALUES

-- ── COLORADO (established — strong multi-source coverage) ──
('Colorado','Aspen','Trulia','https://www.trulia.com/for_rent/Aspen,CO/','active',NULL,TRUE),
('Colorado','Aspen','Dwellsy','https://dwellsy.com/rentals/aspen-co/','active',NULL,TRUE),
('Colorado','Aspen','Rent.com','https://www.rent.com/colorado/aspen-apartments','active',NULL,TRUE),
('Colorado','Aspen','Realtor.com','https://www.realtor.com/apartments/Aspen_CO','active',NULL,TRUE),
('Colorado','Aspen','PadMapper','https://www.padmapper.com/apartments/aspen-co','active',NULL,TRUE),
('Colorado','Breckenridge','Trulia','https://www.trulia.com/for_rent/Breckenridge,CO/','active',NULL,TRUE),
('Colorado','Breckenridge','Dwellsy','https://dwellsy.com/rentals/breckenridge-co/','active',NULL,TRUE),
('Colorado','Breckenridge','Rent.com','https://www.rent.com/colorado/breckenridge-apartments','active',NULL,TRUE),
('Colorado','Breckenridge','Realtor.com','https://www.realtor.com/apartments/Breckenridge_CO','active',NULL,TRUE),
('Colorado','Breckenridge','PadMapper','https://www.padmapper.com/apartments/breckenridge-co','active',NULL,TRUE),
('Colorado','Vail','Trulia','https://www.trulia.com/for_rent/Vail,CO/','active',NULL,TRUE),
('Colorado','Vail','Dwellsy','https://dwellsy.com/rentals/vail-co/','active',NULL,TRUE),
('Colorado','Vail','Rent.com','https://www.rent.com/colorado/vail-apartments','active',NULL,TRUE),
('Colorado','Vail','Realtor.com','https://www.realtor.com/apartments/Vail_CO','active',NULL,TRUE),
('Colorado','Vail','PadMapper','https://www.padmapper.com/apartments/vail-co','active',NULL,TRUE),
-- Unconfirmed sources for CO (Zillow/HotPads overlap with Trulia — same parent company)
('Colorado','Aspen','Zillow','https://www.zillow.com/aspen-co/rentals/','unconfirmed','Zillow and HotPads share parent company with Trulia — high listing overlap expected. Confirm dedup before activating to avoid duplicate wave.',FALSE),
('Colorado','Aspen','HotPads','https://hotpads.com/aspen-co/rentals','unconfirmed','Same parent as Zillow/Trulia — likely high overlap. Deprioritize until dedup logic confirmed.',FALSE),
('Colorado','Aspen','Apartments.com','https://www.apartments.com/aspen-co/','active',NULL,TRUE),
('Colorado','Aspen','Craigslist','https://denver.craigslist.org/search/apa?query=aspen','unconfirmed','Craigslist requires snapshot-based ingestion + stale-link detection. Build separately per Craigslist spec.',FALSE),

-- ── CALIFORNIA (established — strong multi-source coverage) ──
('California','Los Angeles','Trulia','https://www.trulia.com/for_rent/Los_Angeles,CA/','active',NULL,TRUE),
('California','Los Angeles','Dwellsy','https://dwellsy.com/rentals/los-angeles-ca/','active',NULL,TRUE),
('California','Los Angeles','Rent.com','https://www.rent.com/california/los-angeles-apartments','active',NULL,TRUE),
('California','Los Angeles','Realtor.com','https://www.realtor.com/apartments/Los-Angeles_CA','active',NULL,TRUE),
('California','Los Angeles','PadMapper','https://www.padmapper.com/apartments/los-angeles-ca','active',NULL,TRUE),
('California','Los Angeles','Apartments.com','https://www.apartments.com/los-angeles-ca/','active',NULL,TRUE),
('California','Sherman Oaks','Trulia','https://www.trulia.com/for_rent/Sherman_Oaks,CA/','active',NULL,TRUE),
('California','Sherman Oaks','Dwellsy','https://dwellsy.com/rentals/sherman-oaks-ca/','active',NULL,TRUE),
('California','Malibu','Trulia','https://www.trulia.com/for_rent/Malibu,CA/','active',NULL,TRUE),
('California','Malibu','Realtor.com','https://www.realtor.com/apartments/Malibu_CA','active',NULL,TRUE),
('California','Newport Beach','Trulia','https://www.trulia.com/for_rent/Newport_Beach,CA/','active',NULL,TRUE),
('California','Newport Beach','Realtor.com','https://www.realtor.com/apartments/Newport-Beach_CA','active',NULL,TRUE),
('California','Los Angeles','Zillow','https://www.zillow.com/los-angeles-ca/rentals/','unconfirmed','High Trulia overlap — confirm dedup before activating.',FALSE),
('California','Los Angeles','Craigslist','https://losangeles.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion + stale-link detection per Craigslist spec.',FALSE),

-- ── NEVADA (established) ──
('Nevada','Las Vegas','Trulia','https://www.trulia.com/for_rent/Las_Vegas,NV/','active',NULL,TRUE),
('Nevada','Las Vegas','Dwellsy','https://dwellsy.com/rentals/las-vegas-nv/','active',NULL,TRUE),
('Nevada','Las Vegas','Rent.com','https://www.rent.com/nevada/las-vegas-apartments','active',NULL,TRUE),
('Nevada','Las Vegas','Realtor.com','https://www.realtor.com/apartments/Las-Vegas_NV','active',NULL,TRUE),
('Nevada','Las Vegas','PadMapper','https://www.padmapper.com/apartments/las-vegas-nv','active',NULL,TRUE),
('Nevada','Las Vegas','Apartments.com','https://www.apartments.com/las-vegas-nv/','active',NULL,TRUE),
('Nevada','Henderson','Trulia','https://www.trulia.com/for_rent/Henderson,NV/','active',NULL,TRUE),
('Nevada','Henderson','Dwellsy','https://dwellsy.com/rentals/henderson-nv/','active',NULL,TRUE),
('Nevada','Henderson','Rent.com','https://www.rent.com/nevada/henderson-apartments','active',NULL,TRUE),
('Nevada','Henderson','Realtor.com','https://www.realtor.com/apartments/Henderson_NV','active',NULL,TRUE),
('Nevada','Las Vegas','Zillow','https://www.zillow.com/las-vegas-nv/rentals/','unconfirmed','High Trulia overlap — confirm dedup before activating.',FALSE),
('Nevada','Las Vegas','Craigslist','https://lasvegas.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── WASHINGTON (established) ──
('Washington','Seattle','Trulia','https://www.trulia.com/for_rent/Seattle,WA/','active',NULL,TRUE),
('Washington','Seattle','Dwellsy','https://dwellsy.com/rentals/seattle-wa/','active',NULL,TRUE),
('Washington','Seattle','Rent.com','https://www.rent.com/washington/seattle-apartments','active',NULL,TRUE),
('Washington','Seattle','Realtor.com','https://www.realtor.com/apartments/Seattle_WA','active',NULL,TRUE),
('Washington','Seattle','PadMapper','https://www.padmapper.com/apartments/seattle-wa','active',NULL,TRUE),
('Washington','Seattle','Apartments.com','https://www.apartments.com/seattle-wa/','active',NULL,TRUE),
('Washington','Bellevue','Trulia','https://www.trulia.com/for_rent/Bellevue,WA/','active',NULL,TRUE),
('Washington','Bellevue','Dwellsy','https://dwellsy.com/rentals/bellevue-wa/','active',NULL,TRUE),
('Washington','Bellevue','Rent.com','https://www.rent.com/washington/bellevue-apartments','active',NULL,TRUE),
('Washington','Renton','Trulia','https://www.trulia.com/for_rent/Renton,WA/','active',NULL,TRUE),
('Washington','Renton','Dwellsy','https://dwellsy.com/rentals/renton-wa/','active',NULL,TRUE),
('Washington','Seattle','Zillow','https://www.zillow.com/seattle-wa/rentals/','unconfirmed','High Trulia overlap — confirm dedup before activating.',FALSE),
('Washington','Seattle','Craigslist','https://seattle.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── TEXAS (expansion — previously sparse, now adding zone-specific URLs) ──
('Texas','Dallas','Trulia','https://www.trulia.com/for_rent/Dallas,TX/','active',NULL,TRUE),
('Texas','Dallas','Dwellsy','https://dwellsy.com/rentals/dallas-tx/','active',NULL,TRUE),
('Texas','Dallas','Rent.com','https://www.rent.com/texas/dallas-apartments','active',NULL,TRUE),
('Texas','Dallas','Realtor.com','https://www.realtor.com/apartments/Dallas_TX','active',NULL,TRUE),
('Texas','Dallas','PadMapper','https://www.padmapper.com/apartments/dallas-tx','active',NULL,TRUE),
('Texas','Dallas','Apartments.com','https://www.apartments.com/dallas-tx/','active',NULL,TRUE),
('Texas','Houston','Trulia','https://www.trulia.com/for_rent/Houston,TX/','active',NULL,TRUE),
('Texas','Houston','Dwellsy','https://dwellsy.com/rentals/houston-tx/','active',NULL,TRUE),
('Texas','Houston','Rent.com','https://www.rent.com/texas/houston-apartments','active',NULL,TRUE),
('Texas','Houston','Realtor.com','https://www.realtor.com/apartments/Houston_TX','active',NULL,TRUE),
('Texas','Houston','PadMapper','https://www.padmapper.com/apartments/houston-tx','active',NULL,TRUE),
('Texas','Houston','Apartments.com','https://www.apartments.com/houston-tx/','active',NULL,TRUE),
('Texas','Dallas','Zillow','https://www.zillow.com/dallas-tx/rentals/','unconfirmed','Confirm Trulia overlap before activating.',FALSE),
('Texas','Dallas','Craigslist','https://dallas.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),
('Texas','Houston','Craigslist','https://houston.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── FLORIDA (expansion — previously sparse) ──
('Florida','Miami','Trulia','https://www.trulia.com/for_rent/Miami,FL/','active',NULL,TRUE),
('Florida','Miami','Dwellsy','https://dwellsy.com/rentals/miami-fl/','active',NULL,TRUE),
('Florida','Miami','Rent.com','https://www.rent.com/florida/miami-apartments','active',NULL,TRUE),
('Florida','Miami','Realtor.com','https://www.realtor.com/apartments/Miami_FL','active',NULL,TRUE),
('Florida','Miami','PadMapper','https://www.padmapper.com/apartments/miami-fl','active',NULL,TRUE),
('Florida','Miami','Apartments.com','https://www.apartments.com/miami-fl/','active',NULL,TRUE),
('Florida','Miami','Zillow','https://www.zillow.com/miami-fl/rentals/','unconfirmed','Confirm Trulia overlap before activating.',FALSE),
('Florida','Miami','Craigslist','https://miami.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── UTAH (expansion — previously single statewide URL only) ──
('Utah','Salt Lake City','Trulia','https://www.trulia.com/for_rent/Salt_Lake_City,UT/','active',NULL,TRUE),
('Utah','Salt Lake City','Dwellsy','https://dwellsy.com/rentals/salt-lake-city-ut/','active',NULL,TRUE),
('Utah','Salt Lake City','Rent.com','https://www.rent.com/utah/salt-lake-city-apartments','active',NULL,TRUE),
('Utah','Salt Lake City','Realtor.com','https://www.realtor.com/apartments/Salt-Lake-City_UT','active',NULL,TRUE),
('Utah','Salt Lake City','PadMapper','https://www.padmapper.com/apartments/salt-lake-city-ut','active',NULL,TRUE),
('Utah','Salt Lake City','Apartments.com','https://www.apartments.com/salt-lake-city-ut/','active',NULL,TRUE),
('Utah','Park City','Trulia','https://www.trulia.com/for_rent/Park_City,UT/','active',NULL,TRUE),
('Utah','Park City','Realtor.com','https://www.realtor.com/apartments/Park-City_UT','active',NULL,TRUE),
('Utah','Salt Lake City','Craigslist','https://saltlake.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── MAINE (expansion — previously single statewide URL only) ──
('Maine','Portland','Trulia','https://www.trulia.com/for_rent/Portland,ME/','active',NULL,TRUE),
('Maine','Portland','Dwellsy','https://dwellsy.com/rentals/portland-me/','active',NULL,TRUE),
('Maine','Portland','Rent.com','https://www.rent.com/maine/portland-apartments','active',NULL,TRUE),
('Maine','Portland','Realtor.com','https://www.realtor.com/apartments/Portland_ME','active',NULL,TRUE),
('Maine','Portland','PadMapper','https://www.padmapper.com/apartments/portland-me','active',NULL,TRUE),
('Maine','Portland','Apartments.com','https://www.apartments.com/portland-me/','active',NULL,TRUE),
('Maine','Portland','Craigslist','https://maine.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── OREGON (expansion — previously single statewide URL only) ──
('Oregon','Portland','Trulia','https://www.trulia.com/for_rent/Portland,OR/','active',NULL,TRUE),
('Oregon','Portland','Dwellsy','https://dwellsy.com/rentals/portland-or/','active',NULL,TRUE),
('Oregon','Portland','Rent.com','https://www.rent.com/oregon/portland-apartments','active',NULL,TRUE),
('Oregon','Portland','Realtor.com','https://www.realtor.com/apartments/Portland_OR','active',NULL,TRUE),
('Oregon','Portland','PadMapper','https://www.padmapper.com/apartments/portland-or','active',NULL,TRUE),
('Oregon','Portland','Apartments.com','https://www.apartments.com/portland-or/','active',NULL,TRUE),
('Oregon','Bend','Trulia','https://www.trulia.com/for_rent/Bend,OR/','active',NULL,TRUE),
('Oregon','Bend','Realtor.com','https://www.realtor.com/apartments/Bend_OR','active',NULL,TRUE),
('Oregon','Portland','Craigslist','https://portland.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE),

-- ── MASSACHUSETTS (expansion — previously single statewide URL only) ──
('Massachusetts','Boston','Trulia','https://www.trulia.com/for_rent/Boston,MA/','active',NULL,TRUE),
('Massachusetts','Boston','Dwellsy','https://dwellsy.com/rentals/boston-ma/','active',NULL,TRUE),
('Massachusetts','Boston','Rent.com','https://www.rent.com/massachusetts/boston-apartments','active',NULL,TRUE),
('Massachusetts','Boston','Realtor.com','https://www.realtor.com/apartments/Boston_MA','active',NULL,TRUE),
('Massachusetts','Boston','PadMapper','https://www.padmapper.com/apartments/boston-ma','active',NULL,TRUE),
('Massachusetts','Boston','Apartments.com','https://www.apartments.com/boston-ma/','active',NULL,TRUE),
('Massachusetts','Cambridge','Trulia','https://www.trulia.com/for_rent/Cambridge,MA/','active',NULL,TRUE),
('Massachusetts','Cambridge','Realtor.com','https://www.realtor.com/apartments/Cambridge_MA','active',NULL,TRUE),
('Massachusetts','Boston','Craigslist','https://boston.craigslist.org/search/apa','unconfirmed','Requires snapshot ingestion per Craigslist spec.',FALSE)

ON CONFLICT (portfolio, COALESCE(zone, ''), source_name) DO UPDATE SET
  sync_url = EXCLUDED.sync_url,
  status = EXCLUDED.status,
  feasibility_note = EXCLUDED.feasibility_note,
  job_scheduled = EXCLUDED.job_scheduled,
  updated_at = NOW();
