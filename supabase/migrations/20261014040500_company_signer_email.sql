-- The person who countersigns needs their own email, separate from the notices address.
ALTER TABLE public.contract_company_profile ADD COLUMN IF NOT EXISTS signer_email text NOT NULL DEFAULT '';
