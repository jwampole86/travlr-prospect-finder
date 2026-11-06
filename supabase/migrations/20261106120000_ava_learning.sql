-- AVA learns how each person uses her, so she can tailor suggestions, tours and answer style to them.
-- What is kept is structured and small: counts and ids (tours finished, screens opened, tools used, helpful / not helpful with a coarse
-- reason). Never what was typed or said, never lead or contact data, never audio. Each person can read and delete their own profile.

create table if not exists public.ava_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid default public.default_organization_id(),
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ava_user_profiles enable row level security;
drop policy if exists ava_user_profiles_own_read on public.ava_user_profiles;
create policy ava_user_profiles_own_read on public.ava_user_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists ava_user_profiles_own_delete on public.ava_user_profiles;
create policy ava_user_profiles_own_delete on public.ava_user_profiles for delete to authenticated using (user_id = auth.uid());
-- Writes go through AVA's server routes (service role), which check the person's consent first.

-- Anonymous product-improvement signals. Written only for people who chose to share, and carrying NO user id, no text and no lead data:
-- just the organization, the role, what kind of signal it is, and an id (a tour, a screen, a help topic, a tool).
create table if not exists public.ava_usage_signals (
  id bigint generated always as identity primary key,
  organization_id uuid default public.default_organization_id(),
  role text not null,
  kind text not null check (kind in ('tour_completed', 'tour_stopped', 'page_opened', 'tool_used', 'question', 'feedback')),
  key text,
  rating smallint check (rating in (-1, 1)),
  reason text check (reason in ('too_long', 'too_short', 'not_helpful', 'wrong', 'great')),
  created_at timestamptz not null default now()
);
create index if not exists ava_usage_signals_org_idx on public.ava_usage_signals (organization_id, kind, created_at desc);

-- Help topics AVA could not answer, reduced to product words only (names, numbers and contact details cannot survive), with a count.
create table if not exists public.ava_unanswered_topics (
  organization_id uuid not null default public.default_organization_id(),
  topic_key text not null,
  n integer not null default 1,
  last_seen timestamptz not null default now(),
  primary key (organization_id, topic_key)
);

do $$
declare t text;
begin
  foreach t in array array['ava_usage_signals', 'ava_unanswered_topics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'')', t || '_admin_read', t);
  end loop;
end $$;

-- Retention: shared signals are kept 13 months. Run this on a schedule (for example monthly).
create or replace function public.ava_prune_learning() returns void language sql security definer set search_path = public as $$
  delete from public.ava_usage_signals where created_at < now() - interval '13 months';
  delete from public.ava_unanswered_topics where last_seen < now() - interval '13 months';
$$;
revoke all on function public.ava_prune_learning() from public, anon, authenticated;

create or replace function public.ava_count_unanswered(p_org uuid, p_key text) returns void language sql security definer set search_path = public as $$
  insert into public.ava_unanswered_topics (organization_id, topic_key) values (p_org, p_key)
  on conflict (organization_id, topic_key) do update set n = public.ava_unanswered_topics.n + 1, last_seen = now();
$$;
revoke all on function public.ava_count_unanswered(uuid, text) from public, anon, authenticated;
