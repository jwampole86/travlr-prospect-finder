-- "The Future of Property Turnovers" newsletter: opt-in subscribers, survey answers and a send log.
-- RLS is on with no policies, so only the server (service role) can read or write these tables.

create table if not exists public.future_str_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  audience text not null check (audience in ('homeowner', 'operator')),
  first_name text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  consent_text text not null,
  consent_ip text,
  source text,
  created_at timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint future_str_subscribers_email_audience unique (email, audience),
  constraint future_str_subscribers_email_lower check (email = lower(email))
);
create index if not exists idx_future_str_subscribers_status on public.future_str_subscribers (audience, status);

create table if not exists public.future_str_responses (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('homeowner', 'operator')),
  comfort text check (comfort in ('comfortable', 'conditions', 'unsure', 'not_comfortable')),
  concerns text[] not null default '{}',
  interests text[] not null default '{}',
  role text check (role in ('property_manager', 'cleaning_company', 'other')),
  portfolio_size text check (portfolio_size in ('1-10', '11-50', '51-200', '200+')),
  pay_interest text check (pay_interest in ('yes', 'maybe', 'no')),
  comment text,
  subscriber_id uuid references public.future_str_subscribers (id) on delete set null,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_future_str_responses_created on public.future_str_responses (created_at desc);

create table if not exists public.future_str_sends (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.future_str_subscribers (id) on delete cascade,
  issue integer not null,
  resend_message_id text,
  sent_at timestamptz not null default now(),
  constraint future_str_sends_once unique (subscriber_id, issue)
);

alter table public.future_str_subscribers enable row level security;
alter table public.future_str_responses enable row level security;
alter table public.future_str_sends enable row level security;
