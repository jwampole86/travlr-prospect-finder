-- Where the property registry's background sync has got to in the list of leads, so it can work through them in batches and pick up new ones.
create table if not exists public.registry_sync_state (
  key text primary key,
  cursor_at timestamptz not null default 'epoch',
  cursor_id text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.registry_sync_state enable row level security;
