-- ─── Workspace Portfolio Permissions ─────────────────────────────────────────
-- Tracks which users have access to which portfolios

CREATE TABLE IF NOT EXISTS public.workspace_portfolio_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_key text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz DEFAULT now(),
  UNIQUE(user_id, portfolio_key)
);

ALTER TABLE public.workspace_portfolio_permissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_portfolio_permissions' AND policyname = 'workspace_portfolio_permissions_select'
  ) THEN
    CREATE POLICY "workspace_portfolio_permissions_select"
      ON public.workspace_portfolio_permissions FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_portfolio_permissions' AND policyname = 'workspace_portfolio_permissions_insert'
  ) THEN
    CREATE POLICY "workspace_portfolio_permissions_insert"
      ON public.workspace_portfolio_permissions FOR INSERT
      TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_portfolio_permissions' AND policyname = 'workspace_portfolio_permissions_delete'
  ) THEN
    CREATE POLICY "workspace_portfolio_permissions_delete"
      ON public.workspace_portfolio_permissions FOR DELETE
      TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_portfolio_perms_user ON public.workspace_portfolio_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_portfolio_perms_portfolio ON public.workspace_portfolio_permissions(portfolio_key);

-- ─── HubSpot Sync Log ─────────────────────────────────────────────────────────
-- Tracks all HubSpot sync operations (push/pull)

CREATE TABLE IF NOT EXISTS public.hubspot_sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type text NOT NULL CHECK (sync_type IN ('push_closed_deal', 'push_metrics', 'push_conversion', 'pull_history')),
  lead_id text,
  contact_email text,
  hubspot_contact_id text,
  hubspot_deal_id text,
  hubspot_note_id text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
  error_message text,
  payload jsonb,
  touch_points_count integer DEFAULT 0,
  synced_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE public.hubspot_sync_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hubspot_sync_log' AND policyname = 'hubspot_sync_log_select'
  ) THEN
    CREATE POLICY "hubspot_sync_log_select"
      ON public.hubspot_sync_log FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hubspot_sync_log' AND policyname = 'hubspot_sync_log_insert'
  ) THEN
    CREATE POLICY "hubspot_sync_log_insert"
      ON public.hubspot_sync_log FOR INSERT
      TO authenticated WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_log_lead ON public.hubspot_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_log_type ON public.hubspot_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_log_synced_at ON public.hubspot_sync_log(synced_at DESC);

-- ─── Workspace Activity Log ───────────────────────────────────────────────────
-- Tracks user activity across the workspace for admin visibility

CREATE TABLE IF NOT EXISTS public.workspace_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_name text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  resource_label text,
  details text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_activity_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_activity_log' AND policyname = 'workspace_activity_log_select'
  ) THEN
    CREATE POLICY "workspace_activity_log_select"
      ON public.workspace_activity_log FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_activity_log' AND policyname = 'workspace_activity_log_insert'
  ) THEN
    CREATE POLICY "workspace_activity_log_insert"
      ON public.workspace_activity_log FOR INSERT
      TO authenticated WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_activity_user ON public.workspace_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_action ON public.workspace_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_created ON public.workspace_activity_log(created_at DESC);

-- ─── Lead Archive Status ──────────────────────────────────────────────────────
-- Add archived_at column to leads if not present

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON public.leads(archived_at) WHERE archived_at IS NOT NULL;
