-- ============================================================
-- RBAC + Homeowner Portal + Property Operations Module
-- ============================================================

-- 1. Add role column to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'agent', 'homeowner'));

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT DEFAULT '';

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS invitation_token TEXT DEFAULT '';

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;

-- 2. Update handle_new_user trigger to include role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  )
  ON CONFLICT (id) DO UPDATE SET
    role = COALESCE(EXCLUDED.role, public.user_profiles.role);
  RETURN NEW;
END;
$$;

-- 3. Helper function: get current user role (safe, no recursion)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(raw_user_meta_data->>'role', 'admin')
  FROM auth.users
  WHERE id = auth.uid()
$$;

-- 4. lead_assignments table
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_agent_user_id ON public.lead_assignments(agent_user_id);

-- 5. homeowner_profiles table
CREATE TABLE IF NOT EXISTS public.homeowner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  stripe_connect_account_id TEXT DEFAULT '',
  payout_method TEXT DEFAULT 'bank_transfer',
  notification_email BOOLEAN DEFAULT true,
  notification_sms BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homeowner_profiles_user_id ON public.homeowner_profiles(user_id);

-- 6. property_homeowners (many-to-many: leads/properties <-> homeowners)
CREATE TABLE IF NOT EXISTS public.property_homeowners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  homeowner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL DEFAULT 'owner' CHECK (permission_level IN ('owner', 'shared', 'view_only')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_homeowners_unique ON public.property_homeowners(lead_id, homeowner_user_id);
CREATE INDEX IF NOT EXISTS idx_property_homeowners_homeowner ON public.property_homeowners(homeowner_user_id);
CREATE INDEX IF NOT EXISTS idx_property_homeowners_lead ON public.property_homeowners(lead_id);

-- 7. commissions table
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'clawed_back')),
  description TEXT DEFAULT '',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  stripe_transfer_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_agent_user_id ON public.commissions(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.commissions(status);

-- 8. payouts table (homeowner payouts)
CREATE TABLE IF NOT EXISTS public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  management_fee NUMERIC(12,2) DEFAULT 0,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  stripe_transfer_id TEXT DEFAULT '',
  statement_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_homeowner_user_id ON public.payouts(homeowner_user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);

-- 9. bookings table (for homeowner portal)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  guest_name TEXT DEFAULT '',
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INTEGER DEFAULT 1,
  gross_revenue NUMERIC(12,2) DEFAULT 0,
  platform TEXT DEFAULT 'Airbnb',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_lead_id ON public.bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON public.bookings(check_in);

-- 10. special_requests table
CREATE TABLE IF NOT EXISTS public.special_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  homeowner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'completed', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_special_requests_lead_id ON public.special_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_special_requests_homeowner ON public.special_requests(homeowner_user_id);

-- 11. homeowner_documents table
CREATE TABLE IF NOT EXISTS public.homeowner_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  homeowner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  document_type TEXT DEFAULT 'agreement' CHECK (document_type IN ('agreement', 'statement', 'tax', 'inspection', 'other')),
  file_url TEXT DEFAULT '',
  signed BOOLEAN DEFAULT false,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_documents_lead_id ON public.homeowner_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_documents_homeowner ON public.homeowner_documents(homeowner_user_id);

-- ============================================================
-- PROPERTY OPERATIONS MODULE
-- ============================================================

-- 12. cleaners table
CREATE TABLE IF NOT EXISTS public.cleaners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. cleaning_jobs table
DROP TYPE IF EXISTS public.cleaning_type CASCADE;
CREATE TYPE public.cleaning_type AS ENUM ('Turnover', 'Deep Clean', 'Mid-stay', 'Custom');

DROP TYPE IF EXISTS public.cleaning_status CASCADE;
CREATE TYPE public.cleaning_status AS ENUM ('Scheduled', 'In Progress', 'Completed', 'Verified', 'Needs Redo');

CREATE TABLE IF NOT EXISTS public.cleaning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  cleaner_id UUID REFERENCES public.cleaners(id) ON DELETE SET NULL,
  cleaning_type public.cleaning_type NOT NULL DEFAULT 'Turnover'::public.cleaning_type,
  scheduled_date DATE NOT NULL,
  time_window TEXT DEFAULT '10:00 AM - 12:00 PM',
  special_instructions TEXT DEFAULT '',
  status public.cleaning_status DEFAULT 'Scheduled'::public.cleaning_status,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT DEFAULT '',
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  before_photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  after_photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  cleaner_notes TEXT DEFAULT '',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  scheduled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_lead_id ON public.cleaning_jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_scheduled_date ON public.cleaning_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_status ON public.cleaning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_cleaner_id ON public.cleaning_jobs(cleaner_id);

-- 14. inventory_items table
DROP TYPE IF EXISTS public.inventory_status CASCADE;
CREATE TYPE public.inventory_status AS ENUM ('Good', 'Low', 'Out');

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'General',
  status public.inventory_status DEFAULT 'Good'::public.inventory_status,
  last_restocked_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  linked_cleaning_job_id UUID REFERENCES public.cleaning_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_lead_id ON public.inventory_items(lead_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON public.inventory_items(status);

-- 15. maintenance_requests table
DROP TYPE IF EXISTS public.maintenance_category CASCADE;
CREATE TYPE public.maintenance_category AS ENUM ('Plumbing', 'Electrical', 'HVAC', 'Appliance', 'General', 'Emergency');

DROP TYPE IF EXISTS public.maintenance_priority CASCADE;
CREATE TYPE public.maintenance_priority AS ENUM ('Low', 'Medium', 'High', 'Emergency');

DROP TYPE IF EXISTS public.maintenance_status CASCADE;
CREATE TYPE public.maintenance_status AS ENUM ('Submitted', 'Assigned', 'In Progress', 'Completed', 'Verified');

CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.maintenance_category NOT NULL DEFAULT 'General'::public.maintenance_category,
  priority public.maintenance_priority NOT NULL DEFAULT 'Medium'::public.maintenance_priority,
  status public.maintenance_status DEFAULT 'Submitted'::public.maintenance_status,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  assigned_to TEXT DEFAULT '',
  estimated_cost NUMERIC(10,2),
  actual_cost NUMERIC(10,2),
  internal_notes TEXT DEFAULT '',
  completed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_lead_id ON public.maintenance_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_status ON public.maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_priority ON public.maintenance_requests(priority);

-- 16. maintenance_timeline table (activity history)
CREATE TABLE IF NOT EXISTS public.maintenance_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_request_id UUID NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_timeline_request_id ON public.maintenance_timeline(maintenance_request_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_homeowners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_timeline ENABLE ROW LEVEL SECURITY;

-- lead_assignments: admin full access, agent sees own assignments
DROP POLICY IF EXISTS "lead_assignments_admin_all" ON public.lead_assignments;
CREATE POLICY "lead_assignments_admin_all"
ON public.lead_assignments FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "lead_assignments_agent_view_own" ON public.lead_assignments;
CREATE POLICY "lead_assignments_agent_view_own"
ON public.lead_assignments FOR SELECT TO authenticated
USING (public.get_my_role() = 'agent' AND agent_user_id = auth.uid());

-- homeowner_profiles: admin full, homeowner own row
DROP POLICY IF EXISTS "homeowner_profiles_admin_all" ON public.homeowner_profiles;
CREATE POLICY "homeowner_profiles_admin_all"
ON public.homeowner_profiles FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "homeowner_profiles_own_row" ON public.homeowner_profiles;
CREATE POLICY "homeowner_profiles_own_row"
ON public.homeowner_profiles FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- property_homeowners: admin full, homeowner sees own links
DROP POLICY IF EXISTS "property_homeowners_admin_all" ON public.property_homeowners;
CREATE POLICY "property_homeowners_admin_all"
ON public.property_homeowners FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "property_homeowners_homeowner_view" ON public.property_homeowners;
CREATE POLICY "property_homeowners_homeowner_view"
ON public.property_homeowners FOR SELECT TO authenticated
USING (homeowner_user_id = auth.uid());

-- commissions: admin full, agent sees own
DROP POLICY IF EXISTS "commissions_admin_all" ON public.commissions;
CREATE POLICY "commissions_admin_all"
ON public.commissions FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "commissions_agent_view_own" ON public.commissions;
CREATE POLICY "commissions_agent_view_own"
ON public.commissions FOR SELECT TO authenticated
USING (public.get_my_role() = 'agent' AND agent_user_id = auth.uid());

-- payouts: admin full, homeowner sees own
DROP POLICY IF EXISTS "payouts_admin_all" ON public.payouts;
CREATE POLICY "payouts_admin_all"
ON public.payouts FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "payouts_homeowner_view_own" ON public.payouts;
CREATE POLICY "payouts_homeowner_view_own"
ON public.payouts FOR SELECT TO authenticated
USING (homeowner_user_id = auth.uid());

-- bookings: admin full, homeowner sees own properties
DROP POLICY IF EXISTS "bookings_admin_all" ON public.bookings;
CREATE POLICY "bookings_admin_all"
ON public.bookings FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "bookings_homeowner_view" ON public.bookings;
CREATE POLICY "bookings_homeowner_view"
ON public.bookings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_homeowners ph
    WHERE ph.lead_id = bookings.lead_id
    AND ph.homeowner_user_id = auth.uid()
  )
);

-- special_requests: admin full, homeowner own
DROP POLICY IF EXISTS "special_requests_admin_all" ON public.special_requests;
CREATE POLICY "special_requests_admin_all"
ON public.special_requests FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "special_requests_homeowner_own" ON public.special_requests;
CREATE POLICY "special_requests_homeowner_own"
ON public.special_requests FOR ALL TO authenticated
USING (homeowner_user_id = auth.uid())
WITH CHECK (homeowner_user_id = auth.uid());

-- homeowner_documents: admin full, homeowner own
DROP POLICY IF EXISTS "homeowner_documents_admin_all" ON public.homeowner_documents;
CREATE POLICY "homeowner_documents_admin_all"
ON public.homeowner_documents FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "homeowner_documents_own" ON public.homeowner_documents;
CREATE POLICY "homeowner_documents_own"
ON public.homeowner_documents FOR SELECT TO authenticated
USING (homeowner_user_id = auth.uid());

-- cleaners: admin full, agent view
DROP POLICY IF EXISTS "cleaners_admin_all" ON public.cleaners;
CREATE POLICY "cleaners_admin_all"
ON public.cleaners FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'agent'))
WITH CHECK (public.get_my_role() IN ('admin', 'agent'));

