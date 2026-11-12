-- An agent used to see every lead whenever no portfolio had been assigned to them ("no portfolio = open"), and could edit any lead with no owner.
-- Now an agent sees (and edits) the leads assigned to them, plus any lead in a portfolio state an admin has given them. Admin-type roles see everything.
create or replace function public.portfolio_scope_is_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() in ('admin', 'owner', 'operator', 'super_admin')
$$;

create or replace function public.can_access_enrichment_for_lead(p_lead_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() in ('admin', 'owner', 'operator', 'super_admin')
    or public.agent_can_access_lead(p_lead_id)
    or exists (select 1 from public.leads l where l.id = p_lead_id and l.state = any (public.get_my_portfolio_states()))
$$;

alter policy leads_org_read on public.leads using (
  organization_id in (select public.user_organization_ids())
  and (
    (select public.portfolio_scope_is_open())
    or state in (select public.my_portfolio_state_list())
    or primary_agent_id = (select auth.uid())
    or id in (select lead_id from public.lead_agent_assignments where agent_id = (select auth.uid()) and unassigned_at is null)
  )
);

alter policy leads_org_update on public.leads using (
  organization_id in (select public.user_organization_ids())
  and (
    (select public.get_my_role()) in ('admin', 'owner', 'operator', 'super_admin')
    or user_id = (select auth.uid())
    or primary_agent_id = (select auth.uid())
  )
);
