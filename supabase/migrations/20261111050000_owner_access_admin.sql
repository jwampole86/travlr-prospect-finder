-- Co-owner and manager access for NAVEO Stays homes, and ownership claims on NAVEO Homes submissions.
-- authorized_emails: extra emails (co-owners, managers) that may manage a home alongside owner_email. Always lowercase.
alter table public.stays_listings add column if not exists authorized_emails text[] not null default '{}';

create or replace function public.stays_lowercase_emails() returns trigger language plpgsql as $$
begin
  new.owner_email := nullif(lower(btrim(new.owner_email)), '');
  new.authorized_emails := coalesce((select array_agg(distinct lower(btrim(e))) from unnest(new.authorized_emails) e where btrim(e) <> ''), '{}');
  return new;
end $$;
drop trigger if exists stays_listings_lowercase_emails on public.stays_listings;
create trigger stays_listings_lowercase_emails before insert or update of owner_email, authorized_emails on public.stays_listings for each row execute function public.stays_lowercase_emails();
create index if not exists stays_listings_authorized_idx on public.stays_listings using gin (authorized_emails);

-- When someone submits an address AVYRO already holds, they have not proven they own it and must not see what AVYRO holds. The submission is recorded as a claim:
-- the claimant sees only that it was received, until a person approves it (which makes them the owner of the lead) or dismisses it.
create table if not exists public.lead_owner_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id text not null references public.leads(id) on delete cascade,
  email text not null check (email = lower(email)),
  claimant_name text,
  address_text text, city text, state text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (lead_id, email)
);
create index if not exists lead_owner_claims_email_idx on public.lead_owner_claims (organization_id, email) where status = 'pending';
alter table public.lead_owner_claims enable row level security;
drop policy if exists "service_role_lead_owner_claims" on public.lead_owner_claims;
create policy "service_role_lead_owner_claims" on public.lead_owner_claims for all to service_role using (true) with check (true);
