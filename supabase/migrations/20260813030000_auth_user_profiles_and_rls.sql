-- ============================================================
-- Auth: user_profiles table + RLS for all lead-related tables
-- ============================================================

-- 1. Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads(user_id);

-- 3. Trigger function: auto-create user_profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_reminders ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- user_profiles: own row only
DROP POLICY IF EXISTS "users_manage_own_user_profiles" ON public.user_profiles;
CREATE POLICY "users_manage_own_user_profiles"
ON public.user_profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- leads: scoped to user_id
DROP POLICY IF EXISTS "users_manage_own_leads" ON public.leads;
CREATE POLICY "users_manage_own_leads"
ON public.leads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- email_templates: shared across all authenticated users (no user_id column)
DROP POLICY IF EXISTS "authenticated_manage_email_templates" ON public.email_templates;
CREATE POLICY "authenticated_manage_email_templates"
ON public.email_templates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- contact_history: scoped via lead ownership
DROP POLICY IF EXISTS "users_manage_own_contact_history" ON public.contact_history;
CREATE POLICY "users_manage_own_contact_history"
ON public.contact_history
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = contact_history.lead_id
    AND l.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = contact_history.lead_id
    AND l.user_id = auth.uid()
  )
);

-- outreach_cadences: scoped via lead ownership
DROP POLICY IF EXISTS "users_manage_own_outreach_cadences" ON public.outreach_cadences;
CREATE POLICY "users_manage_own_outreach_cadences"
ON public.outreach_cadences
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = outreach_cadences.lead_id
    AND l.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = outreach_cadences.lead_id
    AND l.user_id = auth.uid()
  )
);

-- lead_reminders: scoped via lead ownership
DROP POLICY IF EXISTS "users_manage_own_lead_reminders" ON public.lead_reminders;
CREATE POLICY "users_manage_own_lead_reminders"
ON public.lead_reminders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_reminders.lead_id
    AND l.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_reminders.lead_id
    AND l.user_id = auth.uid()
  )
);

-- 6. Trigger: fires after new auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
