-- Requests from homeowners who read their estimate: "schedule a call" and "ask a question".
-- Written only by the server (service role) from the public estimate pages; staff read and work them.
CREATE TABLE IF NOT EXISTS public.homeowner_inquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  inquiry_type    TEXT NOT NULL CHECK (inquiry_type IN ('call', 'question')),
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'closed')),
  first_name      TEXT NOT NULL,
  last_name       TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  address         TEXT NOT NULL,
  preferred_date  DATE,
  preferred_window TEXT CHECK (preferred_window IS NULL OR preferred_window IN ('morning', 'afternoon', 'evening')),
  timezone        TEXT,
  message         TEXT,
  sms_consent     BOOLEAN NOT NULL DEFAULT false,
  report_snapshot JSONB,
  handled_by      UUID,
  handled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_inquiries_status ON public.homeowner_inquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_inquiries_lead ON public.homeowner_inquiries (lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_inquiries_email ON public.homeowner_inquiries (lower(email), created_at DESC);

ALTER TABLE public.homeowner_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homeowner_inquiries_staff_read" ON public.homeowner_inquiries;
CREATE POLICY "homeowner_inquiries_staff_read" ON public.homeowner_inquiries
  FOR SELECT TO authenticated
  USING (public.get_my_app_role() IN ('admin', 'owner', 'operator', 'super_admin', 'agent'));

DROP POLICY IF EXISTS "homeowner_inquiries_staff_update" ON public.homeowner_inquiries;
CREATE POLICY "homeowner_inquiries_staff_update" ON public.homeowner_inquiries
  FOR UPDATE TO authenticated
  USING (public.get_my_app_role() IN ('admin', 'owner', 'operator', 'super_admin', 'agent'))
  WITH CHECK (public.get_my_app_role() IN ('admin', 'owner', 'operator', 'super_admin', 'agent'));
