-- Deal Closed Onboarding: payout accounts, blackout dates, onboarding status
-- Tracks post-signing homeowner onboarding state per lead

-- ── Onboarding status on leads ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_status') THEN
    CREATE TYPE public.onboarding_status AS ENUM ('incomplete', 'in_progress', 'complete');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_frequency') THEN
    CREATE TYPE public.payout_frequency AS ENUM ('monthly', 'biweekly');
  END IF;
END $$;

-- Add onboarding columns to leads if not present
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS onboarding_status public.onboarding_status DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS payout_account_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS listing_active boolean DEFAULT false;

-- ── Homeowner onboarding records ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homeowner_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  signing_session_id uuid REFERENCES public.signing_sessions(id) ON DELETE SET NULL,

  -- Bank / payout account
  bank_account_name text,
  bank_routing_number text,
  bank_account_number_last4 text,
  bank_account_type text DEFAULT 'checking', -- checking | savings
  payout_frequency public.payout_frequency DEFAULT 'monthly',

  -- Stripe Connect (placeholder — credentials added later)
  stripe_connect_account_id text,
  stripe_connect_status text DEFAULT 'not_started', -- not_started | pending | verified | failed

  -- Blackout dates
  blackout_dates jsonb DEFAULT '[]'::jsonb, -- array of {start: ISO, end: ISO, label: string}

  -- Activation
  listing_activated boolean DEFAULT false,
  listing_activated_at timestamptz,

  -- Onboarding step tracking
  step_bank_confirmed boolean DEFAULT false,
  step_blackout_set boolean DEFAULT false,
  step_payout_selected boolean DEFAULT false,
  step_listing_activated boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_onboarding_lead_id ON public.homeowner_onboarding(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_onboarding_signing_session ON public.homeowner_onboarding(signing_session_id);

-- RLS
ALTER TABLE public.homeowner_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can manage onboarding" ON public.homeowner_onboarding;
CREATE POLICY "Agents can manage onboarding"
  ON public.homeowner_onboarding
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_homeowner_onboarding_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homeowner_onboarding_updated_at ON public.homeowner_onboarding;
CREATE TRIGGER trg_homeowner_onboarding_updated_at
  BEFORE UPDATE ON public.homeowner_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_homeowner_onboarding_updated_at();
