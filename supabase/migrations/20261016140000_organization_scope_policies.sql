-- Enforce the tenant scope on leads, texts and campaign records, and close anonymous access to leads.
--
-- Before: the public anon key could read every lead (names, phones, addresses) and create or edit leads, and every signed-in
-- user, homeowners included, could read every lead and every text. After: only members of a lead's organization can see it;
-- a homeowner sees and updates only the leads linked to them; the service role (server code, cron, webhooks) is unaffected.
-- Apply this after the app release that moves server code off the anon key.

-- ── leads ────────────────────────────────────────────────────────────────────
drop policy if exists anon_insert_leads_no_owner on public.leads;
drop policy if exists anon_read_all_leads on public.leads;
drop policy if exists anon_update_leads_no_owner on public.leads;
drop policy if exists authenticated_read_all_leads on public.leads;
drop policy if exists portfolio_scoped_read_leads on public.leads;
drop policy if exists authenticated_insert_leads on public.leads;
drop policy if exists authenticated_update_leads on public.leads;
drop policy if exists authenticated_delete_leads on public.leads;

create policy leads_org_read on public.leads for select to authenticated
  using (organization_id in (select public.user_organization_ids()) and public.can_access_lead_portfolio(state));
create policy leads_org_insert on public.leads for insert to authenticated
  with check (organization_id is null or organization_id in (select public.user_organization_ids()));
create policy leads_org_update on public.leads for update to authenticated
  using (organization_id in (select public.user_organization_ids()) and (public.get_my_role() = 'admin' or user_id = auth.uid() or user_id is null))
  with check (organization_id in (select public.user_organization_ids()));
create policy leads_org_delete on public.leads for delete to authenticated
  using (organization_id in (select public.user_organization_ids()) and (public.get_my_role() = 'admin' or user_id = auth.uid()));
create policy leads_homeowner_read on public.leads for select to authenticated
  using (id in (select lead_id from public.property_homeowners where homeowner_user_id = auth.uid()));
create policy leads_homeowner_update on public.leads for update to authenticated
  using (id in (select lead_id from public.property_homeowners where homeowner_user_id = auth.uid()))
  with check (id in (select lead_id from public.property_homeowners where homeowner_user_id = auth.uid()));

-- ── texts ────────────────────────────────────────────────────────────────────
drop policy if exists outreach_history_select on public.outreach_history;
drop policy if exists outreach_history_insert on public.outreach_history;
drop policy if exists outreach_history_update on public.outreach_history;
create policy outreach_history_select on public.outreach_history for select to authenticated
  using (organization_id in (select public.user_organization_ids()));
create policy outreach_history_insert on public.outreach_history for insert to authenticated
  with check (organization_id is null or organization_id in (select public.user_organization_ids()));
create policy outreach_history_update on public.outreach_history for update to authenticated
  using (organization_id in (select public.user_organization_ids()) and (agent_id = auth.uid() or agent_id is null))
  with check (organization_id in (select public.user_organization_ids()));

drop policy if exists authenticated_all_sms_conversation_threads on public.sms_conversation_threads;
create policy sms_threads_org_all on public.sms_conversation_threads for all to authenticated
  using (organization_id in (select public.user_organization_ids()))
  with check (organization_id is null or organization_id in (select public.user_organization_ids()));

drop policy if exists authenticated_all_sms_thread_messages on public.sms_thread_messages;
create policy sms_thread_messages_org_all on public.sms_thread_messages for all to authenticated
  using (thread_id in (select id from public.sms_conversation_threads where organization_id in (select public.user_organization_ids())))
  with check (thread_id in (select id from public.sms_conversation_threads where organization_id in (select public.user_organization_ids())));

-- ── tasks ────────────────────────────────────────────────────────────────────
drop policy if exists lead_tasks_select on public.lead_tasks;
drop policy if exists lead_tasks_insert on public.lead_tasks;
drop policy if exists lead_tasks_update on public.lead_tasks;
drop policy if exists lead_tasks_delete on public.lead_tasks;
create policy lead_tasks_org_select on public.lead_tasks for select to authenticated using (organization_id in (select public.user_organization_ids()));
create policy lead_tasks_org_insert on public.lead_tasks for insert to authenticated with check (organization_id is null or organization_id in (select public.user_organization_ids()));
create policy lead_tasks_org_update on public.lead_tasks for update to authenticated using (organization_id in (select public.user_organization_ids())) with check (organization_id in (select public.user_organization_ids()));
create policy lead_tasks_org_delete on public.lead_tasks for delete to authenticated using (organization_id in (select public.user_organization_ids()));

-- Click records could be edited by anyone, signed in or not.
drop policy if exists link_clicks_update on public.link_clicks;
create policy link_clicks_update on public.link_clicks for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
