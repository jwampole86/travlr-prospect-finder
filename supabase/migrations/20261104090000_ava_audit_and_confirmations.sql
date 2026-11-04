-- AVA assistant: audit trail and single-use confirmations.
-- Both tables are written and read only by the server (service role); with row level security on and no
-- policies, browser clients cannot read or write them.

CREATE TABLE IF NOT EXISTS public.ava_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    TEXT,
  role        TEXT,
  event_type  TEXT NOT NULL,
  request_id  TEXT,
  tool        TEXT,
  route       TEXT,
  action_id   TEXT,
  outcome     TEXT,
  reason      TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ava_audit_log_created_at ON public.ava_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ava_audit_log_actor ON public.ava_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ava_audit_log_request ON public.ava_audit_log (request_id);

ALTER TABLE public.ava_audit_log ENABLE ROW LEVEL SECURITY;

-- A confirmation token may be redeemed once: its nonce is inserted here, and a duplicate insert is refused.
CREATE TABLE IF NOT EXISTS public.ava_used_actions (
  nonce    TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ava_used_actions_used_at ON public.ava_used_actions (used_at);

ALTER TABLE public.ava_used_actions ENABLE ROW LEVEL SECURITY;
