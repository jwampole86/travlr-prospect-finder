-- Exhibit A of the National Referral Partner Agreement: the commercial terms agreed with each partner.
alter table public.service_partners
  add column if not exists responsible_broker text,
  add column if not exists referral_fee_percent numeric check (referral_fee_percent is null or (referral_fee_percent >= 0 and referral_fee_percent <= 100)),
  add column if not exists protection_days integer check (protection_days is null or protection_days between 0 and 1095),
  add column if not exists payment_due_days integer check (payment_due_days is null or payment_due_days between 0 and 365),
  add column if not exists exclusive_territory text,
  add column if not exists agreement_signed_on date;
