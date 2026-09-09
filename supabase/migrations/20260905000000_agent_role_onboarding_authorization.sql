-- ============================================================
-- TRAVLR Agent Role, Onboarding & Authorization Migration
-- Timestamp: 20260905000000
-- ============================================================

-- ── 1. Add onboarding tracking columns to user_profiles ──────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS agent_onboarding_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_onboarding_version      TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS is_active                     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone                         TEXT,
  ADD COLUMN IF NOT EXISTS timezone                      TEXT DEFAULT 'America/Los_Angeles';

-- ── 1b. Add missing columns to leads required by agent functions ──────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_followup_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_status       TEXT;

-- ── 1c. Extend activity_events event_type CHECK to include agent event types ──
DO $$
BEGIN
  -- Drop the existing check constraint if it exists so we can recreate it
  -- with the additional agent-related event types
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'activity_events'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%event_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.activity_events DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'activity_events'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%event_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_event_type_check CHECK (event_type IN (
    'lead_created',
    'csv_imported',
    'stage_changed',
    'score_updated',
    'note_added',
    'note_edited',
    'regulation_refreshed',
    'live_status',
    'lead_edited',
    'contact_updated',
    'lead_assigned',
    'lead_archived',
    'lead_restored',
    'bulk_update',
    'enrichment_completed',
    'outreach_sent',
    'email_sent',
    'sms_sent',
    'call_outcome_recorded',
    'follow_up_scheduled',
    'agent_deactivated',
    'leads_bulk_reassigned'
  ));

-- ── 2. Add phone field to agent_invites if missing ───────────────────────────
ALTER TABLE public.agent_invites
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── 3. Agent-scoped lead access helper function ──────────────────────────────
-- Returns TRUE if the calling user (must be AGENT role) is assigned to the lead.
-- Used by RLS policies and API authorization checks.
CREATE OR REPLACE FUNCTION public.agent_can_access_lead(p_lead_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = p_lead_id
      AND l.primary_agent_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.lead_agent_assignments laa
    WHERE laa.lead_id = p_lead_id
      AND laa.agent_id = auth.uid()
      AND (laa.unassigned_at IS NULL OR laa.unassigned_at > now())
  );
$$;

-- ── 4. Role helper functions ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT app_role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid() LIMIT 1),
    'agent'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_my_app_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_agent_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_my_app_role() = 'agent';
$$;

CREATE OR REPLACE FUNCTION public.is_active_agent()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND app_role = 'agent'
      AND (is_active IS NULL OR is_active = true)
  );
$$;

-- ── 5. Agent onboarding status function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_agent_onboarding_status(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN up.agent_onboarding_completed_at IS NOT NULL THEN 'READY'
    WHEN up.agent_onboarding_started_at IS NOT NULL THEN 'ONBOARDING_IN_PROGRESS'
    WHEN up.created_at IS NOT NULL THEN 'ACCOUNT_CREATED'
    ELSE 'INVITED'
  END
  FROM public.user_profiles up
  WHERE up.id = p_user_id
  LIMIT 1;
$$;

-- ── 6. Mark agent onboarding complete ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_agent_onboarding(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    agent_onboarding_completed_at = now(),
    agent_onboarding_version = '1.0'
  WHERE id = p_user_id;
END;
$$;

-- ── 7. Agent dashboard summary RPC ───────────────────────────────────────────
-- Returns KPIs scoped to the calling agent's assigned leads only.
CREATE OR REPLACE FUNCTION public.get_agent_dashboard_summary()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'assigned_leads',       COUNT(DISTINCT l.id),
    'priority_leads',       COUNT(DISTINCT l.id) FILTER (WHERE l.is_high_priority = true OR l.priority_tier = 1),
    'luxury_leads',         COUNT(DISTINCT l.id) FILTER (WHERE l.luxury = true),
    'fully_verified',       COUNT(DISTINCT l.id) FILTER (WHERE l.verified_owner = true AND l.verified_address IS NOT NULL AND l.verified_address <> '' AND l.verified_number = true),
    'phone_available',      COUNT(DISTINCT l.id) FILTER (WHERE l.phone IS NOT NULL AND l.phone <> ''),
    'new_this_week',        COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= now() - interval '7 days'),
    'follow_ups_due',       COUNT(DISTINCT l.id) FILTER (WHERE l.next_followup_due IS NOT NULL AND l.next_followup_due <= now() + interval '24 hours' AND l.next_followup_due >= now()),
    'overdue_follow_ups',   COUNT(DISTINCT l.id) FILTER (WHERE l.next_followup_due IS NOT NULL AND l.next_followup_due < now()),
    'calls_today',          (
      SELECT COUNT(*) FROM public.outreach_call_log ocl
      WHERE ocl.agent_id = v_agent_id
        AND ocl.created_at >= CURRENT_DATE
    ),
    'connected_today',      (
      SELECT COUNT(*) FROM public.outreach_call_log ocl
      WHERE ocl.agent_id = v_agent_id
        AND ocl.created_at >= CURRENT_DATE
        AND ocl.outcome IN ('connected', 'interested', 'follow_up_scheduled', 'appointment_scheduled')
    ),
    'notes_today',          (
      SELECT COUNT(*) FROM public.activity_events ae
      WHERE ae.user_id = v_agent_id
        AND ae.created_at >= CURRENT_DATE
        AND ae.event_type = 'note_added'
    )
  )
  INTO v_result
  FROM public.leads l
  WHERE l.primary_agent_id = v_agent_id
     OR EXISTS (
       SELECT 1 FROM public.lead_agent_assignments laa
       WHERE laa.lead_id = l.id
         AND laa.agent_id = v_agent_id
         AND (laa.unassigned_at IS NULL OR laa.unassigned_at > now())
     );

  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

