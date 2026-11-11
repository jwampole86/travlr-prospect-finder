-- A log of every message sent to a partner broker about a referral (the lead packet, status requests, fee details).
create table if not exists public.partner_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  partner_id uuid not null references public.service_partners(id) on delete cascade,
  referral_id uuid references public.partner_referrals(id) on delete set null,
  lead_id text,
  template text not null check (template in ('intro', 'nudge', 'closed')),
  channel text not null default 'email' check (channel in ('email')),
  to_address text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists partner_messages_referral_idx on public.partner_messages (referral_id, created_at desc);
create index if not exists partner_messages_lead_idx on public.partner_messages (organization_id, lead_id, created_at desc);

alter table public.partner_messages enable row level security;
drop policy if exists partner_messages_admin_org on public.partner_messages;
create policy partner_messages_admin_org on public.partner_messages for all to authenticated
  using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin')
  with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin');
