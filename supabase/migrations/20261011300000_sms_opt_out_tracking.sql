-- Distinguishes "never asked" (sms_opt_in = false, no opt-out date) from an explicit opt-out, and keeps a number-level
-- suppression list so an opted-out phone stays blocked even if it is re-imported on a new lead.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sms_opted_out_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  phone_e164 text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'opt_out',
  last_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;

-- Backfill from conversations already marked opted out.
UPDATE public.leads l SET sms_opted_out_at = COALESCE(sms_opted_out_at, now())
WHERE l.id IN (SELECT lead_id FROM public.sms_conversation_threads WHERE conversation_status = 'opted_out' AND lead_id IS NOT NULL);
