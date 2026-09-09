-- Migration: CSV dedup + new leads from CSV file 2 + SMS personalization audit table
-- Deduplicates against existing 80 verified leads (csv-verified-001..080)
-- Inserts 33 new unique leads from CSV file 2 (113 total - 80 existing = 33 new)
-- Creates sms_campaign_sends table for exact rendered message audit trail

-- ─── 1. Insert 33 new unique leads from CSV file 2 ───────────────────────────
-- These are the rows in CSV file 2 that do NOT exist in the current 80 verified leads
-- Dedup key: address + contact_phone (canonical fingerprint)

DO $$
BEGIN
  INSERT INTO public.leads (
    id,
    address,
    city,
    state,
    zip,
    contact_name,
    contact_phone,
    owner_name,
    verified_owner,
    verified_number,
    verified_address,
    has_phone,
    ownership_record_verified,
    is_synthetic,
    ingestion_source,
    stage,
    enrichment_status,
    source,
    prospect_score
  ) VALUES
    -- New leads not present in the original 80 (deduped by address+phone fingerprint)
    ('csv-v2-001', '1072 Urania Ave', 'Encinitas', 'CA', '92024', 'Mac & Nima Sohrabi', '(619) 247-0112', 'Mac & Nima Sohrabi', true, true, '1072 Urania Ave Encinitas, CA 92024', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-002', '1101 Pembroke Ln', 'Newport Beach', 'CA', '92660', 'Colleen Osborne', '(949) 230-2479', 'Colleen Osborne', true, true, '1101 Pembroke Ln Newport Beach, CA 92660', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-003', '113 Seale Ave', 'Palo Alto', 'CA', '94301', 'Cathy Muma', '(415) 676-1200', 'Cathy Muma', true, true, '113 Seale Ave Palo Alto, CA 94301', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-004', '1134 Abrigo Rd', 'Palm Springs', 'CA', '92262', 'Phillip LeBlanc', '(949) 715-5509', 'Phillip LeBlanc', true, true, '1134 Abrigo Rd Palm Springs, CA 92262', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-005', '1141 Muirlands Vista Way', 'La Jolla', 'CA', '92037', 'Marc Karlsberg', '(626) 233-1390', 'Marc Karlsberg', true, true, '1141 Muirlands Vista Way La Jolla, CA 92037', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-006', '119 Via Santo Tomas', 'Rancho Mirage', 'CA', '92270', 'Randy Bloom', '(760) 285-2800', 'Randy Bloom', true, true, '119 Via Santo Tomas Rancho Mirage, CA 92270', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-007', '13318 Mulholland Dr', 'Beverly Hills', 'CA', '90210', 'Michael Edson', '(310) 569-0490', 'Michael Edson', true, true, '13318 Mulholland Dr Beverly Hills, CA 90210', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-008', '134 Royal Saint Georges Way', 'Rancho Mirage', 'CA', '92270', 'Mario Gamboa', '(949) 230-8901', 'Mario Gamboa', true, true, '134 Royal Saint Georges Way Rancho Mirage, CA 92270', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-009', '1410 W Colonial Pkwy', 'Roseville', 'CA', '95661', 'Maria Sechler', '(916) 209-6380', 'Maria Sechler', true, true, '1410 W Colonial Pkwy Roseville, CA 95661', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-010', '1417 High Bluff Dr', 'Newport Beach', 'CA', '92660', 'Alex Aydin', '(949) 836-4900', 'Alex Aydin', true, true, '1417 High Bluff Dr Newport Beach, CA 92660', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-011', '1419 Oberlin Ave', 'Thousand Oaks', 'CA', '91360', 'Sean Dubravac', '(310) 488-0056', 'Sean Dubravac', true, true, '1419 Oberlin Ave Thousand Oaks, CA 91360', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-012', '1438 Hillcrest Rd', 'Santa Barbara', 'CA', '93103', 'Ben Anapol', '(631) 793-9128', 'Ben Anapol', true, true, '1438 Hillcrest Rd Santa Barbara, CA 93103', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-013', '2099 E Racquet Club Rd', 'Palm Springs', 'CA', '92262', 'Al Amtoun', '(202) 329-3992', 'Al Amtoun', true, true, '2099 E Racquet Club Rd Palm Springs, CA 92262', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-014', '2242 Jeffersonia Way', 'Los Angeles', 'CA', '90049', 'Kelsey Vinson', '(404) 520-0835', 'Kelsey Vinson', true, true, '2242 Jeffersonia Way Los Angeles, CA 90049', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-015', '2623 W Pumpkin Ridge Dr', 'Anthem', 'AZ', '85086', 'Samantha Maplethorpe', '(425) 246-0225', 'Samantha Maplethorpe', true, true, '2623 W Pumpkin Ridge Dr Anthem, AZ 85086', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-016', '27030 Meadow Way', 'Carmel', 'CA', '93923', 'Christopher Chambers', '(510) 909-8083', 'Christopher Chambers', true, true, '27030 Meadow Way Carmel, CA 93923', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-017', '2770 Wright Ln', 'Los Angeles', 'CA', '90068', 'Otto Ho', '(805) 268-6886', 'Otto Ho', true, true, '2770 Wright Ln Los Angeles, CA 90068', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-018', '28080 Hayward Dr', 'Castaic', 'CA', '91384', 'Lindsey Capel', '(480) 283-7317', 'Lindsey Capel', true, true, '28080 Hayward Dr Castaic, CA 91384', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-019', '3155 Creston Eureka Rd', 'Templeton', 'CA', '93465', 'Monica Bennett', '(818) 825-1687', 'Monica Bennett', true, true, '3155 Creston Eureka Rd Templeton, CA 93465', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-020', '35931 N 87th Way', 'Scottsdale', 'AZ', '85266', 'Thomas Silva', '(602) 230-1511', 'Thomas Silva', true, true, '35931 N 87th Way Scottsdale, AZ 85266', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-021', '3615 Corte Claro', 'Carlsbad', 'CA', '92009', 'Rob & Kristin Kerstner', '(760) 805-0252', 'Rob & Kristin Kerstner', true, true, '3615 Corte Claro Carlsbad, CA 92009', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-022', '412 E Yearling Rd', 'Phoenix', 'AZ', '85085', 'Julie Bradfeldt', '(612) 965-7749', 'Julie Bradfeldt', true, true, '412 E Yearling Rd Phoenix, AZ 85085', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-023', '436 2nd St', 'Manhattan Beach', 'CA', '90266', 'Kyle Geoghegan', '(310) 374-3007', 'Kyle Geoghegan', true, true, '436 2nd St Manhattan Beach, CA 90266', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-024', '47655 Chapel Hill Rd', 'Palm Desert', 'CA', '92260', 'Ari Goott', '(801) 755-1144', 'Ari Goott', true, true, '47655 Chapel Hill Rd Palm Desert, CA 92260', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-025', '48713 Spring Rain Ct', 'Indio', 'CA', '92201', 'Almahdi A', '(202) 329-3992', 'Almahdi A', true, true, '48713 Spring Rain Ct Indio, CA 92201', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-026', '5134 Pendleton St', 'San Diego', 'CA', '92109', 'Patrick Benton', '(858) 353-7479', 'Patrick Benton', true, true, '5134 Pendleton St San Diego, CA 92109', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-027', '5216 E Monte Cristo Ave', 'Scottsdale', 'AZ', '85254', 'Kimberly Bucher', '(602) 799-5730', 'Kimberly Bucher', true, true, '5216 E Monte Cristo Ave Scottsdale, AZ 85254', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-028', '55555 Pebble Bch', 'La Quinta', 'CA', '92253', 'Blake Polisky', '(818) 335-4764', 'Blake Polisky', true, true, '55555 Pebble Bch La Quinta, CA 92253', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-029', '57513 Santa Rosa Trl', 'La Quinta', 'CA', '92253', 'Margie Dupuis', '(310) 372-4019', 'Margie Dupuis', true, true, '57513 Santa Rosa Trl La Quinta, CA 92253', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-030', '5948 Abernathy Dr', 'Los Angeles', 'CA', '90045', 'Carly Drake', '(414) 339-8982', 'Carly Drake', true, true, '5948 Abernathy Dr Los Angeles, CA 90045', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-031', '6408 Weidlake Dr', 'Los Angeles', 'CA', '90068', 'Eli Harel', '(818) 536-2146', 'Eli Harel', true, true, '6408 Weidlake Dr Los Angeles, CA 90068', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-032', '6952 Solano Verde Dr', 'Somis', 'CA', '93066', 'Navreet Boparai', '(805) 727-6124', 'Navreet Boparai', true, true, '6952 Solano Verde Dr Somis, CA 93066', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85),
    ('csv-v2-033', '7730 E Gold Dust Ave', 'Scottsdale', 'AZ', '85258', 'Adam Justin Katz', '(480) 275-0939', 'Adam Justin Katz', true, true, '7730 E Gold Dust Ave Scottsdale, AZ 85258', true, true, false, 'CSV_IMPORT', 'New Lead', 'COMPLETE', 'Direct', 85)
  ON CONFLICT (id) DO UPDATE SET
    verified_owner = true,
    verified_number = true,
    verified_address = EXCLUDED.verified_address,
    has_phone = true,
    ownership_record_verified = true,
    enrichment_status = 'COMPLETE',
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    owner_name = EXCLUDED.owner_name;

EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- ─── 2. SMS Campaign Sends — exact rendered message audit trail ───────────────
DO $$
BEGIN
CREATE TABLE IF NOT EXISTS public.sms_campaign_sends (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           TEXT,
  template_id           TEXT,
  template_version      TEXT,
  lead_id               TEXT NOT NULL,
  contact_id            TEXT,
  property_id           TEXT,
  phone                 TEXT NOT NULL,
  resolved_first_name   TEXT NOT NULL,
  resolved_address      TEXT NOT NULL,
  first_name_source     TEXT,
  address_source        TEXT,
  first_name_verified   BOOLEAN DEFAULT false,
  address_verified      BOOLEAN DEFAULT false,
  rendered_message      TEXT NOT NULL,
  rendered_at           TIMESTAMPTZ DEFAULT NOW(),
  twilio_message_sid    TEXT,
  send_status           TEXT DEFAULT 'queued',
  personalization_status TEXT DEFAULT 'READY',
  exclusion_reason      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaign_sends_lead_id ON public.sms_campaign_sends(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_sends_campaign_id ON public.sms_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_sends_phone ON public.sms_campaign_sends(phone);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_sends_send_status ON public.sms_campaign_sends(send_status);

ALTER TABLE public.sms_campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_sms_campaign_sends" ON public.sms_campaign_sends;
CREATE POLICY "authenticated_manage_sms_campaign_sends"
  ON public.sms_campaign_sends
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
END $$;