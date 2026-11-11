-- NAVEO Stays listings: AVYRO owns the property record, nightly pricing, status and availability; staynaveo.com reads them through the NAVEO key.
-- A listing reaches guests only when status = 'active' AND quality_approved. Private details (wifi, access) are stored here but never returned by the public endpoints.
create table if not exists public.stays_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id text references public.leads(id) on delete set null,
  stays_property_id text,
  title text not null,
  address text,
  city text, state text, country text, neighborhood text, latitude numeric, longitude numeric,
  property_type text,
  bedrooms numeric, bathrooms numeric, max_guests integer,
  description text,
  amenities jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  price_per_night numeric(10,2) not null check (price_per_night >= 0),
  cleaning_fee numeric(10,2) not null default 0 check (cleaning_fee >= 0),
  min_nights integer not null default 1 check (min_nights >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'blocked', 'maintenance')),
  quality_approved boolean not null default false,
  quality_note text,
  eligibility jsonb not null default '{}'::jsonb,
  sale_status jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  private_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stays_listings_stays_property_uq on public.stays_listings (organization_id, stays_property_id) where stays_property_id is not null;
create index if not exists stays_listings_live_idx on public.stays_listings (organization_id, status) where quality_approved;

-- Dates a listing cannot be booked. end_date is the first free day (exclusive), like a check-out date.
create table if not exists public.stays_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.stays_listings(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default 'other' check (reason in ('booking', 'owner', 'showing', 'maintenance', 'other')),
  source text,
  note text,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index if not exists stays_calendar_blocks_listing_idx on public.stays_calendar_blocks (listing_id, start_date, end_date);

-- Only the server (service role) reads or writes these; people and NAVEO reach them through authorized API routes.
do $$ declare t text; begin
  foreach t in array array['stays_listings', 'stays_calendar_blocks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role_%1$s" on public.%1$I', t);
    execute format('create policy "service_role_%1$s" on public.%1$I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
