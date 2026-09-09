-- Migration: Add Maryland - Baltimore portfolio and sync source URLs
-- Timestamp: 20260831040000

-- ─── 1. Insert Maryland - Baltimore sync source URLs ─────────────────────────
INSERT INTO public.sync_source_coverage (portfolio, zone, source_name, sync_url, status, feasibility_note, job_scheduled)
VALUES
  ('Maryland', 'Baltimore', 'Trulia',
   'https://www.trulia.com/for_rent/Baltimore,MD/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Rent.com',
   'https://www.rent.com/maryland/baltimore/townhouses_condos_houses_furnished',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Realtor.com',
   'https://www.realtor.com/apartments/Baltimore_MD/with_furnished',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'PadMapper',
   'https://www.padmapper.com/apartments/baltimore-md?property-categories=condo,house&box=-76.70122146606445,39.221814460428085,-76.53985977172852,39.34737438333235',
   'active', NULL, TRUE),
  ('Maryland', 'Baltimore', 'Dwellsy',
   'https://dwellsy.com/search/md-baltimore/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
   'active', NULL, TRUE)
ON CONFLICT (portfolio, COALESCE(zone, ''), source_name) DO UPDATE SET
  sync_url         = EXCLUDED.sync_url,
  status           = EXCLUDED.status,
  feasibility_note = EXCLUDED.feasibility_note,
  job_scheduled    = EXCLUDED.job_scheduled,
  updated_at       = NOW();

-- ─── 2. Seed local blurb for Maryland / Baltimore ────────────────────────────
INSERT INTO public.local_blurbs (state, city, blurb)
VALUES
  ('MD', 'Baltimore', 'we''re expanding our short-term rental operations into Baltimore, bringing professional management expertise to one of Maryland''s most vibrant and historically rich cities'),
  ('MD', NULL, 'we''re growing our presence in Maryland''s short-term rental market, helping homeowners maximize their property income with proven management systems')
ON CONFLICT (state, city) DO UPDATE SET
  blurb      = EXCLUDED.blurb,
  updated_at = NOW();
