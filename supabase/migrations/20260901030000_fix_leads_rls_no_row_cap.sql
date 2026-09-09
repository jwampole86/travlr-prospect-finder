-- Migration: Ensure leads table has no row-count cap in RLS policies
-- Timestamp: 20260901030000
-- Context: The dashboard was showing 0 leads because:
-- 1. Supabase default row limit is 1000 — fixed in leadsService by paginating
-- 2. Ensure the anon_read_all_leads policy is in place and correct

-- Drop and recreate the anon read policy to ensure it has no hidden filters
DROP POLICY IF EXISTS anon_read_all_leads ON public.leads;
DROP POLICY IF EXISTS public_preview_leads_v2 ON public.leads;

-- Allow anon and authenticated roles to read all leads (no user_id filter)
CREATE POLICY anon_read_all_leads ON public.leads
  FOR SELECT
  USING (true);

-- Ensure authenticated users can also read all leads
DROP POLICY IF EXISTS authenticated_read_all_leads ON public.leads;
CREATE POLICY authenticated_read_all_leads ON public.leads
  FOR SELECT
  TO authenticated
  USING (true);
