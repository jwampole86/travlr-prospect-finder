-- Who owns a NAVEO Stays listing. NAVEO Stays signs an owner in and passes their verified email; AVYRO only lets that email touch listings where it matches.
-- owner_email is always stored lowercase. A listing with no owner_email cannot be managed by any owner sign-in.
alter table public.stays_listings add column if not exists owner_email text;
alter table public.stays_listings add column if not exists owner_user_id text;
do $$ begin
  alter table public.stays_listings add constraint stays_owner_email_lowercase check (owner_email is null or owner_email = lower(owner_email));
exception when duplicate_object then null; end $$;
create index if not exists stays_listings_owner_idx on public.stays_listings (organization_id, owner_email) where owner_email is not null;
