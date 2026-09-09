-- DocuSign Embedded Signing Portal
-- Tables: signing_sessions, signing_signers

-- ─── Types ────────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.signing_session_status CASCADE;
CREATE TYPE public.signing_session_status AS ENUM (
  'draft', 'sent', 'voided', 'completed', 'declined', 'expired'
);

DROP TYPE IF EXISTS public.signer_status CASCADE;
CREATE TYPE public.signer_status AS ENUM (
  'pending', 'sent', 'viewed', 'signed', 'declined', 'voided'
);

-- ─── signing_sessions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signing_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  lead_id               TEXT NOT NULL,
  lead_address          TEXT,
  lead_state            TEXT,
  envelope_id           TEXT,
  docusign_template_id  TEXT,
  session_status        public.signing_session_status DEFAULT 'draft'::public.signing_session_status,

  -- Pre-filled deal terms (stored at time of initiation)
  prefill_data          JSONB DEFAULT '{}'::jsonb,

  -- Signed document storage
  signed_pdf_url        TEXT,
  certificate_url       TEXT,
  docusign_completed_at TIMESTAMPTZ,

  -- Agent notes
  agent_notes           TEXT,

  -- Void/resend tracking
  voided_at             TIMESTAMPTZ,
  voided_reason         TEXT,
  resend_count          INTEGER DEFAULT 0,

  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── signing_signers ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signing_signers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES public.signing_sessions(id) ON DELETE CASCADE,
  signer_order        INTEGER NOT NULL DEFAULT 1,
  signer_name         TEXT NOT NULL,
  signer_email        TEXT NOT NULL,
  client_user_id      TEXT NOT NULL,
  recipient_id        TEXT NOT NULL,
  signer_status       public.signer_status DEFAULT 'pending'::public.signer_status,
  viewed_at           TIMESTAMPTZ,
  signed_at           TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  decline_reason      TEXT,
  created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_signing_sessions_lead_id ON public.signing_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_user_id ON public.signing_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_envelope_id ON public.signing_sessions(envelope_id);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_status ON public.signing_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_signing_signers_session_id ON public.signing_signers(session_id);
CREATE INDEX IF NOT EXISTS idx_signing_signers_email ON public.signing_signers(signer_email);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_signing_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signing_sessions_updated_at ON public.signing_sessions;
CREATE TRIGGER signing_sessions_updated_at
  BEFORE UPDATE ON public.signing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_signing_updated_at();

DROP TRIGGER IF EXISTS signing_signers_updated_at ON public.signing_signers;
CREATE TRIGGER signing_signers_updated_at
  BEFORE UPDATE ON public.signing_signers
  FOR EACH ROW EXECUTE FUNCTION public.update_signing_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.signing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signing_signers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_signing_sessions" ON public.signing_sessions;
CREATE POLICY "users_manage_own_signing_sessions"
  ON public.signing_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Homeowner webhook updates (service role bypasses RLS)
DROP POLICY IF EXISTS "service_role_signing_sessions" ON public.signing_sessions;
CREATE POLICY "service_role_signing_sessions"
  ON public.signing_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_manage_own_signing_signers" ON public.signing_signers;
CREATE POLICY "users_manage_own_signing_signers"
  ON public.signing_signers
  FOR ALL
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.signing_sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.signing_sessions WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role_signing_signers" ON public.signing_signers;
CREATE POLICY "service_role_signing_signers"
  ON public.signing_signers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
