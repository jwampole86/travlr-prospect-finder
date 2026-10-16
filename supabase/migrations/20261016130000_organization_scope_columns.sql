-- Tenant scope for leads, texts and campaigns: an organization_id on the tables that hold them, backfilled to the first
-- (internal) organization and filled automatically on insert. Additive: nothing here changes who can read what. The policies
-- that enforce the scope are in the next migration, which is applied once the app no longer relies on anonymous access.

-- The organization new rows belong to: the signed-in user's own organization, otherwise the internal one (jobs and webhooks).
create or replace function public.default_organization_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select organization_id from public.organization_members where user_id = auth.uid() order by created_at limit 1),
    (select id from public.organizations where kind = 'internal' order by created_at limit 1)
  )
$$;

do $$
declare org uuid := (select id from public.organizations where kind = 'internal' order by created_at limit 1);
declare t text;
begin
  foreach t in array array['leads', 'outreach_history', 'sms_conversation_threads', 'lead_tasks', 'sms_lead_engagement'] loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', t);
  end loop;
  update public.leads set organization_id = org where organization_id is null;
  foreach t in array array['outreach_history', 'sms_conversation_threads', 'lead_tasks', 'sms_lead_engagement'] loop
    execute format('update public.%I x set organization_id = coalesce((select l.organization_id from public.leads l where l.id = x.lead_id), $1) where x.organization_id is null', t) using org;
  end loop;
  foreach t in array array['leads', 'outreach_history', 'sms_conversation_threads', 'lead_tasks', 'sms_lead_engagement'] loop
    execute format('create index if not exists %I on public.%I(organization_id)', t || '_org_idx', t);
  end loop;
end $$;

create or replace function public.set_lead_organization()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.organization_id is null then new.organization_id := public.default_organization_id(); end if;
  return new;
end $$;

-- Rows that belong to a lead take that lead's organization.
create or replace function public.set_organization_from_lead()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.organization_id is null then
    new.organization_id := coalesce((select organization_id from public.leads where id = new.lead_id), public.default_organization_id());
  end if;
  return new;
end $$;

drop trigger if exists leads_set_organization on public.leads;
create trigger leads_set_organization before insert on public.leads for each row execute function public.set_lead_organization();
do $$
declare t text;
begin
  foreach t in array array['outreach_history', 'sms_conversation_threads', 'lead_tasks', 'sms_lead_engagement'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_organization', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.set_organization_from_lead()', t || '_set_organization', t);
  end loop;
end $$;

-- Staff added later join the internal organization until self-serve signup gives them their own.
create or replace function public.add_staff_to_internal_organization()
returns trigger language plpgsql security definer set search_path = public
as $$ declare org uuid := (select id from public.organizations where kind = 'internal' order by created_at limit 1);
begin
  if org is not null and coalesce(new.role, '') <> 'homeowner' and coalesce(new.app_role, '') <> 'homeowner' then
    insert into public.organization_members (organization_id, user_id, role)
    values (org, new.id, case when coalesce(new.app_role, new.role, '') = 'admin' then 'admin' else 'member' end)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists user_profiles_join_internal_org on public.user_profiles;
create trigger user_profiles_join_internal_org after insert or update of role, app_role on public.user_profiles
  for each row execute function public.add_staff_to_internal_organization();

-- Anyone already on the platform and not yet a member.
insert into public.organization_members (organization_id, user_id, role)
select o.id, p.id, case when coalesce(p.app_role, p.role, '') = 'admin' then 'admin' else 'member' end
from public.user_profiles p cross join (select id from public.organizations where kind = 'internal' order by created_at limit 1) o
where coalesce(p.role, '') <> 'homeowner' and coalesce(p.app_role, '') <> 'homeowner'
on conflict do nothing;
