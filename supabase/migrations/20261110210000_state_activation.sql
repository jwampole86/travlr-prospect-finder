-- Per-state clearance for broker referrals: a state is switched on only after its rules were checked and counsel signed off.
create table if not exists public.state_activation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  state text not null check (state ~ '^[A-Z]{2}$'),
  status text not null default 'not_active' check (status in ('not_active', 'pilot', 'live')),
  brokers_can_pay text not null default 'unknown' check (brokers_can_pay in ('yes', 'no', 'unknown')),
  unlicensed_payee_allowed text not null default 'unknown' check (unlicensed_payee_allowed in ('yes', 'no', 'unknown')),
  must_pay_through_brokerage text not null default 'unknown' check (must_pay_through_brokerage in ('yes', 'no', 'unknown')),
  written_agreement_required text not null default 'unknown' check (written_agreement_required in ('yes', 'no', 'unknown')),
  out_of_state_notes text,
  lookup_url text,
  citations text,
  counsel_name text,
  counsel_reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, state)
);

drop trigger if exists state_activation_updated_at on public.state_activation;
create trigger state_activation_updated_at before update on public.state_activation for each row execute function public.set_seller_pipeline_updated_at();

alter table public.state_activation enable row level security;
drop policy if exists state_activation_admin_org on public.state_activation;
create policy state_activation_admin_org on public.state_activation for all to authenticated
  using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin')
  with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = 'admin');
