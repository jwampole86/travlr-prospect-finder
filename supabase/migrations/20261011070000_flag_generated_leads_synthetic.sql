-- Flag generator output as synthetic so KPIs, scoring recompute and dashboards ignore it.
-- sync-*: fabricated addresses/listing slugs with no source_property_id (migration 20260901060000).
-- lead-refresh-*: refresh-service output with example.com listing URLs (same criterion as 20260903050000).
-- Guarded to rows nobody has worked: no agent, no outreach, still 'New Lead', no closed deal.
UPDATE public.leads
SET is_synthetic = true
WHERE is_synthetic IS NOT TRUE
  AND (id LIKE 'sync-%' OR id LIKE 'lead-refresh-%')
  AND primary_agent_id IS NULL
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND stage = 'New Lead'
  AND COALESCE(deal_closed, false) = false;
