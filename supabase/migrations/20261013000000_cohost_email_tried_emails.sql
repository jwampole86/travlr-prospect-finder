-- Addresses a co-host campaign email has already been tried on. When one bounces, the email is resent to the next address on file
-- for that owner, and the ones already tried are remembered here so none is used twice.
ALTER TABLE public.cohost_email_messages ADD COLUMN IF NOT EXISTS tried_emails TEXT[] NOT NULL DEFAULT '{}';
