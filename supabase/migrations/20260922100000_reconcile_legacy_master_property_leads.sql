-- The first property-only batch predates address_source tagging but includes
-- durable master_property_data provenance. Remove its PO boxes and normalize
-- all remaining rows to evidence-based defaults.
SET LOCAL statement_timeout = '10min';

DELETE FROM public.leads
WHERE master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND public.is_post_office_box(address);

UPDATE public.leads
SET address_source = 'MASTER_HOMEOWNER_DATA',
    prospect_score = least(coalesce(prospect_score, 50), 50),
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
WHERE master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND coalesce(listing_status, '') <> 'Active';

INSERT INTO public.listing_verification_jobs (user_id, lead_id, priority)
SELECT user_id, id, coalesce(prospect_score, 0)
FROM public.leads
WHERE user_id IS NOT NULL
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND NOT public.is_post_office_box(address)
ON CONFLICT (lead_id) DO NOTHING;