-- ── 8. Get agent's assigned leads (paginated, server-side scoped) ─────────────
CREATE OR REPLACE FUNCTION public.get_agent_leads(
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_priority_only BOOLEAN DEFAULT false,
  p_follow_up_due BOOLEAN DEFAULT false,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(
  id TEXT,
  owner_name TEXT,
  property_address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  is_high_priority BOOLEAN,
  luxury BOOLEAN,
  verified_owner BOOLEAN,
  verified_address TEXT,
  verified_number BOOLEAN,
  lead_status TEXT,
  stage TEXT,
  prospect_score INT,
  next_followup_due TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  do_not_contact BOOLEAN,
  estimated_net_monthly NUMERIC,
  notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.owner_name,
    l.property_address,
    l.city,
    l.state,
    l.phone,
    COALESCE(l.is_high_priority, false),
    COALESCE(l.luxury, false),
    COALESCE(l.verified_owner, false),
    l.verified_address,
    COALESCE(l.verified_number, false),
    l.lead_status,
    l.stage,
    l.prospect_score,
    l.next_followup_due,
    l.last_contacted_at,
    l.created_at,
    COALESCE(l.do_not_contact, false),
    l.estimated_net_monthly,
    l.notes
  FROM public.leads l
  WHERE (
    l.primary_agent_id = v_agent_id
    OR EXISTS (
      SELECT 1 FROM public.lead_agent_assignments laa
      WHERE laa.lead_id = l.id
        AND laa.agent_id = v_agent_id
        AND (laa.unassigned_at IS NULL OR laa.unassigned_at > now())
    )
  )
  AND (p_priority_only = false OR l.is_high_priority = true OR l.priority_tier = 1)
  AND (p_follow_up_due = false OR (l.next_followup_due IS NOT NULL AND l.next_followup_due <= now() + interval '24 hours'))
  AND (p_search IS NULL OR p_search = '' OR
       l.owner_name ILIKE '%' || p_search || '%' OR
       l.property_address ILIKE '%' || p_search || '%' OR
       l.city ILIKE '%' || p_search || '%')
  ORDER BY
    COALESCE(l.is_high_priority, false) DESC,
    COALESCE(l.luxury, false) DESC,
    l.prospect_score DESC NULLS LAST,
    l.next_followup_due ASC NULLS LAST,
    l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ── 9. Record call outcome (agent-scoped write) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_record_call_outcome(
  p_lead_id   TEXT,
  p_outcome   TEXT,
  p_notes     TEXT DEFAULT NULL,
  p_follow_up TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
  v_call_id  UUID;
BEGIN
  -- Authorization: agent must be assigned to this lead
  IF NOT public.agent_can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Lead not assigned to this agent';
  END IF;

  -- Do not contact check
  IF EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND do_not_contact = true) THEN
    RAISE EXCEPTION 'FORBIDDEN: Lead is marked Do Not Contact';
  END IF;

  -- Insert call log
  INSERT INTO public.outreach_call_log (
    lead_id, agent_id, outcome, notes, created_at
  ) VALUES (
    p_lead_id, v_agent_id, p_outcome, p_notes, now()
  )
  RETURNING id INTO v_call_id;

  -- Update lead follow-up if provided
  IF p_follow_up IS NOT NULL THEN
    UPDATE public.leads
    SET next_followup_due = p_follow_up,
        last_contacted_at = now()
    WHERE id = p_lead_id;
  ELSE
    UPDATE public.leads
    SET last_contacted_at = now()
    WHERE id = p_lead_id;
  END IF;

  -- Create activity event (user_id = agent performing the action)
  INSERT INTO public.activity_events (
    lead_id, user_id, actor_user_id, event_type, description, metadata
  ) VALUES (
    p_lead_id, v_agent_id, v_agent_id, 'call_outcome_recorded',
    'Call outcome recorded',
    jsonb_build_object('outcome', p_outcome, 'call_id', v_call_id)
  );

  RETURN json_build_object('success', true, 'call_id', v_call_id);
END;
$$;

-- ── 10. Add agent note (agent-scoped write) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_add_note(
  p_lead_id TEXT,
  p_note    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
BEGIN
  IF NOT public.agent_can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Lead not assigned to this agent';
  END IF;

  -- Append note to lead notes field
  UPDATE public.leads
  SET notes = CASE
    WHEN notes IS NULL OR notes = '' THEN p_note
    ELSE notes || E'\n\n' || p_note
  END
  WHERE id = p_lead_id;

  -- Activity event (user_id = agent performing the action)
  INSERT INTO public.activity_events (
    lead_id, user_id, actor_user_id, event_type, description, metadata
  ) VALUES (
    p_lead_id, v_agent_id, v_agent_id, 'note_added',
    'Note added',
    jsonb_build_object('note_preview', LEFT(p_note, 100))
  );

  RETURN json_build_object('success', true);
END;
$$;

-- ── 11. Schedule follow-up (agent-scoped write) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_schedule_follow_up(
  p_lead_id   TEXT,
  p_follow_up TIMESTAMPTZ,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
BEGIN
  IF NOT public.agent_can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Lead not assigned to this agent';
  END IF;

  UPDATE public.leads
  SET next_followup_due = p_follow_up
  WHERE id = p_lead_id;

  INSERT INTO public.activity_events (
    lead_id, user_id, actor_user_id, event_type, description, metadata
  ) VALUES (
    p_lead_id, v_agent_id, v_agent_id, 'follow_up_scheduled',
    'Follow-up scheduled',
    jsonb_build_object('follow_up_at', p_follow_up, 'reason', p_reason)
  );

  RETURN json_build_object('success', true);
END;
$$;

-- ── 12. Admin: get agent management list ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_agent_list()
RETURNS TABLE(
  user_id                    UUID,
  full_name                  TEXT,
  email                      TEXT,
  app_role                   TEXT,
  is_active                  BOOLEAN,
  agent_onboarding_completed_at TIMESTAMPTZ,
  agent_onboarding_started_at   TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ,
  deactivated_at             TIMESTAMPTZ,
  invite_status              TEXT,
  invite_id                  UUID,
  invite_expires_at          TIMESTAMPTZ,
  assigned_leads             BIGINT,
  priority_leads             BIGINT,
  follow_ups_due             BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Only admins may call this
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin only';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    up.full_name,
    up.email,
    up.app_role,
    COALESCE(up.is_active, true),
    up.agent_onboarding_completed_at,
    up.agent_onboarding_started_at,
    up.created_at,
    up.deactivated_at,
    ai.status,
    ai.id,
    ai.expires_at,
    (SELECT COUNT(*) FROM public.leads l WHERE l.primary_agent_id = up.id),
    (SELECT COUNT(*) FROM public.leads l WHERE l.primary_agent_id = up.id AND (l.is_high_priority = true OR l.priority_tier = 1)),
    (SELECT COUNT(*) FROM public.leads l WHERE l.primary_agent_id = up.id AND l.next_followup_due IS NOT NULL AND l.next_followup_due <= now() + interval '24 hours')
  FROM public.user_profiles up
  LEFT JOIN public.agent_invites ai ON ai.agent_user_id = up.id
  WHERE up.app_role = 'agent'
  ORDER BY up.created_at DESC;
END;
$$;

-- ── 13. Admin: deactivate agent ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_deactivate_agent(p_agent_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin only';
  END IF;

  UPDATE public.user_profiles
  SET is_active = false,
      deactivated_at = now()
  WHERE id = p_agent_user_id AND app_role = 'agent';

  -- Log the deactivation (user_id = admin performing the action)
  INSERT INTO public.activity_events (
    user_id, actor_user_id, event_type, description, metadata
  ) VALUES (
    auth.uid(), auth.uid(), 'agent_deactivated',
    'Agent deactivated',
    jsonb_build_object('deactivated_agent_id', p_agent_user_id)
  );

  RETURN json_build_object('success', true);
END;
$$;

-- ── 14. Admin: reactivate agent ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reactivate_agent(p_agent_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin only';
  END IF;

  UPDATE public.user_profiles
  SET is_active = true,
      deactivated_at = NULL
  WHERE id = p_agent_user_id AND app_role = 'agent';

  RETURN json_build_object('success', true);
END;
$$;

-- ── 15. Admin: reassign leads from one agent to another ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_reassign_agent_leads(
  p_from_agent_id UUID,
  p_to_agent_id   UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin only';
  END IF;

  UPDATE public.leads
  SET primary_agent_id = p_to_agent_id
  WHERE primary_agent_id = p_from_agent_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.activity_events (
    user_id, actor_user_id, event_type, description, metadata
  ) VALUES (
    auth.uid(), auth.uid(), 'leads_bulk_reassigned',
    'Leads bulk reassigned',
    jsonb_build_object(
      'from_agent_id', p_from_agent_id,
      'to_agent_id', p_to_agent_id,
      'lead_count', v_count
    )
  );

  RETURN json_build_object('success', true, 'leads_reassigned', v_count);
END;
$$;

-- ── 16. Indexes for agent-scoped queries ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_primary_agent_id
  ON public.leads(primary_agent_id)
  WHERE primary_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_priority
  ON public.leads(primary_agent_id, is_high_priority, prospect_score DESC)
  WHERE primary_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_follow_up
  ON public.leads(primary_agent_id, next_followup_due)
  WHERE primary_agent_id IS NOT NULL AND next_followup_due IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_call_log_agent_date
  ON public.outreach_call_log(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_agent_type
  ON public.activity_events(user_id, event_type, event_timestamp DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_app_role
  ON public.user_profiles(app_role)
  WHERE app_role IS NOT NULL;

-- ── 17. RLS: agent_invites — agents can read their own invite ─────────────────
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_invites_admin_all" ON public.agent_invites;
CREATE POLICY "agent_invites_admin_all"
  ON public.agent_invites
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "agent_invites_own_read" ON public.agent_invites;
CREATE POLICY "agent_invites_own_read"
  ON public.agent_invites
  FOR SELECT
  TO authenticated
  USING (agent_user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1));

-- ── 18. RLS: activity_events — agents see only their own ─────────────────────
DROP POLICY IF EXISTS "activity_events_agent_own" ON public.activity_events;
CREATE POLICY "activity_events_agent_own"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR user_id = auth.uid()
    OR (public.is_agent_user() AND public.agent_can_access_lead(lead_id))
  );

-- ── 19. RLS: outreach_call_log — agents see only their own ───────────────────
DROP POLICY IF EXISTS "outreach_call_log_agent_own" ON public.outreach_call_log;
CREATE POLICY "outreach_call_log_agent_own"
  ON public.outreach_call_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR agent_id = auth.uid()
  );

DROP POLICY IF EXISTS "outreach_call_log_agent_insert" ON public.outreach_call_log;
CREATE POLICY "outreach_call_log_agent_insert"
  ON public.outreach_call_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    AND (public.is_admin_user() OR public.agent_can_access_lead(lead_id))
  );
