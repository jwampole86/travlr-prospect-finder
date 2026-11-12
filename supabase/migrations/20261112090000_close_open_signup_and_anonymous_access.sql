-- Closes three ways a stranger could reach staff data.
--
-- 1. Anyone could create an account (sign-ups are open and auto-confirmed), and the new-user trigger gave that account the role named in
--    its own sign-up data, or "admin" by default. A new account is now "pending" and has no access until an administrator grants a role.
--    Accounts the server creates (agent invites, homeowner portal logins) set their role explicitly right after creating the user.
-- 2. get_my_role() fell back to "admin" for anyone without a profile. It now falls back to "pending" (signed in) or "anonymous".
-- 3. The public (anon) key could read, and in some tables change, staff data: activity events, CSV import rows (raw addresses, names and phone
--    numbers), email templates and more. Staff tables lose their anonymous grants, and the hiring tables are limited to admins.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url, app_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    'pending'
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.user_profiles.full_name);
  return new;
end;
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select app_role from public.user_profiles where id = auth.uid() limit 1),
    case when auth.uid() is null then 'anonymous' else 'pending' end
  )
$$;

-- Staff-only tables: no anonymous access of any kind. (regulation_rules and state_compliance_rules stay readable: reference data.)
do $$
declare t text;
begin
  foreach t in array array[
    'activity_events', 'cadence_configs', 'cron_job_runs', 'csv_import_batches', 'csv_import_row_outcomes', 'email_templates',
    'payout_config', 'portfolio_registry', 'portfolio_sync_status', 'sync_source_coverage', 'trulia_source_configs',
    'contact_history', 'lead_reminders', 'outreach_cadences', 'scheduled_sends', 'sequence_enrollments',
    'enrichment_error_logs', 'lead_activity_log', 'sync_events', 'sync_validation_errors'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- New tables are not readable by the public key unless a migration grants it on purpose.
alter default privileges in schema public revoke all on tables from anon;

-- Hiring data: administrators only (it was open to every signed-in user).
do $$
declare
  admin_check constant text := $c$ public.get_my_role() in ('admin', 'owner', 'operator', 'super_admin') $c$;
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('candidates', 'candidate_audit_events', 'candidate_scorecards', 'interview_sessions')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  execute format('create policy admins_manage_candidates on public.candidates for all to authenticated using (%s) with check (%s)', admin_check, admin_check);
  execute format('create policy admins_manage_candidate_audit on public.candidate_audit_events for all to authenticated using (%s) with check (%s)', admin_check, admin_check);
  execute format('create policy admins_manage_scorecards on public.candidate_scorecards for all to authenticated using (%s) with check (%s)', admin_check, admin_check);
  execute format('create policy admins_manage_interview_sessions on public.interview_sessions for all to authenticated using (%s) with check (%s)', admin_check, admin_check);
end $$;
