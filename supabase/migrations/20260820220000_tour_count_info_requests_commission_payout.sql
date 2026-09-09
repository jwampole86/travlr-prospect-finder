-- ─── Migration: Tour view count, info request links, commission payout view,
--               enrichment self-submitted priority, tour analytics ─────────────

-- ── 1. Add tour_view_count to user_profiles ──────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS tour_view_count integer NOT NULL DEFAULT 0;

-- ── 2. RPC: increment_tour_view_count (safe, atomic) ─────────────────────────
CREATE OR REPLACE FUNCTION public.increment_tour_view_count(user_id_input uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET tour_view_count = tour_view_count + 1
  WHERE id = user_id_input;
END;
$$;

-- ── 3. Tour analytics table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tour_analytics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  event        text NOT NULL, -- tour_started, tour_completed, tour_skipped, tour_step_viewed
  payload      jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_analytics_user_id ON public.tour_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_tour_analytics_event ON public.tour_analytics(event);

-- RLS
ALTER TABLE public.tour_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tour_analytics' AND policyname = 'Users can insert own tour analytics'
  ) THEN
    CREATE POLICY "Users can insert own tour analytics"
      ON public.tour_analytics FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tour_analytics' AND policyname = 'Admins can read all tour analytics'
  ) THEN
    CREATE POLICY "Admins can read all tour analytics"
      ON public.tour_analytics FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid() AND app_role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 4. Lead info request links ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_info_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  link_token           text NOT NULL UNIQUE,
  sent_via             text NOT NULL DEFAULT 'email', -- 'email' | 'sms'
  sent_at              timestamptz NOT NULL DEFAULT now(),
  submitted_at         timestamptz,
  first_name           text,
  last_name            text,
  phone                text,
  email                text,
  address_confirmed    boolean DEFAULT true,
  address_as_submitted text,
  claude_summary       text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_info_requests_lead_id ON public.lead_info_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_info_requests_link_token ON public.lead_info_requests(link_token);

ALTER TABLE public.lead_info_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_info_requests' AND policyname = 'Agents can manage info requests for their leads'
  ) THEN
    CREATE POLICY "Agents can manage info requests for their leads"
      ON public.lead_info_requests FOR ALL
      USING (
        public.get_my_role() = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.lead_assignments la
          WHERE la.lead_id = lead_info_requests.lead_id
            AND la.agent_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 5. Add contact_info_source and lead_status_tag to leads ──────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_info_source text DEFAULT 'enriched', -- 'enriched' | 'self_submitted'
  ADD COLUMN IF NOT EXISTS lead_status_tag text,
  ADD COLUMN IF NOT EXISTS listing_url_type text DEFAULT 'scraped'; -- 'scraped' | 'fallback_address_search' | 'synthetic'

-- ── 6. Add origin tag to enriched_emails and enriched_phones ─────────────────
ALTER TABLE public.enriched_emails
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'enriched'; -- 'enriched' | 'self_submitted'

ALTER TABLE public.enriched_phones
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'enriched'; -- 'enriched' | 'self_submitted'

-- ── 7. Agent commission payouts view (agent-scoped, never returns portfolio revenue) ──
CREATE TABLE IF NOT EXISTS public.agent_commission_payouts (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                        uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  pending_payout                  numeric(12,2) NOT NULL DEFAULT 0,
  next_payout_date                date,
  next_payout_amount              numeric(12,2) DEFAULT 0,
  total_earned_current_period     numeric(12,2) NOT NULL DEFAULT 0,
  total_earned_lifetime           numeric(12,2) NOT NULL DEFAULT 0,
  stripe_connect_status           text DEFAULT 'not_connected',
  stripe_connect_account_id       text,
  last_updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_commission_payouts_agent_id ON public.agent_commission_payouts(agent_id);

ALTER TABLE public.agent_commission_payouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_commission_payouts' AND policyname = 'Agents can only read own payout'
  ) THEN
    CREATE POLICY "Agents can only read own payout"
      ON public.agent_commission_payouts FOR SELECT
      USING (agent_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_commission_payouts' AND policyname = 'Admins can manage all payouts'
  ) THEN
    CREATE POLICY "Admins can manage all payouts"
      ON public.agent_commission_payouts FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid() AND app_role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 8. Listing URL extraction log (if not already created) ───────────────────
CREATE TABLE IF NOT EXISTS public.listing_url_extraction_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       text REFERENCES public.leads(id) ON DELETE SET NULL,
  address       text,
  source        text,
  trigger_reason text,
  original_url  text,
  extracted_url text,
  confidence    text,
  method        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_url_extraction_log_lead_id ON public.listing_url_extraction_log(lead_id);
