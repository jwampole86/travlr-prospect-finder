-- Skip trace resident of record is the tenant-or-owner for a managed rental, so it is a contact, not a known owner.
UPDATE public.leads
SET owner_name = NULL, owner_source = NULL
WHERE owner_source = 'SKIP_TRACING_API'
  AND price_type = 'rent'
  AND COALESCE(is_fsbo, false) = false;
