-- Leads imported (or re-geocoded) after a rule was applied stayed Unknown. Sync them now and make every future lead inherit a resolved rule.

CREATE OR REPLACE FUNCTION public.regulation_status_for(p_status TEXT)
RETURNS public.regulation_status
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'ALLOWED' THEN 'Allowed'::public.regulation_status
    WHEN 'ALLOWED_WITH_REQUIREMENTS' THEN 'Allowed'::public.regulation_status
    WHEN 'PERMIT_REQUIRED' THEN 'Allowed'::public.regulation_status
    WHEN 'RESTRICTED' THEN 'Restricted'::public.regulation_status
    WHEN 'PRIMARY_RESIDENCE_REQUIRED' THEN 'Restricted'::public.regulation_status
    WHEN 'PROHIBITED' THEN 'Prohibited'::public.regulation_status
    ELSE 'Unknown'::public.regulation_status
  END;
$$;

-- Only fills Unknown/NULL, so a status an importer or admin set explicitly is never overwritten.
CREATE OR REPLACE FUNCTION public.leads_inherit_city_regulation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF coalesce(btrim(NEW.city), '') = '' OR coalesce(btrim(NEW.state), '') = '' THEN
    RETURN NEW;
  END IF;
  SELECT r.status INTO v_status
  FROM public.city_regulations r
  WHERE lower(btrim(r.state)) = lower(btrim(NEW.state))
    AND lower(btrim(coalesce(r.city, ''))) = lower(btrim(NEW.city))
    AND r.status NOT IN ('UNKNOWN', 'REVIEW_REQUIRED')
  LIMIT 1;
  IF v_status IS NOT NULL THEN
    NEW.regulation_status := public.regulation_status_for(v_status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_inherit_city_regulation ON public.leads;
CREATE TRIGGER trg_leads_inherit_city_regulation
  BEFORE INSERT OR UPDATE OF city, state, regulation_status ON public.leads
  FOR EACH ROW
  WHEN (NEW.regulation_status IS NULL OR NEW.regulation_status = 'Unknown')
  EXECUTE FUNCTION public.leads_inherit_city_regulation();

-- One-time sync of existing Unknown leads in cities that already have a resolved rule.
UPDATE public.leads l
SET regulation_status = public.regulation_status_for(r.status), updated_at = NOW()
FROM public.city_regulations r
WHERE l.is_synthetic IS NOT TRUE
  AND (l.regulation_status IS NULL OR l.regulation_status = 'Unknown')
  AND r.status NOT IN ('UNKNOWN', 'REVIEW_REQUIRED')
  AND lower(btrim(r.state)) = lower(btrim(l.state))
  AND lower(btrim(coalesce(r.city, ''))) = lower(btrim(l.city));

-- Give those leads an evaluation record too (the lead profile and teleprompter read it).
INSERT INTO public.property_regulation_evaluations
  (lead_id, city_regulation_id, jurisdiction_name, city_regulation_status, evaluated_at, regulation_version,
   source_last_verified_at, confidence, review_required, evaluation_reason, data_quality_flags)
SELECT l.id, r.id, r.jurisdiction_name, r.status, NOW(), r.regulation_version, r.last_verified_at, r.confidence,
       (r.review_status <> 'CURRENT'), 'CANONICAL_MATCH', NULL
FROM public.leads l
JOIN public.city_regulations r
  ON lower(btrim(r.state)) = lower(btrim(l.state)) AND lower(btrim(coalesce(r.city, ''))) = lower(btrim(l.city))
WHERE l.is_synthetic IS NOT TRUE AND r.status NOT IN ('UNKNOWN', 'REVIEW_REQUIRED')
ON CONFLICT (lead_id) DO UPDATE SET
  city_regulation_id = EXCLUDED.city_regulation_id,
  jurisdiction_name = EXCLUDED.jurisdiction_name,
  city_regulation_status = EXCLUDED.city_regulation_status,
  evaluated_at = EXCLUDED.evaluated_at,
  regulation_version = EXCLUDED.regulation_version,
  source_last_verified_at = EXCLUDED.source_last_verified_at,
  confidence = EXCLUDED.confidence,
  review_required = EXCLUDED.review_required,
  evaluation_reason = EXCLUDED.evaluation_reason,
  data_quality_flags = NULL,
  updated_at = NOW();
