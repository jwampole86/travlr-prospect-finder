-- Operator Settings: email sender, notification prefs, integration secrets
CREATE TABLE IF NOT EXISTS public.operator_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL DEFAULT 'onboarding@resend.dev',
    sender_name TEXT NOT NULL DEFAULT 'TRAVLR Prospect Finder',
    notify_email_sent BOOLEAN NOT NULL DEFAULT true,
    notify_sync_health BOOLEAN NOT NULL DEFAULT true,
    notify_failed_cadence BOOLEAN NOT NULL DEFAULT true,
    notify_new_lead BOOLEAN NOT NULL DEFAULT true,
    resend_api_key_hint TEXT NOT NULL DEFAULT '',
    zillow_sync_key_hint TEXT NOT NULL DEFAULT '',
    hotpads_sync_key_hint TEXT NOT NULL DEFAULT '',
    craigslist_sync_key_hint TEXT NOT NULL DEFAULT '',
    apartments_sync_key_hint TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Team members per operator
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer',
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(owner_user_id, email)
);

-- In-app notifications
CREATE TABLE IF NOT EXISTS public.app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync schedule tracking per source
CREATE TABLE IF NOT EXISTS public.sync_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    next_sync_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'idle',
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    leads_added INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, source)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_operator_settings_user_id ON public.operator_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON public.team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_id ON public.app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_read ON public.app_notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_user_source ON public.sync_schedules(user_id, source);

-- Enable RLS
ALTER TABLE public.operator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies: operator_settings
DROP POLICY IF EXISTS "users_manage_own_operator_settings" ON public.operator_settings;
CREATE POLICY "users_manage_own_operator_settings"
ON public.operator_settings FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RLS Policies: team_members
DROP POLICY IF EXISTS "users_manage_own_team_members" ON public.team_members;
CREATE POLICY "users_manage_own_team_members"
ON public.team_members FOR ALL TO authenticated
USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- RLS Policies: app_notifications
DROP POLICY IF EXISTS "users_manage_own_app_notifications" ON public.app_notifications;
CREATE POLICY "users_manage_own_app_notifications"
ON public.app_notifications FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RLS Policies: sync_schedules
DROP POLICY IF EXISTS "users_manage_own_sync_schedules" ON public.sync_schedules;
CREATE POLICY "users_manage_own_sync_schedules"
ON public.sync_schedules FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
