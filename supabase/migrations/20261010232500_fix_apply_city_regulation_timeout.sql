-- ============================================================
-- Migration: 20261010232500_fix_apply_city_regulation_timeout
-- Purpose: apply_city_regulation_to_leads timed out on large jurisdictions
-- (e.g. Chicago, 16,897 leads) under the PostgREST role's default
-- statement_timeout. Raise it for just this function via a function-level
-- SET clause, which overrides the role default for the duration of the call.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_city_regulation_to_leads(p_city_regulation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_cr RECORD;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_cr FROM public.city_regulations WHERE id = p_city_regulation_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO public.property_regulation_evaluations
    (lead_id, city_regulation_id, jurisdiction_name, city_regulation_status,
     evaluated_at, regulation_version, source_last_verified_at, confidence,
     review_required, evaluation_reason, data_quality_flags)
  SELECT l.id, v_cr.id, v_cr.jurisdiction_name, v_cr.status,
         NOW(), v_cr.regulation_version, v_cr.last_verified_at, v_cr.confidence,
         (v_cr.review_status <> 'CURRENT'), 'CANONICAL_MATCH', NULL
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND l.state = v_cr.state
    AND LOWER(TRIM(l.city)) = LOWER(TRIM(v_cr.city))
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
    data_quality_flags = EXCLUDED.data_quality_flags,
    updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.leads l
  SET
    regulation_status = CASE v_cr.status
      WHEN 'ALLOWED' THEN 'Allowed'::public.regulation_status
      WHEN 'ALLOWED_WITH_REQUIREMENTS' THEN 'Restricted'::public.regulation_status
      WHEN 'PERMIT_REQUIRED' THEN 'Restricted'::public.regulation_status
      WHEN 'RESTRICTED' THEN 'Restricted'::public.regulation_status
      WHEN 'PRIMARY_RESIDENCE_REQUIRED' THEN 'Restricted'::public.regulation_status
      WHEN 'PROHIBITED' THEN 'Prohibited'::public.regulation_status
      ELSE 'Unknown'::public.regulation_status
    END,
    updated_at = NOW()
  WHERE l.is_synthetic IS NOT TRUE
    AND l.state = v_cr.state
    AND LOWER(TRIM(l.city)) = LOWER(TRIM(v_cr.city));

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_city_regulation_to_leads(UUID) TO authenticated, service_role;
