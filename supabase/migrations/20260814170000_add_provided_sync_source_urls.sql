-- Migration: Add all user-provided sync source URLs to sync_source_coverage
-- Timestamp: 20260814170000
-- These are the exact filter URLs provided by the user for all 10 portfolios.
-- Uses ON CONFLICT DO UPDATE so existing rows are updated with the precise filter URLs.

INSERT INTO public.sync_source_coverage (portfolio, zone, source_name, sync_url, status, feasibility_note, job_scheduled)
VALUES

-- ══════════════════════════════════════════════════════════════════════════════
-- COLORADO
-- ══════════════════════════════════════════════════════════════════════════════

-- Denver
('Colorado','Denver','Trulia',
 'https://www.trulia.com/for_rent/Denver,CO/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Colorado','Denver','Rent.com',
 'https://www.rent.com/colorado/denver/townhouses_condos_houses_furnished?source=homepage',
 'active', NULL, TRUE),
('Colorado','Denver','Realtor.com',
 'https://www.realtor.com/apartments/Denver_CO/type-townhome,single-family-home,condo/with_furnished',
 'active', NULL, TRUE),
('Colorado','Denver','PadMapper',
 'https://www.padmapper.com/apartments/denver-co?property-categories=condo,house&box=-105.1099,39.6143,-104.5997,39.9142',
 'active', NULL, TRUE),
('Colorado','Denver','Apartment List',
 'https://www.apartmentlist.com/apartments-near-me?amenities=has_furnished_option%2Cis_airbnb_friendly',
 'active', NULL, TRUE),
('Colorado','Denver','Dwellsy',
 'https://dwellsy.com/search/co-denver/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Aspen
('Colorado','Aspen','Trulia',
 'https://www.trulia.com/for_rent/Aspen,CO/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- Breckenridge
('Colorado','Breckenridge','Trulia',
 'https://www.trulia.com/for_rent/Breckenridge,CO/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Colorado','Breckenridge','Dwellsy',
 'https://dwellsy.com/search/co-breckenridge/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Vail
('Colorado','Vail','Trulia',
 'https://www.trulia.com/for_rent/Vail,CO/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- NEVADA
-- ══════════════════════════════════════════════════════════════════════════════

-- Las Vegas
('Nevada','Las Vegas','Trulia',
 'https://www.trulia.com/for_rent/Las_Vegas,NV/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Nevada','Las Vegas','Dwellsy',
 'https://dwellsy.com/search/nv-las-vegas/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Henderson
('Nevada','Henderson','Trulia',
 'https://www.trulia.com/for_rent/Henderson,NV/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Nevada','Henderson','Dwellsy',
 'https://dwellsy.com/search/nv-henderson/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- WASHINGTON
-- ══════════════════════════════════════════════════════════════════════════════

-- Seattle
('Washington','Seattle','Trulia',
 'https://www.trulia.com/for_rent/Seattle,WA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Washington','Seattle','Dwellsy',
 'https://dwellsy.com/search/wa-seattle/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Bellevue
('Washington','Bellevue','Trulia',
 'https://www.trulia.com/for_rent/Bellevue,WA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Washington','Bellevue','Dwellsy',
 'https://dwellsy.com/search/wa-bellevue/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Renton
('Washington','Renton','Trulia',
 'https://www.trulia.com/for_rent/Renton,WA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- FLORIDA
-- ══════════════════════════════════════════════════════════════════════════════

-- Miami
('Florida','Miami','Trulia',
 'https://www.trulia.com/for_rent/Miami,FL/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('Florida','Miami','Dwellsy',
 'https://dwellsy.com/search/fl-miami/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- TEXAS
-- ══════════════════════════════════════════════════════════════════════════════

-- Dallas
('Texas','Dallas','Trulia',
 'https://www.trulia.com/for_rent/Dallas,TX/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- Houston
('Texas','Houston','Trulia',
 'https://www.trulia.com/for_rent/Houston,TX/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- UTAH (statewide Trulia URL — no city-level filter available in provided URLs)
-- ══════════════════════════════════════════════════════════════════════════════
('Utah','Salt Lake City','Trulia',
 'https://www.trulia.com/for_rent/UT/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', 'Statewide UT filter URL provided — covers all Utah zones including SLC and Park City', TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- CALIFORNIA
-- ══════════════════════════════════════════════════════════════════════════════

-- Los Angeles (city-level)
('California','Los Angeles','Trulia',
 'https://www.trulia.com/for_rent/Los_Angeles,CA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('California','Los Angeles','Dwellsy',
 'https://dwellsy.com/search/ca-los-angeles/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Sherman Oaks
('California','Sherman Oaks','Trulia',
 'https://www.trulia.com/for_rent/Los_Angeles,Sherman_Oaks,CA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('California','Sherman Oaks','Dwellsy',
 'https://dwellsy.com/search/ca-los-angeles-sherman-oaks/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Hollywood
('California','Hollywood','Trulia',
 'https://dwellsy.com/search/ca-los-angeles-hollywood/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', 'Dwellsy Hollywood URL provided; Trulia does not have a standalone Hollywood filter in the provided set', TRUE),
('California','Hollywood','Dwellsy',
 'https://dwellsy.com/search/ca-los-angeles-hollywood/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Malibu
('California','Malibu','Trulia',
 'https://www.trulia.com/for_rent/Malibu,CA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),
('California','Malibu','Dwellsy',
 'https://dwellsy.com/search/ca-malibu/places-for-rent?roomforrent=false&verified=true&sort=creation_time%3alh',
 'active', NULL, TRUE),

-- Newport Beach
('California','Newport Beach','Trulia',
 'https://www.trulia.com/for_rent/Newport_Beach,CA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', NULL, TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- MAINE (statewide Trulia URL)
-- ══════════════════════════════════════════════════════════════════════════════
('Maine','Portland','Trulia',
 'https://www.trulia.com/for_rent/ME/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', 'Statewide ME filter URL provided — covers all Maine zones including Portland', TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- MASSACHUSETTS (statewide Trulia URL)
-- ══════════════════════════════════════════════════════════════════════════════
('Massachusetts','Boston','Trulia',
 'https://www.trulia.com/for_rent/MA/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', 'Statewide MA filter URL provided — covers all Massachusetts zones including Boston and Cambridge', TRUE),

-- ══════════════════════════════════════════════════════════════════════════════
-- OREGON (statewide Trulia URL)
-- ══════════════════════════════════════════════════════════════════════════════
('Oregon','Portland','Trulia',
 'https://www.trulia.com/for_rent/OR/CONDO,SINGLE-FAMILY_HOME,TOWNHOUSE_type/1_furnished/',
 'active', 'Statewide OR filter URL provided — covers all Oregon zones including Portland and Bend', TRUE)

ON CONFLICT (portfolio, COALESCE(zone, ''), source_name) DO UPDATE SET
  sync_url        = EXCLUDED.sync_url,
  status          = EXCLUDED.status,
  feasibility_note = EXCLUDED.feasibility_note,
  job_scheduled   = EXCLUDED.job_scheduled,
  updated_at      = NOW();
