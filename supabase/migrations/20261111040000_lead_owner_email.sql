-- The email an owner used when they submitted their own property. NAVEO Homes and Stays match it to the email an owner signs in with to show them their own
-- submission. It is set only on a lead the submission itself created: a repeat submission for an address AVYRO already holds never gains access to that record.
-- Always stored lowercase; no match means no access.
alter table public.leads add column if not exists owner_email text;
do $$ begin
  alter table public.leads add constraint leads_owner_email_lowercase check (owner_email is null or owner_email = lower(owner_email));
exception when duplicate_object then null; end $$;
create index if not exists leads_owner_email_idx on public.leads (organization_id, owner_email) where owner_email is not null;
