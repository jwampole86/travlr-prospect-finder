-- ============================================================
-- TRAVLR — Register Skip Tracing Working API (RapidAPI) provider
-- Migration: 20261010080000_register_skip_tracing_provider.sql
-- ============================================================

INSERT INTO public.enrichment_provider_registry (
  provider_name,
  provider_type,
  automation_allowed,
  contract_reference,
  allowed_uses,
  prohibited_uses,
  rate_limit_per_min,
  rate_limit_per_day,
  enabled
)
VALUES (
  'SKIP_TRACING_API',
  'PEOPLE',
  true,
  'Skip Tracing Working API (RapidAPI, by ONEAPI) — https://rapidapi.com/oneapiproject/api/skip-tracing-working-api',
  ARRAY['owner_resolution', 'skip_trace', 'contact_enrichment'],
  ARRAY['unauthorized_scraping', 'sms_consent_assumption', 'marketing_without_consent'],
  60,
  80,
  true
)
ON CONFLICT (provider_name) DO UPDATE SET
  provider_type       = EXCLUDED.provider_type,
  automation_allowed  = EXCLUDED.automation_allowed,
  contract_reference  = EXCLUDED.contract_reference,
  allowed_uses        = EXCLUDED.allowed_uses,
  prohibited_uses     = EXCLUDED.prohibited_uses,
  rate_limit_per_min   = EXCLUDED.rate_limit_per_min,
  rate_limit_per_day   = EXCLUDED.rate_limit_per_day,
  updated_at          = now();
