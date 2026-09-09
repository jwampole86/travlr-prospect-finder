-- ============================================================
-- RLS Policies for Agent, Territory, Workflow, and Activity tables
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_territory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_lead_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surplus_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

-- agent_profiles: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_agent_profiles" ON public.agent_profiles;
CREATE POLICY "users_manage_own_agent_profiles"
ON public.agent_profiles
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- territories: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_territories" ON public.territories;
CREATE POLICY "users_manage_own_territories"
ON public.territories
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- agent_territory_assignments: scoped via agent ownership
DROP POLICY IF EXISTS "users_manage_own_agent_territory_assignments" ON public.agent_territory_assignments;
CREATE POLICY "users_manage_own_agent_territory_assignments"
ON public.agent_territory_assignments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agent_profiles ap
    WHERE ap.id = agent_territory_assignments.agent_id
    AND ap.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agent_profiles ap
    WHERE ap.id = agent_territory_assignments.agent_id
    AND ap.owner_user_id = auth.uid()
  )
);

-- commission_splits: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_commission_splits" ON public.commission_splits;
CREATE POLICY "users_manage_own_commission_splits"
ON public.commission_splits
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- agent_lead_permissions: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_agent_lead_permissions" ON public.agent_lead_permissions;
CREATE POLICY "users_manage_own_agent_lead_permissions"
ON public.agent_lead_permissions
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- surplus_leads: scoped to user_id
DROP POLICY IF EXISTS "users_manage_own_surplus_leads" ON public.surplus_leads;
CREATE POLICY "users_manage_own_surplus_leads"
ON public.surplus_leads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- sequence_workflows: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_sequence_workflows" ON public.sequence_workflows;
CREATE POLICY "users_manage_own_sequence_workflows"
ON public.sequence_workflows
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- sequence_steps: scoped via workflow ownership
DROP POLICY IF EXISTS "users_manage_own_sequence_steps" ON public.sequence_steps;
CREATE POLICY "users_manage_own_sequence_steps"
ON public.sequence_steps
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sequence_workflows sw
    WHERE sw.id = sequence_steps.workflow_id
    AND sw.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sequence_workflows sw
    WHERE sw.id = sequence_steps.workflow_id
    AND sw.owner_user_id = auth.uid()
  )
);

-- escalation_rules: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_escalation_rules" ON public.escalation_rules;
CREATE POLICY "users_manage_own_escalation_rules"
ON public.escalation_rules
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- sequence_activity_log: scoped via workflow ownership
DROP POLICY IF EXISTS "users_manage_own_sequence_activity_log" ON public.sequence_activity_log;
CREATE POLICY "users_manage_own_sequence_activity_log"
ON public.sequence_activity_log
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sequence_workflows sw
    WHERE sw.id = sequence_activity_log.workflow_id
    AND sw.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sequence_workflows sw
    WHERE sw.id = sequence_activity_log.workflow_id
    AND sw.owner_user_id = auth.uid()
  )
);

-- team_members: scoped to owner_user_id
DROP POLICY IF EXISTS "users_manage_own_team_members" ON public.team_members;
CREATE POLICY "users_manage_own_team_members"
ON public.team_members
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- operator_settings: scoped to user_id
DROP POLICY IF EXISTS "users_manage_own_operator_settings" ON public.operator_settings;
CREATE POLICY "users_manage_own_operator_settings"
ON public.operator_settings
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- sync_schedules: scoped to user_id
DROP POLICY IF EXISTS "users_manage_own_sync_schedules" ON public.sync_schedules;
CREATE POLICY "users_manage_own_sync_schedules"
ON public.sync_schedules
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- app_notifications: scoped to user_id
DROP POLICY IF EXISTS "users_manage_own_app_notifications" ON public.app_notifications;
CREATE POLICY "users_manage_own_app_notifications"
ON public.app_notifications
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_profiles_owner ON public.agent_profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_territories_owner ON public.territories(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_owner ON public.commission_splits(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_agent ON public.commission_splits(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_lead_permissions_owner ON public.agent_lead_permissions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_lead_permissions_agent ON public.agent_lead_permissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sequence_workflows_owner ON public.sequence_workflows(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_owner ON public.escalation_rules(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sequence_activity_log_workflow ON public.sequence_activity_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_surplus_leads_user ON public.surplus_leads(user_id);
