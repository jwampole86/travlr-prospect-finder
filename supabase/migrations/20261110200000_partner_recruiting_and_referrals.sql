-- Broker partner recruiting (who they are, whether they take referrals and will report) and the referrals sent to each partner,
-- with the status history the partner reports back: received, contacted, listed, under contract, closed or dead.

alter table public.service_partners
  add column if not exists partner_role text check (partner_role in ('team_lead', 'broker', 'agent', 'vendor')),
  add column if not exists brokerage text,
  add column if not exists niche text,
  add column if not exists accepts_referrals text not null default 'unknown' check (accepts_referrals in ('yes', 'no', 'unknown')),
  add column if not exists will_report text not null default 'unknown' check (will_report in ('yes', 'no', 'unknown')),
  add column if not exists referral_fee_range text,
  add column if not exists update_method text,
  add column if not exists excluded_areas text,
  add column if not exists recruit_status text not null default 'to_contact' check (recruit_status in ('to_contact', 'emailed', 'call_booked', 'partner', 'pass')),
  add column if not exists license_lookup_url text,
  add column if not exists last_contacted_at timestamptz;

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  partner_id uuid not null references public.service_partners(id) on delete cascade,
  opportunity_id uuid references public.seller_opportunities(id) on delete set null,
  lead_id text not null,
  property_label text,
  status text not null default 'sent' check (status in ('sent', 'received', 'contacted', 'listed', 'under_contract', 'closed', 'dead')),
  sent_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  mls_number text,
  close_price numeric,
  dead_reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_referrals_partner_idx on public.partner_referrals (organization_id, partner_id, status);
create unique index if not exists partner_referrals_one_active_per_lead
  on public.partner_referrals (organization_id, lead_id) where status not in ('closed', 'dead');

-- Every status a partner reported, with the date it applied, so the update rate and the story of each lead can be read back.
create table if not exists public.partner_referral_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  referral_id uuid not null references public.partner_referrals(id) on delete cascade,
  status text not null check (status in ('sent', 'received', 'contacted', 'listed', 'under_contract', 'closed', 'dead')),
  status_at timestamptz not null default now(),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists partner_referral_updates_referral_idx on public.partner_referral_updates (referral_id, status_at);

drop trigger if exists partner_referrals_updated_at on public.partner_referrals;
create trigger partner_referrals_updated_at before update on public.partner_referrals for each row execute function public.set_seller_pipeline_updated_at();

do $$
declare t text;
begin
  foreach t in array array['partner_referrals', 'partner_referral_updates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_org', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'') with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'')',
      t || '_admin_org', t);
  end loop;
end $$;
