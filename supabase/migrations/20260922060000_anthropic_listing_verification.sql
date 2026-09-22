ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS listing_verification_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS listing_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.listing_verification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'retry', 'failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

CREATE TABLE IF NOT EXISTS public.listing_verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.listing_verification_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  asking_rent NUMERIC,
  confidence INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  source_domain TEXT,
  source_title TEXT,
  evidence_summary TEXT,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listing_verification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  minimum_lead_score INTEGER NOT NULL DEFAULT 80,
  minimum_evidence_confidence INTEGER NOT NULL DEFAULT 80,
  daily_search_limit INTEGER NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_verification_jobs_queue_idx
  ON public.listing_verification_jobs (status, next_attempt_at, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS listing_verification_evidence_lead_idx
  ON public.listing_verification_evidence (lead_id, searched_at DESC);

ALTER TABLE public.listing_verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_verification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_verification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_listing_verification_jobs" ON public.listing_verification_jobs;
CREATE POLICY "users_manage_own_listing_verification_jobs" ON public.listing_verification_jobs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users_read_own_listing_verification_evidence" ON public.listing_verification_evidence;
CREATE POLICY "users_read_own_listing_verification_evidence" ON public.listing_verification_evidence
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "users_manage_own_listing_verification_settings" ON public.listing_verification_settings;
CREATE POLICY "users_manage_own_listing_verification_settings" ON public.listing_verification_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.listing_verification_jobs (user_id, lead_id, priority)
SELECT user_id, id, coalesce(prospect_score, 0)
FROM public.leads
WHERE user_id IS NOT NULL
  AND address_source = 'MASTER_HOMEOWNER_DATA'
  AND coalesce(prospect_score, 0) >= 80
ON CONFLICT (lead_id) DO NOTHING;