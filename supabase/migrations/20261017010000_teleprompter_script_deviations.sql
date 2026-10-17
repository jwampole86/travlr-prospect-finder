-- Moments when an agent went off the script on a live call (said their own words, or something other than the line shown), with what
-- the homeowner had just said. The suggestion engine reads these to learn how agents really handle a moment.
create table if not exists public.teleprompter_script_deviations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  session_id uuid,
  user_id uuid,
  lead_id text,
  script_id text not null,
  kind text not null check (kind in ('ad_lib', 'replaced', 'skipped')),
  expected_line text,
  agent_said text not null,
  homeowner_said text,
  coverage numeric,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists teleprompter_deviations_script_idx on public.teleprompter_script_deviations (script_id, created_at desc);
create index if not exists teleprompter_deviations_session_idx on public.teleprompter_script_deviations (session_id);

-- Only the server (service role) reads and writes this table.
alter table public.teleprompter_script_deviations enable row level security;
