-- Distinguish the homeowner signers from TRAVLR's counter-signer on the same envelope.
ALTER TABLE public.signing_signers
  ADD COLUMN IF NOT EXISTS signer_role text NOT NULL DEFAULT 'homeowner' CHECK (signer_role IN ('homeowner', 'counter_signer'));
