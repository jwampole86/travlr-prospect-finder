-- Where each prospect broker is in the recruiting email sequence (first email, day-3 bump, day-7 last note).
alter table public.service_partners
  add column if not exists outreach_started_at timestamptz,
  add column if not exists outreach_step integer not null default 0 check (outreach_step between 0 and 3);
