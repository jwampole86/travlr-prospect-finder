-- "Deeper answers": when AVA's approved help cannot answer, a staff member can ask an AI model (Anthropic) for general guidance. Every exchange is logged here so a person
-- can review it and, if it is right, turn it into an approved team answer. Nothing here is approved help until an admin saves it as a team answer and publishes it.
create table if not exists public.ava_deeper_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_id uuid,
  role text,
  question text not null,
  ava_reply text,
  context jsonb not null default '{}'::jsonb,
  answer text,
  model text,
  input_tokens integer,
  output_tokens integer,
  status text not null default 'answered' check (status in ('answered', 'failed')),
  error text,
  topic_tags text[] not null default '{}',
  needs_review boolean not null default false,
  feedback text check (feedback in ('up', 'down')),
  review_status text not null default 'new' check (review_status in ('new', 'drafted', 'dismissed')),
  kb_entry_id uuid references public.ava_kb_entries(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ava_deeper_org_idx on public.ava_deeper_answers (organization_id, created_at desc);
create index if not exists ava_deeper_review_idx on public.ava_deeper_answers (organization_id, review_status) where status = 'answered';
alter table public.ava_deeper_answers enable row level security;
drop policy if exists "service_role_ava_deeper_answers" on public.ava_deeper_answers;
create policy "service_role_ava_deeper_answers" on public.ava_deeper_answers for all to service_role using (true) with check (true);
