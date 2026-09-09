-- ============================================================
-- Admin Roles & Permissions + Support Tickets
-- ============================================================

-- 1. Add granular permission columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'admin'
    CHECK (app_role IN ('admin', 'agent', 'homeowner')),
  ADD COLUMN IF NOT EXISTS perm_lead_access BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS perm_export BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_sync BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_pipeline BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS perm_analytics BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_settings BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_count INT NOT NULL DEFAULT 0;

-- 2. role_permission_templates table (named presets for roles)
CREATE TABLE IF NOT EXISTS public.role_permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  perm_lead_access BOOLEAN NOT NULL DEFAULT true,
  perm_export BOOLEAN NOT NULL DEFAULT false,
  perm_sync BOOLEAN NOT NULL DEFAULT false,
  perm_pipeline BOOLEAN NOT NULL DEFAULT true,
  perm_analytics BOOLEAN NOT NULL DEFAULT false,
  perm_settings BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. user_access_audit table (audit log for role/permission changes)
CREATE TABLE IF NOT EXISTS public.user_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('role_change', 'permission_change', 'invite', 'deactivate', 'reactivate')),
  old_value JSONB DEFAULT NULL,
  new_value JSONB DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_access_audit_target ON public.user_access_audit(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_audit_changed_by ON public.user_access_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_user_access_audit_created_at ON public.user_access_audit(created_at DESC);

-- 4. active_sessions table (track user sessions)
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  started_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_active ON public.active_sessions(is_active);

-- 5. support_tickets table
DROP TYPE IF EXISTS public.ticket_status CASCADE;
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved');

DROP TYPE IF EXISTS public.ticket_category CASCADE;
CREATE TYPE public.ticket_category AS ENUM ('bug', 'suggestion', 'question', 'other');

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL DEFAULT '',
  category public.ticket_category NOT NULL DEFAULT 'other',
  related_page TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  ticket_status public.ticket_status NOT NULL DEFAULT 'open',
  admin_notes TEXT DEFAULT '',
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(ticket_status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON public.support_tickets(ticket_number);

-- 6. ticket_number sequence function
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_val FROM public.support_tickets;
  RETURN 'TKT-' || LPAD(seq_val::TEXT, 5, '0');
END;
$$;

-- 7. Auto-set ticket_number on insert
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_ticket_number
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

-- 8. RLS

-- role_permission_templates: admins can manage, all authenticated can read
ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_role_templates" ON public.role_permission_templates;
CREATE POLICY "authenticated_read_role_templates"
  ON public.role_permission_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_manage_role_templates" ON public.role_permission_templates;
CREATE POLICY "admin_manage_role_templates"
  ON public.role_permission_templates FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- user_access_audit: admins can read all, users can read own
ALTER TABLE public.user_access_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_all_access_audit" ON public.user_access_audit;
CREATE POLICY "admin_read_all_access_audit"
  ON public.user_access_audit FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin' OR target_user_id = auth.uid());
DROP POLICY IF EXISTS "admin_insert_access_audit" ON public.user_access_audit;
CREATE POLICY "admin_insert_access_audit"
  ON public.user_access_audit FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

-- active_sessions: users see own, admins see all
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_manage_own_sessions" ON public.active_sessions;
CREATE POLICY "users_manage_own_sessions"
  ON public.active_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

-- support_tickets: users manage own, admins manage all
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_manage_own_tickets" ON public.support_tickets;
CREATE POLICY "users_manage_own_tickets"
  ON public.support_tickets FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

-- 9. Seed default role templates
INSERT INTO public.role_permission_templates (name, label, description, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings)
VALUES
  ('admin', 'Admin', 'Full access to all features', true, true, true, true, true, true),
  ('agent', 'Agent', 'Lead access and pipeline management', true, false, false, true, false, false),
  ('viewer', 'Viewer', 'Read-only access to leads and pipeline', true, false, false, true, false, false),
  ('analyst', 'Analyst', 'Analytics and export access', true, true, false, true, true, false)
ON CONFLICT (name) DO NOTHING;
