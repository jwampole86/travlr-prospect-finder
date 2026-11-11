-- Explicit opt-in for the read-only NAVEO listings endpoint. A lead is only exposed to NAVEO Homes once a person sets naveo_listed_at;
-- clearing it removes the property from the endpoint immediately.
alter table public.leads add column if not exists naveo_listed_at timestamptz;
create index if not exists leads_naveo_listed_idx on public.leads (organization_id, naveo_listed_at) where naveo_listed_at is not null;
