-- Migration: Insert 39 new leads from new_leads_with_phones CSV as Fully Verified
-- Dedup strategy: skip insert if a lead with the same normalized address already exists
-- fully_verified is a GENERATED column: (verified_owner=true AND verified_number=true AND verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false')

DO $$
DECLARE
  v_address TEXT;
  v_owner TEXT;
  v_phone TEXT;
  v_city TEXT;
  v_state TEXT;
  v_zip TEXT;
  v_full_address TEXT;
BEGIN

-- Helper: insert only if no existing lead has the same normalized address
-- We use address_fingerprint (lower-trimmed address) for dedup when available,
-- otherwise fall back to checking address column directly.

-- ============================================================
-- BATCH 3: new_leads_with_phones.csv (39 leads)
-- ============================================================

INSERT INTO public.leads (
  id, address, city, state, zip, owner_name, contact_phone,
  secondary_phones, all_phones_raw,
  verified_owner, verified_number, verified_address,
  verified_owner_source, verified_number_source,
  ingestion_source, import_source_name, import_source_file,
  research_source, source, stage,
  is_synthetic,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  v.address, v.city, v.state, v.zip, v.owner_name, v.contact_phone,
  ARRAY[]::text[], v.contact_phone,
  true, true, (v.address || ', ' || v.city || ', ' || v.state || ' ' || v.zip),
  'Manual Research', 'Manual Research',
  'CSV_IMPORT', 'new_leads_with_phones', 'new_leads_with_phones.csv',
  'Manual Research', 'Direct'::public.lead_source, 'New Lead'::public.lead_stage,
  false,
  now(), now()
FROM (VALUES
  -- CA leads
  ('(Undisclosed address)', 'Palm Desert', 'CA', '92260', 'Cynthia Venegas May', '(949) 401-4907'),
  ('(Undisclosed address)', 'Saratoga', 'CA', '95070', 'VC', '(415) 707-5598'),
  ('104 Starbright', 'Irvine', 'CA', '92618', 'Nicole Xu', '(949) 478-0871'),
  ('1175 Wildwood Ave', 'South Lake Tahoe', 'CA', '96150', 'Dany', '(831) 273-5068'),
  ('15679 New Park Ter', 'San Diego', 'CA', '92127', 'Jeff', '(619) 777-5690'),
  ('2099 E Racquet Club Rd', 'Palm Springs', 'CA', '92262', 'Rose City Housing', '(626) 774-8298'),
  ('22361 Torino Entire', 'Laguna Hills', 'CA', '92653', 'Chuchu Yan', '(951) 636-0970'),
  ('2386 S Alhambra Dr', 'Palm Springs', 'CA', '92264', 'Kenneth Lee Deavers', '(619) 404-5659'),
  ('2612 Babaco St', 'Spring Valley', 'CA', '91977', 'Martina Mckinney', '(619) 374-8167'),
  ('2937 Garona Dr', 'Hacienda Heights', 'CA', '91745', 'Han', '(626) 548-3564'),
  ('3716 Tracey Ct', 'Bakersfield', 'CA', '93311', 'Gloria Ortiz', '(661) 749-9382'),
  ('41244 Rawling Ct', 'Indio', 'CA', '92203', 'TATYANA VAKSMAN', '(206) 944-6020'),
  ('58 E Sunset Ave', 'Venice', 'CA', '90291', 'SHAWN STERN', '(213) 493-8398'),
  ('6301 Ocean Jasper Dr', 'Bakersfield', 'CA', '93313', 'Jasmin Rosas', '(661) 744-2365'),
  ('74584 Xander Ct', 'Palm Desert', 'CA', '92211', 'Michelle Nichols', '(424) 392-7068'),
  ('80485 Old Ranch Trl N', 'La Quinta', 'CA', '92253', 'Kenneth Rosen', '(858) 422-1259'),
  ('81125 Golf View Dr', 'La Quinta', 'CA', '92253', 'Jennifer', '(949) 776-5256'),
  ('81148 Arroyo Pl', 'Indio', 'CA', '92201', 'Michael Vaksman', '(206) 737-2609'),
  -- CO leads
  ('12240 E 50th Ave', 'Denver', 'CO', '80239', 'Bobby', '(720) 782-8129'),
  ('2030 S Franklin St', 'Denver', 'CO', '80210', 'Babu Venugopal', '(720) 897-1825'),
  ('204 S 4th Ave', 'Frisco', 'CO', '80443', 'Ronda Campbell', '(970) 406-3702'),
  ('20525 Flint Ln', 'Morrison', 'CO', '80465', 'Chris', '(213) 554-1438'),
  ('23400 Postrider Trl', 'Oak Creek', 'CO', '80467', 'Maigread Eichten', '(650) 668-5794'),
  ('2985 Littlefish Trl', 'Steamboat Springs', 'CO', '80487', 'Troy Foss', '(619) 586-6767'),
  ('3155 23rd St', 'Boulder', 'CO', '80304', 'Jules Rookstool', '(213) 556-4851'),
  ('396 Steele St', 'Denver', 'CO', '80206', 'Three Nine Six Steele St', '(786) 465-0856'),
  ('4035 N Quivas St', 'Denver', 'CO', '80211', 'Anna and Jeremy', '(617) 404-2102'),
  ('528 S Gaylord St', 'Denver', 'CO', '80209', 'Peter Wall', '(720) 571-8939'),
  ('559 Jackson St', 'Denver', 'CO', '80206', 'Sheelagh Devlin', '(720) 613-2179'),
  ('654 Stone Creek Dr', 'Avon', 'CO', '81620', 'Elizabeth', '(720) 738-6299'),
  -- NV leads
  ('11238 Pentland Downs St', 'Las Vegas', 'NV', '89141', 'Joshua James Corrick', '(216) 677-9665'),
  ('3310 Ten Mile Dr', 'Sparks', 'NV', '89436', 'Melanie G.', '(408) 547-4477'),
  ('338 Kandinsky Ct', 'Henderson', 'NV', '89012', 'Scott Chu', '(848) 331-2815'),
  ('3722 Las Vegas Blvd S', 'Las Vegas', 'NV', '89158', 'Sherry Freeman', '(781) 242-5274'),
  ('3841 Cranbrook Hill St', 'Las Vegas', 'NV', '89129', 'Janet Hill', '(725) 234-6062'),
  ('3931 Argent Star Ct', 'Las Vegas', 'NV', '89147', 'Wendy Weissman', '(310) 564-7478'),
  ('4101 Del Monte Ave', 'Las Vegas', 'NV', '89102', 'Aaron Franklin', '(213) 214-3773'),
  ('643 Lookout Rd', 'Zephyr Cove', 'NV', '89448', 'Glenn Wolfson MD', '(727) 201-1688'),
  ('987 Gold Bear Dr', 'Henderson', 'NV', '89052', 'Michael Zhang', '(415) 770-0193')
) AS v(address, city, state, zip, owner_name, contact_phone)
WHERE NOT EXISTS (
  -- Dedup: skip if a lead with the same address+city+state already exists
  SELECT 1 FROM public.leads existing
  WHERE lower(trim(existing.address)) = lower(trim(v.address))
    AND lower(trim(existing.city))    = lower(trim(v.city))
    AND lower(trim(existing.state))   = lower(trim(v.state))
    AND lower(trim(v.address)) NOT IN ('', '(undisclosed address)')
)
AND NOT EXISTS (
  -- Dedup for undisclosed addresses: match by owner_name+city+state+zip
  SELECT 1 FROM public.leads existing
  WHERE lower(trim(v.address)) IN ('', '(undisclosed address)')
    AND lower(trim(existing.owner_name)) = lower(trim(v.owner_name))
    AND lower(trim(existing.city))       = lower(trim(v.city))
    AND lower(trim(existing.state))      = lower(trim(v.state))
    AND lower(trim(existing.zip))        = lower(trim(v.zip))
);

RAISE NOTICE 'Batch 3 complete: new_leads_with_phones.csv (up to 39 leads) inserted as Fully Verified (deduped against existing leads)';

END $$;
