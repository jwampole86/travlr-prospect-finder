-- When a co-host email bounces at night, the resend to the owner's next address waits until the owner's local morning.
ALTER TABLE public.cohost_email_messages ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_cohost_email_messages_retry ON public.cohost_email_messages (retry_at) WHERE retry_at IS NOT NULL;
