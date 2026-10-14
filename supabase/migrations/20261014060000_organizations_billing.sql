-- Organizations (tenants), membership, billing state and usage metering.
-- Scope of tenancy in this migration: contract company profile, signing sessions,
-- managed properties, cleaners and cleaning jobs. Other tables are still shared.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'customer' check (kind in ('customer', 'internal')),
  plan_key text not null default 'starter' check (plan_key in ('starter', 'pro', 'business', 'enterprise')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  subscription_status text not null default 'incomplete'
    check (subscription_status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'internal')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
-- One organization per user for now.
create unique index if not exists organization_members_user_key on public.organization_members(user_id);

create table if not exists public.organization_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  metric text not null,
  quantity integer not null default 0,
  primary key (organization_id, period_start, metric)
);

-- Idempotency log for Stripe webhook deliveries.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.user_organization_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.organization_members where user_id = auth.uid() $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_usage enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated
  using (id in (select public.user_organization_ids()));
drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated
  using (organization_id in (select public.user_organization_ids()));
drop policy if exists organization_usage_read on public.organization_usage;
create policy organization_usage_read on public.organization_usage for select to authenticated
  using (organization_id in (select public.user_organization_ids()));

drop policy if exists service_role_organizations on public.organizations;
create policy service_role_organizations on public.organizations for all to service_role using (true) with check (true);
drop policy if exists service_role_organization_members on public.organization_members;
create policy service_role_organization_members on public.organization_members for all to service_role using (true) with check (true);
drop policy if exists service_role_organization_usage on public.organization_usage;
create policy service_role_organization_usage on public.organization_usage for all to service_role using (true) with check (true);
drop policy if exists service_role_stripe_events on public.stripe_events;
create policy service_role_stripe_events on public.stripe_events for all to service_role using (true) with check (true);

-- The operator that already uses the platform becomes the first, internal organization.
insert into public.organizations (name, slug, kind, plan_key, subscription_status)
values ('TRAVLR Vacation Homes', 'travlr-vacation-homes', 'internal', 'enterprise', 'internal')
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, user_id, role)
select o.id, p.id,
  case when u.email = 'jen@staytrvlr.com' then 'owner' when p.role = 'admin' then 'admin' else 'member' end
from public.user_profiles p
join auth.users u on u.id = p.id
cross join (select id from public.organizations where slug = 'travlr-vacation-homes') o
where coalesce(p.role, '') <> 'homeowner'
on conflict do nothing;

-- Tenant columns, backfilled to the first organization.
do $$
declare org uuid := (select id from public.organizations where slug = 'travlr-vacation-homes');
declare t text;
begin
  foreach t in array array['managed_properties', 'cleaners', 'cleaning_jobs', 'signing_sessions', 'contract_company_profile'] loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', t);
    execute format('update public.%I set organization_id = $1 where organization_id is null', t) using org;
    execute format('create index if not exists %I on public.%I(organization_id)', t || '_org_idx', t);
  end loop;
end $$;

-- Each organization keeps its own legal-entity profile instead of the single shared row.
alter table public.contract_company_profile drop constraint if exists contract_company_profile_id_check;
create unique index if not exists contract_company_profile_org_key on public.contract_company_profile(organization_id);
alter table public.contract_company_profile alter column id drop default;
create sequence if not exists public.contract_company_profile_id_seq owned by public.contract_company_profile.id;
select setval('public.contract_company_profile_id_seq', coalesce((select max(id) from public.contract_company_profile), 1));
alter table public.contract_company_profile alter column id set default nextval('public.contract_company_profile_id_seq');

-- Direct (non-service) access is limited to the user's own organization.
drop policy if exists cleaners_admin_all on public.cleaners;
create policy cleaners_admin_all on public.cleaners for all to authenticated
  using (get_my_role() = any (array['admin', 'agent']) and organization_id in (select public.user_organization_ids()))
  with check (get_my_role() = any (array['admin', 'agent']) and organization_id in (select public.user_organization_ids()));

drop policy if exists cleaning_jobs_admin_agent_all on public.cleaning_jobs;
create policy cleaning_jobs_admin_agent_all on public.cleaning_jobs for all to authenticated
  using (get_my_role() = any (array['admin', 'agent']) and organization_id in (select public.user_organization_ids()))
  with check (get_my_role() = any (array['admin', 'agent']) and organization_id in (select public.user_organization_ids()));
