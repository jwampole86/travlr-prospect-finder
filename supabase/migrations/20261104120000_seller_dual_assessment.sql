-- Dual opportunity assessment for sellers: a suggested sale path (sell only, sell + earn, rent while preparing, investor exit)
-- with the sale-side and interim-rental estimates behind it. The suggestion is advisory: a person reviews it before it is used.

alter table public.seller_opportunities
  add column if not exists listing_status text check (listing_status in ('not_listed', 'preparing', 'listed', 'under_contract', 'unknown')),
  add column if not exists est_days_to_sale integer check (est_days_to_sale is null or est_days_to_sale between 1 and 730),
  add column if not exists est_selling_cost_pct numeric check (est_selling_cost_pct is null or est_selling_cost_pct between 0 and 25),
  add column if not exists recommendation text check (recommendation in ('sell_only', 'sell_and_earn', 'rent_while_preparing', 'investor_exit')),
  add column if not exists recommendation_reasons text[] not null default '{}',
  add column if not exists recommendation_cautions text[] not null default '{}',
  add column if not exists est_seller_net_low numeric,
  add column if not exists est_seller_net_high numeric,
  add column if not exists est_interim_net numeric,
  add column if not exists recommendation_at timestamptz,
  add column if not exists recommendation_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists recommendation_reviewed_at timestamptz;

create index if not exists seller_opportunities_recommendation_idx
  on public.seller_opportunities (organization_id, recommendation) where recommendation is not null;
