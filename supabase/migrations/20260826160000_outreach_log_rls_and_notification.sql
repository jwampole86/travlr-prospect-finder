-- Migration: outreach_log_rls_and_notification
-- Ensures outreach_history has proper RLS for agents to insert/read their own records
-- and adds 'lead_assigned' notification type support

-- 1. Ensure RLS is enabled on outreach_history (idempotent)
ALTER TABLE public.outreach_history ENABLE ROW LEVEL SECURITY;

-- 2. Drop and recreate RLS policies for outreach_history
DROP POLICY IF EXISTS "outreach_history_select" ON public.outreach_history;
DROP POLICY IF EXISTS "outreach_history_insert" ON public.outreach_history;
DROP POLICY IF EXISTS "outreach_history_update" ON public.outreach_history;
DROP POLICY IF EXISTS "outreach_history_all_authenticated" ON public.outreach_history;

-- Allow authenticated users to read all outreach history (admins + agents viewing lead profiles)
CREATE POLICY "outreach_history_select"
ON public.outreach_history
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert their own outreach records
CREATE POLICY "outreach_history_insert"
ON public.outreach_history
FOR INSERT
TO authenticated
WITH CHECK (agent_id = auth.uid() OR agent_id IS NULL);

-- Allow agents to update their own outreach records
CREATE POLICY "outreach_history_update"
ON public.outreach_history
FOR UPDATE
TO authenticated
USING (agent_id = auth.uid() OR agent_id IS NULL)
WITH CHECK (agent_id = auth.uid() OR agent_id IS NULL);

-- 3. Ensure app_notifications RLS allows service-role inserts for agent notifications
-- (The existing policy should already handle this, but ensure insert is open for authenticated)
DROP POLICY IF EXISTS "app_notifications_insert_own" ON public.app_notifications;
CREATE POLICY "app_notifications_insert_own"
ON public.app_notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow service role to insert notifications for any user (for bulk-assign notifications)
DROP POLICY IF EXISTS "app_notifications_service_insert" ON public.app_notifications;
CREATE POLICY "app_notifications_service_insert"
ON public.app_notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Index for fast outreach_history lookups by lead_id
CREATE INDEX IF NOT EXISTS idx_outreach_history_lead_id ON public.outreach_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_history_agent_id ON public.outreach_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_outreach_history_sent_at ON public.outreach_history(sent_at DESC);
