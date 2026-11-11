-- NAVEO Stays bookings, reviews and listing gates. AVYRO decides availability: a booking and its calendar block are created together under a row lock,
-- so two guests can never hold the same night.

-- A listing is bookable only when nothing recorded against it blocks short-term rental. Empty eligibility means nothing is recorded against it.
alter table public.stays_listings add column if not exists str_eligible boolean generated always as (
  coalesce(eligibility->>'permit_status', '') <> 'denied'
  and coalesce(eligibility->>'zoning_cleared', 'true') <> 'false'
  and coalesce(eligibility->>'hoa_ok', 'true') <> 'false'
) stored;

create table if not exists public.stays_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  listing_id uuid not null references public.stays_listings(id),
  reference text not null unique,
  stays_booking_id text,
  guest_name text not null, guest_email text not null, guest_phone text,
  guests integer not null check (guests >= 1),
  check_in date not null, check_out date not null,
  nights integer not null check (nights >= 1),
  nightly_total numeric(12,2) not null, cleaning_fee numeric(10,2) not null default 0, service_fee numeric(10,2) not null default 0,
  total numeric(12,2) not null, credit_applied numeric(10,2) not null default 0, amount_due numeric(12,2) not null,
  special_requests text,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'cancelled', 'completed')),
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists stays_bookings_listing_idx on public.stays_bookings (listing_id, check_in);

alter table public.stays_calendar_blocks add column if not exists booking_id uuid references public.stays_bookings(id) on delete cascade;
create extension if not exists btree_gist;
-- Backstop: even if application code is wrong, two bookings can never overlap on one listing.
do $$ begin
  alter table public.stays_calendar_blocks add constraint stays_no_double_booking
    exclude using gist (listing_id with =, daterange(start_date, end_date, '[)') with &&) where (reason = 'booking');
exception when duplicate_object then null; end $$;

create table if not exists public.stays_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.stays_listings(id) on delete cascade,
  booking_id uuid references public.stays_bookings(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text, issue text,
  created_at timestamptz not null default now(),
  unique (booking_id)
);

-- A review updates the listing's public rating and review count.
create or replace function public.stays_refresh_rating() returns trigger language plpgsql as $$
begin
  update public.stays_listings l set attributes = l.attributes || jsonb_build_object(
    'rating', (select round(avg(rating)::numeric, 2) from public.stays_reviews where listing_id = new.listing_id),
    'review_count', (select count(*) from public.stays_reviews where listing_id = new.listing_id)), updated_at = now()
  where l.id = new.listing_id;
  return new;
end $$;
drop trigger if exists stays_reviews_rating on public.stays_reviews;
create trigger stays_reviews_rating after insert on public.stays_reviews for each row execute function public.stays_refresh_rating();

-- Creates a booking and blocks its dates in one step. Price comes from the listing, never from the caller.
create or replace function public.stays_book(
  p_org uuid, p_listing uuid, p_ref text, p_stays_booking_id text, p_name text, p_email text, p_phone text, p_guests integer,
  p_in date, p_out date, p_credit numeric, p_requests text
) returns table (out_booking_id uuid, out_nightly_total numeric, out_cleaning_fee numeric, out_total numeric, out_amount_due numeric)
language plpgsql security definer set search_path = public as $$
declare l public.stays_listings%rowtype; n integer; nightly numeric; tot numeric; due numeric; b uuid;
begin
  select * into l from public.stays_listings where id = p_listing and organization_id = p_org for update;
  if not found or l.status <> 'active' or not l.quality_approved or not l.str_eligible then raise exception 'listing_unavailable'; end if;
  if p_guests > coalesce(l.max_guests, p_guests) then raise exception 'too_many_guests'; end if;
  n := p_out - p_in;
  if n < l.min_nights then raise exception 'min_nights'; end if;
  if l.sale_status ? 'handover_date' and nullif(l.sale_status->>'handover_date', '')::date < p_out then raise exception 'after_handover'; end if;
  if exists (select 1 from public.stays_calendar_blocks c where c.listing_id = l.id and c.start_date < p_out and c.end_date > p_in) then raise exception 'dates_taken'; end if;
  nightly := round(l.price_per_night * n, 2);
  tot := nightly + l.cleaning_fee;
  due := greatest(tot - coalesce(p_credit, 0), 0);
  insert into public.stays_bookings (organization_id, listing_id, reference, stays_booking_id, guest_name, guest_email, guest_phone, guests, check_in, check_out, nights,
    nightly_total, cleaning_fee, total, credit_applied, amount_due, special_requests)
  values (p_org, l.id, p_ref, p_stays_booking_id, p_name, lower(p_email), p_phone, p_guests, p_in, p_out, n, nightly, l.cleaning_fee, tot, least(coalesce(p_credit, 0), tot), due, p_requests)
  returning id into b;
  insert into public.stays_calendar_blocks (listing_id, start_date, end_date, reason, source, booking_id) values (l.id, p_in, p_out, 'booking', 'naveo_stays', b);
  return query select b, nightly, l.cleaning_fee, tot, due;
end $$;
revoke all on function public.stays_book(uuid, uuid, text, text, text, text, text, integer, date, date, numeric, text) from public, anon, authenticated;
grant execute on function public.stays_book(uuid, uuid, text, text, text, text, text, integer, date, date, numeric, text) to service_role;

do $$ declare t text; begin
  foreach t in array array['stays_bookings', 'stays_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role_%1$s" on public.%1$I', t);
    execute format('create policy "service_role_%1$s" on public.%1$I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
