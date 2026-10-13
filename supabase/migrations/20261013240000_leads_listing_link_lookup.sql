-- When a lead's listing link was last searched for, so a miss is not repeated on every profile view.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_link_lookup_at TIMESTAMPTZ;
