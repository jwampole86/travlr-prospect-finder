-- Migration: Fallback Contact Page logging + Info-Request Link dashboard enhancements
-- Adds: viewed_at, resent_at to lead_info_requests; fallback_contact_log table

-- ─── Add viewed_at to lead_info_requests (track when homeowner opened the link) ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_info_requests'
      AND column_name = 'viewed_at'
  ) THEN
    ALTER TABLE public.lead_info_requests ADD COLUMN viewed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── Add resent_at to lead_info_requests (track last resend timestamp) ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_info_requests'
      AND column_name = 'resent_at'
  ) THEN
    ALTER TABLE public.lead_info_requests ADD COLUMN resent_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── Add first_name, last_name, phone, email, address_confirmed, address_as_submitted, claude_summary ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_info_requests'
      AND column_name = 'first_name'
  ) THEN
    ALTER TABLE public.lead_info_requests ADD COLUMN first_name TEXT;
    ALTER TABLE public.lead_info_requests ADD COLUMN last_name TEXT;
    ALTER TABLE public.lead_info_requests ADD COLUMN phone TEXT;
    ALTER TABLE public.lead_info_requests ADD COLUMN email TEXT;
    ALTER TABLE public.lead_info_requests ADD COLUMN address_confirmed BOOLEAN DEFAULT TRUE;
    ALTER TABLE public.lead_info_requests ADD COLUMN address_as_submitted TEXT;
    ALTER TABLE public.lead_info_requests ADD COLUMN claude_summary TEXT;
  END IF;
END $$;

-- ─── Fallback contact log table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fallback_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  agent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  address_copied_at TIMESTAMPTZ,
  message_copied_at TIMESTAMPTZ,
  source_site_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lead lookups
CREATE INDEX IF NOT EXISTS idx_fallback_contact_log_lead_id
  ON public.fallback_contact_log(lead_id);

CREATE INDEX IF NOT EXISTS idx_fallback_contact_log_source
  ON public.fallback_contact_log(source);

-- ─── RLS for fallback_contact_log ────────────────────────────────────────────
ALTER TABLE public.fallback_contact_log ENABLE ROW LEVEL SECURITY;

-- Agents can insert their own fallback log entries
CREATE POLICY "agents_insert_fallback_log"
  ON public.fallback_contact_log
  FOR INSERT
  TO authenticated
  WITH CHECK (agent_user_id = auth.uid() OR agent_user_id IS NULL);

-- Agents can read fallback logs for leads assigned to them
CREATE POLICY "agents_read_fallback_log"
  ON public.fallback_contact_log
  FOR SELECT
  TO authenticated
  USING (
    agent_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.lead_assignments la
      WHERE la.lead_id = fallback_contact_log.lead_id
        AND la.agent_user_id = auth.uid()
    )
  );

-- Admins can read all
CREATE POLICY "admins_read_all_fallback_log"
  ON public.fallback_contact_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'owner')
    )
  );

-- ─── Add fallback_contact_page_used to activity_events event_type if needed ──
-- (activity_events uses TEXT for event_type, so no enum change needed)

-- ─── Index on lead_info_requests for dashboard queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_lead_info_requests_sent_at
  ON public.lead_info_requests(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_info_requests_submitted_at
  ON public.lead_info_requests(submitted_at)
  WHERE submitted_at IS NOT NULL;
