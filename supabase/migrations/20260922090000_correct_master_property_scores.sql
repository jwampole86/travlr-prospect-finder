-- Property-only source completeness is not lead conversion quality. Remove
-- legacy table defaults that were never present in the source data and place
-- unverified property-only leads in the Cold/Nurture band until real listing,
-- regulation, revenue, or engagement evidence is obtained.
UPDATE public.leads
SET prospect_score = least(coalesce(prospect_score, 50), 50),
    lat = NULL,
    lng = NULL,
    beds = NULL,
    baths = NULL,
    price = NULL,
    days_on_market = NULL,
    estimated_adr = NULL,
    estimated_occupancy = NULL,
    estimated_gross_monthly = NULL,
    estimated_net_monthly = NULL,
    updated_at = now()::TEXT
WHERE address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND coalesce(listing_status, '') <> 'Active';