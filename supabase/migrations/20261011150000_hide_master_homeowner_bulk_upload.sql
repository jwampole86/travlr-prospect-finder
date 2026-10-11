-- Hide the bulk master homeowner test upload (~157.7K rows from master-homeowner-import) from dashboards, lists and scoring.
-- Those rows carry address-only data and dragged the average score from ~50 to ~20. is_synthetic is the existing "hide" flag:
-- KPIs, Lead Management and score recompute all exclude it, and admins can reveal the rows with the Lead Management toggle.
-- Only untouched rows are flagged (no agent, outreach, phone, trace or closed deal). To restore: set is_synthetic = false
-- WHERE address_source = 'MASTER_HOMEOWNER_DATA' AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'.
-- One statement per id prefix keeps each UPDATE (and its dashboard_lead_facts trigger work) small.

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '0%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '1%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '2%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '3%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '4%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '5%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '6%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '7%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '8%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE '9%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'a%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'b%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'c%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'd%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'e%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

UPDATE public.leads SET is_synthetic = true
WHERE id LIKE 'f%'
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;

-- Catch-all for any id format outside the hex prefixes above.
UPDATE public.leads SET is_synthetic = true
WHERE address_source = 'MASTER_HOMEOWNER_DATA'
  AND master_property_data->>'source' = 'MASTER_PROPERTY_DATA'
  AND is_synthetic IS NOT TRUE
  AND primary_agent_id IS NULL
  AND stage = 'New Lead'
  AND COALESCE(outreach_status, 'NOT_CONTACTED') = 'NOT_CONTACTED'
  AND skip_trace_status IS NULL
  AND COALESCE(contact_phone, '') = ''
  AND COALESCE(deal_closed, false) = false;
