-- Registry rows can carry the public bedroom count and the contact details the permitting agency itself publishes
-- (owner mailing address, phone, email, property manager). Used for email, call or mail outreach to co-host prospects, never for text campaigns.
ALTER TABLE public.str_registry
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS contact JSONB;
