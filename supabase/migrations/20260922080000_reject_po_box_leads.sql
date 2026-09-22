CREATE OR REPLACE FUNCTION public.is_post_office_box(address_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(address_value, '') ~* '(^|[[:space:],])(((p[[:space:]]*\.?[[:space:]]*o[[:space:]]*\.?)|(post[[:space:]]+office)|(postal))[[:space:]]*(box|bx)|pob)[[:space:]]*#?[[:space:]]*[0-9]+';
$$;

UPDATE public.master_homeowner_records
SET criteria_met = false,
    address_fingerprint = ''
WHERE public.is_post_office_box(property_address);

-- Remove only leads created by this master-data workflow. User-entered and
-- independently sourced records are left untouched.
DELETE FROM public.leads
WHERE address_source = 'MASTER_HOMEOWNER_DATA'
  AND public.is_post_office_box(address);

CREATE OR REPLACE FUNCTION public.enforce_master_record_physical_address()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_post_office_box(NEW.property_address) THEN
    NEW.criteria_met := false;
    NEW.address_fingerprint := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_master_record_po_box ON public.master_homeowner_records;
CREATE TRIGGER reject_master_record_po_box
BEFORE INSERT OR UPDATE OF property_address, criteria_met ON public.master_homeowner_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_master_record_physical_address();

CREATE OR REPLACE FUNCTION public.enrich_lead_from_master_homeowner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_record public.master_homeowner_records%ROWTYPE;
BEGIN
  IF NEW.address_source = 'MASTER_HOMEOWNER_DATA' THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL OR coalesce(NEW.address, '') = '' OR public.is_post_office_box(NEW.address) THEN RETURN NEW; END IF;

  SELECT * INTO matched_record
  FROM public.master_homeowner_records records
  WHERE records.user_id = NEW.user_id
    AND records.criteria_met = true
    AND NOT public.is_post_office_box(records.property_address)
    AND records.address_fingerprint = public.master_address_fingerprint(NEW.address, NEW.city, NEW.state, NEW.zip)
  ORDER BY records.quality_score DESC, records.created_at DESC
  LIMIT 1;

  IF matched_record.id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.contact_name, '') = '' AND coalesce(matched_record.owner_name, '') <> '' THEN
    NEW.contact_name := matched_record.owner_name;
    NEW.verified_owner := true;
    NEW.verified_owner_source := 'MASTER_HOMEOWNER_DATA';
    NEW.verified_owner_method := 'EXACT_ADDRESS_MATCH';
  END IF;
  IF coalesce(NEW.contact_phone, '') = '' AND coalesce(matched_record.phone, '') <> '' THEN
    NEW.contact_phone := matched_record.phone;
    NEW.verified_number := true;
    NEW.verified_number_source := 'MASTER_HOMEOWNER_DATA';
    NEW.verified_number_method := 'EXACT_ADDRESS_MATCH';
    NEW.verified_number_at := now();
  END IF;
  IF coalesce(NEW.county, '') = '' AND coalesce(matched_record.county, '') <> '' THEN NEW.county := matched_record.county; END IF;
  IF coalesce(NEW.property_type, '') = '' AND coalesce(matched_record.residence_type, '') <> '' THEN NEW.property_type := matched_record.residence_type; END IF;
  NEW.master_property_data := coalesce(NEW.master_property_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'home_age', matched_record.home_age,
    'estimated_home_value', matched_record.estimated_home_value,
    'ownership_status', matched_record.ownership_status,
    'source', 'MASTER_PROPERTY_DATA'
  ));
  NEW.prospect_score := greatest(coalesce(NEW.prospect_score, 0), matched_record.quality_score);
  RETURN NEW;
END;
$$;