-- One-to-one text messages to co-host prospects (existing short-term-rental owners), sent by a person from the Co-Host Pipeline.
-- Inbound replies are stored here too so a STOP or a YES can be tied back to the prospect's listing.
CREATE TABLE IF NOT EXISTS public.cohost_messages (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES public.str_listings(property_id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  phone_e164 TEXT NOT NULL,
  body TEXT NOT NULL,
  message_sid TEXT,
  status TEXT,
  intent TEXT,
  phone_source TEXT,
  sent_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cohost_messages_phone ON public.cohost_messages (phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cohost_messages_property ON public.cohost_messages (property_id, created_at DESC);
ALTER TABLE public.cohost_messages ENABLE ROW LEVEL SECURITY;
