-- Answers an organization's admins write for AVA. Published entries are approved help for that organization only, found by her
-- exactly like the built-in help. Writes go through AVA's admin routes (service role); admins can read their own organization's.
create table if not exists public.ava_kb_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.default_organization_id(),
  title text not null check (char_length(title) between 3 and 200),
  answer text not null check (char_length(answer) between 10 and 1500),
  keywords text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ava_kb_entries_org_idx on public.ava_kb_entries (organization_id, status);
alter table public.ava_kb_entries enable row level security;
drop policy if exists ava_kb_entries_admin_read on public.ava_kb_entries;
create policy ava_kb_entries_admin_read on public.ava_kb_entries for select to authenticated
  using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin');
