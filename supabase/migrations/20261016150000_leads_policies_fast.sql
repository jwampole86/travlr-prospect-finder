-- The organization policies on leads called can_access_lead_portfolio(state) for every row (a SECURITY DEFINER function Postgres
-- cannot inline), so counting all leads took 4 seconds and a burst of dashboard queries timed out. The portfolio check does not
-- depend on the row except for its state, so it is worked out once per query and compared with the row's state.

create or replace function public.portfolio_scope_is_open()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_my_role() = 'admin'
     or not exists (select 1 from public.agent_portfolio_assignments where agent_user_id = auth.uid())
$$;

create or replace function public.my_portfolio_state_list()
returns setof text
language sql stable security definer set search_path = public
as $$ select unnest(public.get_my_portfolio_states()) $$;

drop policy if exists leads_org_read on public.leads;
create policy leads_org_read on public.leads for select to authenticated
  using (
    organization_id in (select public.user_organization_ids())
    and ((select public.portfolio_scope_is_open()) or state in (select public.my_portfolio_state_list()))
  );

drop policy if exists leads_org_update on public.leads;
create policy leads_org_update on public.leads for update to authenticated
  using (
    organization_id in (select public.user_organization_ids())
    and ((select public.get_my_role()) = 'admin' or user_id = (select auth.uid()) or user_id is null)
  )
  with check (organization_id in (select public.user_organization_ids()));

drop policy if exists leads_org_delete on public.leads;
create policy leads_org_delete on public.leads for delete to authenticated
  using (
    organization_id in (select public.user_organization_ids())
    and ((select public.get_my_role()) = 'admin' or user_id = (select auth.uid()))
  );
