-- Unified property registry (NAVEO x AVYRO milestone 01): one canonical identity per property, with every system's own record
-- (an AVYRO lead, a NAVEO Homes listing, a Stays managed property, a Live showcase) linked to it rather than overwritten.
-- Each business keeps its own operational records; this registry only owns the cross-system references and the review trail.
-- A source record is not proof of ownership, contact permission, marketing authorization or seller intent, and nothing here grants any.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  -- A building/parcel; individual units (apartments, condos, separate rentals) live in property_units.
  kind text not null default 'parcel' check (kind in ('parcel', 'building')),
  street_number text,
  street_name text,
  city text,
  state text,
  zip5 text,
  -- Normalised address key (zip + number + street, no unit) used to find the same building quickly.
  address_key text not null,
  lat double precision,
  lng double precision,
  parcel_id text,
  status text not null default 'active' check (status in ('active', 'merged', 'retired')),
  merged_into uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'merged' or merged_into is not null)
);
create index if not exists properties_address_key_idx on public.properties (organization_id, address_key) where status = 'active';
create index if not exists properties_zip_number_idx on public.properties (organization_id, zip5, street_number) where status = 'active';

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_label text not null,
  created_at timestamptz not null default now(),
  unique (property_id, unit_label)
);

-- Maps a system's own id to the canonical property. Existing application ids are never overwritten.
create table if not exists public.property_source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  source_system text not null check (source_system in ('avyro', 'homes', 'stays', 'live')),
  source_id text not null,
  match_method text not null check (match_method in ('exact_address', 'created', 'manual', 'review_resolved')),
  confidence numeric not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id)
);
create index if not exists property_source_links_property_idx on public.property_source_links (property_id);

-- Source-backed facts with timestamps, so a stale or conflicting value can be explained rather than silently overwritten.
create table if not exists public.property_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_system text not null,
  source_id text,
  field text not null,
  value jsonb,
  reliability text not null default 'unverified' check (reliability in ('verified', 'unverified', 'estimated')),
  observed_at timestamptz not null default now()
);
create index if not exists property_observations_property_idx on public.property_observations (property_id, field, observed_at desc);

-- Possible duplicates and disputed matches. Nothing is merged automatically unless the match is exact and unambiguous.
create table if not exists public.identity_review_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  property_id uuid not null references public.properties(id) on delete cascade,
  candidate_property_id uuid not null references public.properties(id) on delete cascade,
  reason text not null check (reason in ('similar_address', 'unit_ambiguity', 'nearby_coordinates', 'conflicting_details')),
  score numeric not null check (score between 0 and 1),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'merged', 'kept_separate')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (property_id <> candidate_property_id)
);
create unique index if not exists identity_review_cases_pair_idx
  on public.identity_review_cases (least(property_id, candidate_property_id), greatest(property_id, candidate_property_id), reason);
create index if not exists identity_review_cases_open_idx on public.identity_review_cases (organization_id, status) where status = 'open';

create or replace function public.set_property_registry_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists properties_updated_at on public.properties;
create trigger properties_updated_at before update on public.properties for each row execute function public.set_property_registry_updated_at();

do $$
declare t text;
begin
  foreach t in array array['properties', 'property_units', 'property_source_links', 'property_observations', 'identity_review_cases'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_org', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'') with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'')',
      t || '_admin_org', t);
  end loop;
end $$;
