CREATE TABLE IF NOT EXISTS public.master_homeowner_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.master_homeowner_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.master_homeowner_files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_row INTEGER NOT NULL,
  property_address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  address_fingerprint TEXT NOT NULL,
  apn TEXT,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  criteria_met BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, source_row)
);

CREATE TABLE IF NOT EXISTS public.lead_master_homeowner_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  master_record_id UUID NOT NULL REFERENCES public.master_homeowner_records(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_strategy TEXT NOT NULL,
  fields_applied TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, master_record_id)
);

CREATE INDEX IF NOT EXISTS master_homeowner_records_user_fingerprint_idx
  ON public.master_homeowner_records (user_id, address_fingerprint)
  WHERE criteria_met = true;
CREATE INDEX IF NOT EXISTS master_homeowner_records_user_apn_idx
  ON public.master_homeowner_records (user_id, apn)
  WHERE apn IS NOT NULL AND apn <> '';
CREATE INDEX IF NOT EXISTS master_homeowner_files_user_created_idx
  ON public.master_homeowner_files (user_id, created_at DESC);

ALTER TABLE public.master_homeowner_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_homeowner_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_master_homeowner_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_master_homeowner_files" ON public.master_homeowner_files;
CREATE POLICY "users_manage_own_master_homeowner_files" ON public.master_homeowner_files
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users_manage_own_master_homeowner_records" ON public.master_homeowner_records;
CREATE POLICY "users_manage_own_master_homeowner_records" ON public.master_homeowner_records
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users_manage_own_lead_master_matches" ON public.lead_master_homeowner_matches;
CREATE POLICY "users_manage_own_lead_master_matches" ON public.lead_master_homeowner_matches
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'master-homeowner-data',
  'master-homeowner-data',
  false,
  52428800,
  ARRAY['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users_upload_own_master_homeowner_files" ON storage.objects;
CREATE POLICY "users_upload_own_master_homeowner_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'master-homeowner-data' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "users_read_own_master_homeowner_files" ON storage.objects;
CREATE POLICY "users_read_own_master_homeowner_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'master-homeowner-data' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "users_delete_own_master_homeowner_files" ON storage.objects;
CREATE POLICY "users_delete_own_master_homeowner_files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'master-homeowner-data' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.master_address_fingerprint(
  street TEXT,
  city_name TEXT,
  state_code TEXT,
  zip_code TEXT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT concat_ws('|',
    regexp_replace(lower(coalesce(street, '')), '[^a-z0-9]', '', 'g'),
    regexp_replace(lower(coalesce(city_name, '')), '[^a-z0-9]', '', 'g'),
    regexp_replace(lower(coalesce(state_code, '')), '[^a-z0-9]', '', 'g'),
    left(regexp_replace(coalesce(zip_code, ''), '[^0-9]', '', 'g'), 5)
  );
$$;

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
  NEW.prospect_score := greatest(coalesce(NEW.prospect_score, 0), matched_record.quality_score);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrich_new_lead_from_master_homeowner ON public.leads;
CREATE TRIGGER enrich_new_lead_from_master_homeowner
BEFORE INSERT OR UPDATE OF address, city, state, zip ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enrich_lead_from_master_homeowner();