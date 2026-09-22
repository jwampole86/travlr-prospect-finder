ALTER TABLE public.master_homeowner_records
  ADD COLUMN IF NOT EXISTS county TEXT,
  ADD COLUMN IF NOT EXISTS residence_type TEXT,
  ADD COLUMN IF NOT EXISTS home_age TEXT,
  ADD COLUMN IF NOT EXISTS estimated_home_value INTEGER,
  ADD COLUMN IF NOT EXISTS ownership_status TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS master_property_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.enrich_lead_from_master_homeowner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_record public.master_homeowner_records%ROWTYPE;
BEGIN
  IF NEW.user_id IS NULL OR coalesce(NEW.address, '') = '' THEN RETURN NEW; END IF;

  SELECT * INTO matched_record
  FROM public.master_homeowner_records records
  WHERE records.user_id = NEW.user_id
    AND records.criteria_met = true
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
