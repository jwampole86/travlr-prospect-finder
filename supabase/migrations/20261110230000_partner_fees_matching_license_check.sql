-- Fees owed on closed referrals, partner coverage for matching, and the result of the last automatic license check.

alter table public.partner_referrals
  add column if not exists fee_percent numeric,
  add column if not exists protection_days integer,
  add column if not exists protection_ends_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists commission_received numeric check (commission_received is null or commission_received >= 0),
  add column if not exists commission_received_on date,
  add column if not exists fee_amount numeric,
  add column if not exists fee_due_on date,
  add column if not exists fee_status text not null default 'not_due' check (fee_status in ('not_due', 'awaiting_commission', 'due', 'invoiced', 'paid', 'waived')),
  add column if not exists fee_invoiced_on date,
  add column if not exists fee_paid_amount numeric check (fee_paid_amount is null or fee_paid_amount >= 0),
  add column if not exists fee_paid_on date;

alter table public.service_partners
  add column if not exists markets text[] not null default '{}',
  add column if not exists property_types text[] not null default '{}',
  add column if not exists price_min numeric,
  add column if not exists price_max numeric,
  add column if not exists max_open_leads integer check (max_open_leads is null or max_open_leads >= 0),
  add column if not exists do_not_assign boolean not null default false,
  add column if not exists match_boost integer not null default 0 check (match_boost between 0 and 20),
  add column if not exists license_check jsonb;

-- How and to whom a partner pays, and the terms copied onto each referral so a later change never rewrites an old deal.
-- Bank account numbers are deliberately not stored here: keep wire and ACH details in a secure vault and link to them.
alter table public.service_partners
  add column if not exists payment_method text check (payment_method is null or payment_method in ('ach', 'check', 'wire', 'other')),
  add column if not exists payment_method_other text,
  add column if not exists payee_name text,
  add column if not exists payee_type text check (payee_type is null or payee_type in ('brokerage', 'broker', 'entity')),
  add column if not exists preferred_invoice_email text,
  add column if not exists payment_instructions text,
  add column if not exists check_mailing_address text,
  add column if not exists wire_instructions_ref text,
  add column if not exists w9_on_file boolean not null default false,
  add column if not exists w9_received_at date,
  add column if not exists fee_notes text,
  add column if not exists fee_effective_at date,
  add column if not exists referral_fee_percent_buyer numeric check (referral_fee_percent_buyer is null or (referral_fee_percent_buyer >= 0 and referral_fee_percent_buyer <= 100));

alter table public.partner_referrals
  add column if not exists payment_method_snapshot text,
  add column if not exists payee_name_snapshot text,
  add column if not exists payment_due_days_snapshot integer;
