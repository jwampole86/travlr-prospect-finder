-- Contract templates are versioned rows; a signing session records exactly which version and wording was sent.
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  version       integer NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  signer_label  text NOT NULL DEFAULT 'Signer',
  max_signers   integer NOT NULL DEFAULT 1,
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_html     text NOT NULL,
  body_hash     text NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  legal_review  text NOT NULL DEFAULT 'pending' CHECK (legal_review IN ('pending', 'approved')),
  review_notes  text,
  reviewed_by   uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_templates_one_active ON public.contract_templates (kind) WHERE status = 'active';

-- Who "the Company" is on every contract. One row.
CREATE TABLE IF NOT EXISTS public.contract_company_profile (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name            text NOT NULL DEFAULT '',
  entity_type           text NOT NULL DEFAULT '',
  state_of_organization text NOT NULL DEFAULT '',
  address               text NOT NULL DEFAULT '',
  signer_name           text NOT NULL DEFAULT '',
  signer_title          text NOT NULL DEFAULT '',
  notice_email          text NOT NULL DEFAULT '',
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL
);
INSERT INTO public.contract_company_profile (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_company_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_contract_templates" ON public.contract_templates;
CREATE POLICY "service_role_contract_templates" ON public.contract_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_contract_company_profile" ON public.contract_company_profile;
CREATE POLICY "service_role_contract_company_profile" ON public.contract_company_profile FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.signing_sessions
  ADD COLUMN IF NOT EXISTS contract_kind text NOT NULL DEFAULT 'homeowner_management',
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS document_html text;
