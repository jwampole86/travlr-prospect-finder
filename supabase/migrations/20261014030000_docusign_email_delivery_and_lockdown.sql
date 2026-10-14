-- Email-delivered signers have no embedded client id; track delivery, environment and one-time completion processing.
ALTER TABLE public.signing_signers ALTER COLUMN client_user_id DROP NOT NULL;

ALTER TABLE public.signing_sessions
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'email' CHECK (delivery_mode IN ('email', 'embedded')),
  ADD COLUMN IF NOT EXISTS docusign_env text NOT NULL DEFAULT 'demo' CHECK (docusign_env IN ('demo', 'production')),
  ADD COLUMN IF NOT EXISTS completion_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Session status is the proof a deal may close, so only the server (service role) may write it.
DROP POLICY IF EXISTS "users_manage_own_signing_sessions" ON public.signing_sessions;
DROP POLICY IF EXISTS "users_read_own_signing_sessions" ON public.signing_sessions;
CREATE POLICY "users_read_own_signing_sessions" ON public.signing_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_manage_own_signing_signers" ON public.signing_signers;
DROP POLICY IF EXISTS "users_read_own_signing_signers" ON public.signing_signers;
CREATE POLICY "users_read_own_signing_signers" ON public.signing_signers
  FOR SELECT TO authenticated USING (session_id IN (SELECT id FROM public.signing_sessions WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_signing_sessions_open ON public.signing_sessions (session_status) WHERE session_status = 'sent';
