-- Remembers which team alerts were already texted so a retried webhook or a repeat visit never sends the same alert twice.
CREATE TABLE IF NOT EXISTS public.team_alert_log (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_alert_log ENABLE ROW LEVEL SECURITY;
