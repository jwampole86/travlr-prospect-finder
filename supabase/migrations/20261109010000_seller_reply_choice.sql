-- The owner's own answer to the outreach campaign's question: sale, long-term rental, short-term rental, or both/still deciding.
-- It is a starting point for the team; the route, permission and eligibility are still confirmed by a person.
alter table public.seller_opportunities
  add column if not exists reply_choice text check (reply_choice in ('sale', 'rent_ltr', 'rent_str', 'both')),
  add column if not exists reply_choice_at timestamptz;
