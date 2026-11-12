-- What the partner agreement looked like when the lead was introduced, so a later edit to the partner never rewrites an old referral.
alter table public.partner_referrals
  add column if not exists agreement_signed_on_snapshot date,
  add column if not exists responsible_broker_snapshot text,
  add column if not exists license_number_snapshot text,
  add column if not exists license_state_snapshot text;
