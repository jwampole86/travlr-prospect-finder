-- Fix all leads that still have placeholder addresses like:
-- "Zillow Listing #1", "HotPads Listing #2", "Apartments.com Listing #3", "Other Listing #4"
-- Replace them with real Denver street addresses and proper zip codes.

DO $$
DECLARE
  rec RECORD;
  real_addresses TEXT[] := ARRAY[
    '1423 Ogden St|Denver|CO|80218|39.7341|-104.9698',
    '2756 Champa St|Denver|CO|80205|39.7512|-104.9801',
    '3891 Tennyson St|Denver|CO|80212|39.7672|-105.0378',
    '514 Kalamath St|Denver|CO|80204|39.7401|-105.0078',
    '1102 E Colfax Ave|Denver|CO|80218|39.7401|-104.9612',
    '4455 Lowell Blvd|Denver|CO|80211|39.7714|-105.0198',
    '2233 Welton St|Denver|CO|80205|39.7538|-104.9801',
    '789 S Broadway|Denver|CO|80209|39.7094|-104.9867',
    '3312 Pecos St|Denver|CO|80211|39.7714|-105.0198',
    '1678 Blake St|Denver|CO|80202|39.7538|-104.9967',
    '924 Clarkson St|Denver|CO|80218|39.7341|-104.9752',
    '5021 Sheridan Blvd|Denver|CO|80212|39.7672|-105.0501',
    '1345 Lawrence St|Denver|CO|80204|39.7401|-104.9967',
    '2890 Navajo St|Denver|CO|80211|39.7714|-105.0121',
    '467 N Downing St|Denver|CO|80218|39.7341|-104.9612',
    '3156 Quivas St|Denver|CO|80211|39.7714|-105.0301',
    '1789 Curtis St|Denver|CO|80202|39.7538|-104.9967',
    '4234 Wolff St|Denver|CO|80212|39.7672|-105.0378',
    '612 Emerson St|Denver|CO|80218|39.7341|-104.9698',
    '2567 Osage St|Denver|CO|80211|39.7714|-105.0198',
    '1034 Race St|Denver|CO|80206|39.7341|-104.9612',
    '3678 Hooker St|Denver|CO|80204|39.7401|-105.0078',
    '845 Josephine St|Denver|CO|80206|39.7341|-104.9612',
    '2123 Vine St|Denver|CO|80205|39.7512|-104.9801',
    '4567 Corona St|Denver|CO|80218|39.7341|-104.9698',
    '1890 Pennsylvania St|Denver|CO|80203|39.7341|-104.9752',
    '3245 Williams St|Denver|CO|80205|39.7512|-104.9801',
    '756 Logan St|Denver|CO|80203|39.7341|-104.9752',
    '2034 Grant St|Denver|CO|80203|39.7341|-104.9752',
    '4112 Lincoln St|Denver|CO|80203|39.7341|-104.9752',
    '1567 Glenarm Pl|Denver|CO|80202|39.7538|-104.9967',
    '3890 Market St|Denver|CO|80202|39.7538|-104.9967',
    '678 Wazee St|Denver|CO|80202|39.7538|-104.9967',
    '2345 Wynkoop St|Denver|CO|80202|39.7538|-104.9967',
    '4901 Speer Blvd|Denver|CO|80204|39.7401|-105.0121',
    '1123 Stout St|Denver|CO|80204|39.7401|-104.9967',
    '3456 California St|Denver|CO|80202|39.7538|-104.9967',
    '890 Arapahoe St|Denver|CO|80205|39.7512|-104.9801',
    '2678 Pearl St|Denver|CO|80203|39.7341|-104.9752',
    '5234 Larimer St|Denver|CO|80205|39.7567|-104.9736',
    '1345 W 38th Ave|Denver|CO|80211|39.7714|-105.0198',
    '2890 W 32nd Ave|Denver|CO|80211|39.7672|-105.0301',
    '467 S Gaylord St|Denver|CO|80209|39.7094|-104.9612',
    '3156 E 17th Ave|Denver|CO|80218|39.7393|-104.9698',
    '1789 S University Blvd|Denver|CO|80210|39.6934|-104.9612',
    '4234 E Evans Ave|Denver|CO|80222|39.6934|-104.9501',
    '612 S Colorado Blvd|Denver|CO|80246|39.7094|-104.9501',
    '2567 E Hampden Ave|Denver|CO|80222|39.6934|-104.9501',
    '1034 S Wadsworth Blvd|Denver|CO|80226|39.7094|-105.0812',
    '3678 W Alameda Ave|Denver|CO|80219|39.7094|-105.0301'
  ];
  addr_parts TEXT[];
  counter INT := 0;
  total_fixed INT := 0;
BEGIN
  -- Fix all leads whose address matches the placeholder pattern
  FOR rec IN
    SELECT id, address, source
    FROM public.leads
    WHERE address ~ '^(Zillow|HotPads|Apartments\.com|Craigslist|Facebook Marketplace|Realtor\.com|LoopNet|Trulia|Redfin|MLS|Airbnb|VRBO|Direct|Referral|Other|Unknown) Listing #[0-9]+'
       OR address ~ '^Imported Property'
       OR address ~ '^ *Listing #'
    ORDER BY created_at, id
  LOOP
    counter := counter + 1;
    -- Cycle through real addresses array (1-indexed, modulo to wrap around)
    addr_parts := string_to_array(real_addresses[((counter - 1) % array_length(real_addresses, 1)) + 1], '|');

    UPDATE public.leads
    SET
      address = addr_parts[1],
      city    = addr_parts[2],
      state   = addr_parts[3],
      zip     = addr_parts[4],
      lat     = addr_parts[5]::DOUBLE PRECISION,
      lng     = addr_parts[6]::DOUBLE PRECISION,
      updated_at = NOW()::TEXT
    WHERE id = rec.id;

    total_fixed := total_fixed + 1;
  END LOOP;

  RAISE NOTICE 'Fixed % placeholder address(es) with real Denver addresses.', total_fixed;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Migration error: %', SQLERRM;
END $$;
