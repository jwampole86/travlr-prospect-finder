-- Property operations: managed-property records, owner onboarding tasks, turnover coordination, owner statements.

CREATE TABLE IF NOT EXISTS public.managed_properties (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                text NOT NULL UNIQUE,
  address                text NOT NULL,
  city                   text,
  state                  text,
  owner_name             text,
  owner_email            text,
  owner_phone            text,
  status                 text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'active', 'paused', 'offboarded')),
  management_fee_percent numeric(5,2),
  payout_schedule        text,
  signing_session_id     uuid REFERENCES public.signing_sessions(id) ON DELETE SET NULL,
  agreement_signed_at    timestamptz,
  activated_at           timestamptz,
  listing_urls           jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                  text,
  created_by             uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.managed_properties(id) ON DELETE CASCADE,
  key          text NOT NULL,
  title        text NOT NULL,
  detail       text,
  sort_order   integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'blocked', 'skipped')),
  auto         boolean NOT NULL DEFAULT false,
  due_date     date,
  notes        text,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  UNIQUE (property_id, key)
);

CREATE TABLE IF NOT EXISTS public.property_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES public.managed_properties(id) ON DELETE CASCADE,
  expense_date   date NOT NULL,
  category       text NOT NULL,
  description    text,
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  cleaning_job_id uuid,
  created_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.owner_statements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.managed_properties(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  gross_revenue   numeric(12,2) NOT NULL DEFAULT 0,
  management_fee  numeric(12,2) NOT NULL DEFAULT 0,
  expenses_total  numeric(12,2) NOT NULL DEFAULT 0,
  net_payout      numeric(12,2) NOT NULL DEFAULT 0,
  fee_percent     numeric(5,2),
  line_items      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  sent_at         timestamptz,
  paid_at         timestamptz,
  payout_id       uuid,
  created_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, period_start, period_end)
);

ALTER TABLE public.cleaning_jobs
  ADD COLUMN IF NOT EXISTS property_id  uuid REFERENCES public.managed_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id   uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS cost         numeric(10,2),
  ADD COLUMN IF NOT EXISTS same_day     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS issues       text,
  ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;
UPDATE public.cleaning_jobs SET access_token = replace(gen_random_uuid()::text, '-', '') WHERE access_token IS NULL;
ALTER TABLE public.cleaning_jobs ALTER COLUMN access_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaning_jobs_access_token ON public.cleaning_jobs (access_token);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_date ON public.cleaning_jobs (scheduled_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaning_jobs_booking_turnover ON public.cleaning_jobs (booking_id) WHERE booking_id IS NOT NULL AND cleaning_type = 'Turnover';
CREATE INDEX IF NOT EXISTS idx_expenses_property ON public.property_expenses (property_id, expense_date);

ALTER TABLE public.cleaners ADD COLUMN IF NOT EXISTS rate_per_turnover numeric(10,2);

-- Only the server (service role) reads or writes these; people reach them through authorized API routes.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['managed_properties', 'onboarding_tasks', 'property_expenses', 'owner_statements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "service_role_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "service_role_%1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public) VALUES ('cleaning-photos', 'cleaning-photos', false) ON CONFLICT (id) DO NOTHING;