-- cleaning_jobs: admin/agent full, homeowner view own properties
DROP POLICY IF EXISTS "cleaning_jobs_admin_agent_all" ON public.cleaning_jobs;
CREATE POLICY "cleaning_jobs_admin_agent_all"
ON public.cleaning_jobs FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'agent'))
WITH CHECK (public.get_my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "cleaning_jobs_homeowner_view" ON public.cleaning_jobs;
CREATE POLICY "cleaning_jobs_homeowner_view"
ON public.cleaning_jobs FOR SELECT TO authenticated
USING (
  public.get_my_role() = 'homeowner' AND
  EXISTS (
    SELECT 1 FROM public.property_homeowners ph
    WHERE ph.lead_id = cleaning_jobs.lead_id
    AND ph.homeowner_user_id = auth.uid()
  )
);

-- inventory_items: admin/agent full, homeowner view own
DROP POLICY IF EXISTS "inventory_items_admin_agent_all" ON public.inventory_items;
CREATE POLICY "inventory_items_admin_agent_all"
ON public.inventory_items FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'agent'))
WITH CHECK (public.get_my_role() IN ('admin', 'agent'));

-- maintenance_requests: admin/agent full, homeowner own
DROP POLICY IF EXISTS "maintenance_requests_admin_agent_all" ON public.maintenance_requests;
CREATE POLICY "maintenance_requests_admin_agent_all"
ON public.maintenance_requests FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'agent'))
WITH CHECK (public.get_my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "maintenance_requests_homeowner_own" ON public.maintenance_requests;
CREATE POLICY "maintenance_requests_homeowner_own"
ON public.maintenance_requests FOR ALL TO authenticated
USING (
  public.get_my_role() = 'homeowner' AND
  EXISTS (
    SELECT 1 FROM public.property_homeowners ph
    WHERE ph.lead_id = maintenance_requests.lead_id
    AND ph.homeowner_user_id = auth.uid()
  )
)
WITH CHECK (
  public.get_my_role() = 'homeowner' AND
  EXISTS (
    SELECT 1 FROM public.property_homeowners ph
    WHERE ph.lead_id = maintenance_requests.lead_id
    AND ph.homeowner_user_id = auth.uid()
  )
);

-- maintenance_timeline: admin/agent full
DROP POLICY IF EXISTS "maintenance_timeline_admin_agent_all" ON public.maintenance_timeline;
CREATE POLICY "maintenance_timeline_admin_agent_all"
ON public.maintenance_timeline FOR ALL TO authenticated
USING (public.get_my_role() IN ('admin', 'agent'))
WITH CHECK (public.get_my_role() IN ('admin', 'agent'));

-- Update leads RLS to support agent row-level restriction
DROP POLICY IF EXISTS "users_manage_own_leads" ON public.leads;
CREATE POLICY "users_manage_own_leads"
ON public.leads FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'admin'
  OR (
    public.get_my_role() = 'agent' AND
    EXISTS (
      SELECT 1 FROM public.lead_assignments la
      WHERE la.lead_id = leads.id
      AND la.agent_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR public.get_my_role() = 'admin'
);

-- Update user_profiles RLS to allow admin to see all profiles
DROP POLICY IF EXISTS "users_manage_own_user_profiles" ON public.user_profiles;
CREATE POLICY "users_manage_own_user_profiles"
ON public.user_profiles FOR ALL TO authenticated
USING (id = auth.uid() OR public.get_my_role() = 'admin')
WITH CHECK (id = auth.uid() OR public.get_my_role() = 'admin');

-- ============================================================
-- SEED DEMO DATA
-- ============================================================
DO $$
DECLARE
  admin_uuid UUID := gen_random_uuid();
  agent_uuid UUID := gen_random_uuid();
  homeowner_uuid UUID := gen_random_uuid();
  sample_lead_id TEXT;
BEGIN
  -- Create demo users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES
    (admin_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@travlr.com', crypt('travlr2026', gen_salt('bf', 10)), now(), now(), now(),
     jsonb_build_object('full_name', 'TRAVLR Admin', 'role', 'admin'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null),
    (agent_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'agent@travlr.com', crypt('travlr2026', gen_salt('bf', 10)), now(), now(), now(),
     jsonb_build_object('full_name', 'Sarah Chen', 'role', 'agent'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null),
    (homeowner_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'owner@travlr.com', crypt('travlr2026', gen_salt('bf', 10)), now(), now(), now(),
     jsonb_build_object('full_name', 'James Rivera', 'role', 'homeowner'),
     jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
     false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null)
  ON CONFLICT (id) DO NOTHING;

  -- Get a sample lead
  SELECT id INTO sample_lead_id FROM public.leads LIMIT 1;

  IF sample_lead_id IS NOT NULL THEN
    -- Link homeowner to property
    INSERT INTO public.property_homeowners (lead_id, homeowner_user_id, permission_level)
    VALUES (sample_lead_id, homeowner_uuid, 'owner')
    ON CONFLICT DO NOTHING;

    -- Sample commission for agent
    INSERT INTO public.commissions (agent_user_id, lead_id, amount, status, description)
    VALUES
      (agent_uuid, sample_lead_id, 1250.00, 'pending', 'Partnership agreement signed'),
      (agent_uuid, sample_lead_id, 875.00, 'approved', 'Property onboarding bonus')
    ON CONFLICT (id) DO NOTHING;

    -- Sample payout for homeowner
    INSERT INTO public.payouts (homeowner_user_id, lead_id, gross_amount, net_amount, management_fee, period_start, period_end, status)
    VALUES
      (homeowner_uuid, sample_lead_id, 4200.00, 3360.00, 840.00, '2026-07-01', '2026-07-31', 'paid'),
      (homeowner_uuid, sample_lead_id, 3800.00, 3040.00, 760.00, '2026-08-01', '2026-08-31', 'pending')
    ON CONFLICT (id) DO NOTHING;

    -- Sample bookings
    INSERT INTO public.bookings (lead_id, guest_name, check_in, check_out, nights, gross_revenue, platform, status)
    VALUES
      (sample_lead_id, 'Michael Thompson', '2026-08-15', '2026-08-20', 5, 1250.00, 'Airbnb', 'confirmed'),
      (sample_lead_id, 'Emily Watson', '2026-08-22', '2026-08-25', 3, 750.00, 'VRBO', 'confirmed'),
      (sample_lead_id, 'David Park', '2026-09-01', '2026-09-07', 6, 1500.00, 'Airbnb', 'confirmed')
    ON CONFLICT (id) DO NOTHING;

    -- Sample cleaning jobs
    INSERT INTO public.cleaning_jobs (lead_id, cleaning_type, scheduled_date, time_window, status, scheduled_by)
    VALUES
      (sample_lead_id, 'Turnover'::public.cleaning_type, CURRENT_DATE + 1, '10:00 AM - 12:00 PM', 'Scheduled'::public.cleaning_status, admin_uuid),
      (sample_lead_id, 'Deep Clean'::public.cleaning_type, CURRENT_DATE + 3, '9:00 AM - 1:00 PM', 'Scheduled'::public.cleaning_status, admin_uuid),
      (sample_lead_id, 'Turnover'::public.cleaning_type, CURRENT_DATE - 1, '10:00 AM - 12:00 PM', 'Needs Redo'::public.cleaning_status, admin_uuid)
    ON CONFLICT (id) DO NOTHING;

    -- Sample inventory items
    INSERT INTO public.inventory_items (lead_id, item_name, category, status)
    VALUES
      (sample_lead_id, 'Toilet Paper (12-pack)', 'Bathroom', 'Low'::public.inventory_status),
      (sample_lead_id, 'Paper Towels', 'Kitchen', 'Good'::public.inventory_status),
      (sample_lead_id, 'Trash Bags', 'General', 'Out'::public.inventory_status),
      (sample_lead_id, 'Coffee Pods (24-pack)', 'Kitchen', 'Low'::public.inventory_status),
      (sample_lead_id, 'Hand Soap', 'Bathroom', 'Good'::public.inventory_status),
      (sample_lead_id, 'Dish Soap', 'Kitchen', 'Good'::public.inventory_status)
    ON CONFLICT (id) DO NOTHING;

    -- Sample maintenance requests
    INSERT INTO public.maintenance_requests (lead_id, submitted_by, category, priority, status, title, description)
    VALUES
      (sample_lead_id, homeowner_uuid, 'Plumbing'::public.maintenance_category, 'High'::public.maintenance_priority, 'Submitted'::public.maintenance_status, 'Leaky faucet in master bath', 'The master bathroom faucet has been dripping continuously for 2 days.'),
      (sample_lead_id, admin_uuid, 'HVAC'::public.maintenance_category, 'Medium'::public.maintenance_priority, 'In Progress'::public.maintenance_status, 'AC filter replacement', 'Monthly AC filter replacement due.'),
      (sample_lead_id, admin_uuid, 'General'::public.maintenance_category, 'Low'::public.maintenance_priority, 'Completed'::public.maintenance_status, 'Touch-up paint in living room', 'Minor scuff marks on the living room wall near the entrance.')
    ON CONFLICT (id) DO NOTHING;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data error: %', SQLERRM;
END $$;
