-- Seller and owner-services pipeline: seller opportunities, purpose-specific consent ledger, service partners,
-- per-service eligibility reviews, agreements and revenue. Every table is scoped to an organization.

create table if not exists public.service_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  services text[] not null default '{}',
  license_type text,
  license_number text,
  license_state text,
  license_status text not null default 'unverified' check (license_status in ('unverified', 'verified', 'expired')),
  license_verified_at timestamptz,
  states text[] not null default '{}',
  territories text,
  relationship_status text not null default 'prospect' check (relationship_status in ('prospect', 'active', 'paused', 'ended')),
  compensation_terms text,
  legal_reviewed boolean not null default false,
  agreement_on_file boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  lead_id text not null,
  property_key text,
  stage text not null default 'signal' check (stage in ('signal', 'permission', 'qualified', 'routed', 'consultation', 'agreement', 'outcome')),
  status text not null default 'open' check (status in ('open', 'paused', 'won', 'lost')),
  source text,
  signal_text text,
  signal_at timestamptz,
  intent_score integer not null default 0,
  service_fit_score integer not null default 0,
  authorization_status text not null default 'needs_permission' check (authorization_status in ('authorized', 'needs_permission', 'blocked')),
  authority_verified boolean not null default false,
  authority_role text check (authority_role in ('owner', 'co_owner', 'agent', 'other')),
  decision_status text check (decision_status in ('sole_decision_maker', 'needs_others', 'unknown')),
  timeline text,
  occupancy text check (occupancy in ('owner_occupied', 'tenant_occupied', 'vacant', 'short_term_rental', 'unknown')),
  goals text[] not null default '{}',
  condition_notes text,
  price_expectation_low numeric,
  price_expectation_high numeric,
  preferred_channel text check (preferred_channel in ('sms', 'call', 'email')),
  route text check (route in ('sale_partner', 'long_term_management', 'str_management', 'interim_rental', 'readiness_services')),
  partner_id uuid references public.service_partners(id) on delete set null,
  next_action text,
  next_action_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seller_opportunities_one_open_per_lead
  on public.seller_opportunities (organization_id, lead_id) where status in ('open', 'paused');
create index if not exists seller_opportunities_stage_idx on public.seller_opportunities (organization_id, status, stage);
create index if not exists seller_opportunities_next_action_idx on public.seller_opportunities (next_action_at) where status = 'open';

-- Append-only ledger: the current permission for a purpose is its newest row, and a revocation is a row with granted = false.
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  lead_id text not null,
  phone_e164 text,
  email text,
  purpose text not null check (purpose in ('estimate_followup', 'seller_consultation', 'long_term_management', 'str_management', 'readiness_services', 'partner_sharing')),
  channels text[] not null default '{}',
  granted boolean not null,
  source text not null,
  evidence text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_lead_idx on public.consent_records (lead_id, purpose, created_at desc);

create table if not exists public.service_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  opportunity_id uuid not null references public.seller_opportunities(id) on delete cascade,
  service_line text not null check (service_line in ('sale_partner', 'long_term_management', 'str_management', 'interim_rental', 'readiness_services')),
  eligibility text not null default 'needs_review' check (eligibility in ('needs_review', 'eligible', 'ineligible')),
  reasons text[] not null default '{}',
  est_monthly_revenue numeric,
  est_monthly_cost numeric,
  assumptions text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, service_line)
);

create table if not exists public.service_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  opportunity_id uuid not null references public.seller_opportunities(id) on delete cascade,
  partner_id uuid references public.service_partners(id) on delete set null,
  service_line text not null check (service_line in ('sale_partner', 'long_term_management', 'str_management', 'interim_rental', 'readiness_services')),
  contract_type text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'active', 'cancelled', 'completed')),
  signed_at timestamptz,
  start_date date,
  end_date date,
  monthly_fee numeric,
  fee_percent numeric,
  cancellation_terms text,
  docusign_envelope_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_agreements_opportunity_idx on public.service_agreements (opportunity_id);

create table if not exists public.service_revenue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.default_organization_id(),
  opportunity_id uuid not null references public.seller_opportunities(id) on delete cascade,
  agreement_id uuid references public.service_agreements(id) on delete set null,
  service_line text not null check (service_line in ('sale_partner', 'long_term_management', 'str_management', 'interim_rental', 'readiness_services')),
  kind text not null default 'management_fee' check (kind in ('management_fee', 'setup_fee', 'referral_fee', 'readiness_fee', 'other')),
  description text,
  invoiced numeric not null default 0,
  collected numeric not null default 0,
  cost numeric not null default 0,
  status text not null default 'invoiced' check (status in ('invoiced', 'partial', 'paid', 'void')),
  invoice_date date,
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_revenue_opportunity_idx on public.service_revenue (opportunity_id);

create or replace function public.set_seller_pipeline_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['service_partners', 'seller_opportunities', 'service_assessments', 'service_agreements', 'service_revenue'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_seller_pipeline_updated_at()', t);
  end loop;

  foreach t in array array['service_partners', 'seller_opportunities', 'consent_records', 'service_assessments', 'service_agreements', 'service_revenue'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_org', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'') with check (organization_id in (select public.user_organization_ids()) and public.get_my_role() = ''admin'')',
      t || '_admin_org', t);
  end loop;
end $$;
