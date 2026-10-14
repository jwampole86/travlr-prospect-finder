-- user_profiles lets every signed-in user update their own row, which let anyone make themselves an admin.
-- Only admins and the service role may change roles, permissions or account status.
CREATE OR REPLACE FUNCTION public.protect_user_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.role(), 'service_role') = 'service_role' OR public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.app_role IS DISTINCT FROM OLD.app_role
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id
     OR NEW.perm_lead_access IS DISTINCT FROM OLD.perm_lead_access
     OR NEW.perm_export IS DISTINCT FROM OLD.perm_export
     OR NEW.perm_sync IS DISTINCT FROM OLD.perm_sync
     OR NEW.perm_pipeline IS DISTINCT FROM OLD.perm_pipeline
     OR NEW.perm_analytics IS DISTINCT FROM OLD.perm_analytics
     OR NEW.perm_settings IS DISTINCT FROM OLD.perm_settings THEN
    RAISE EXCEPTION 'Only an administrator can change roles, permissions or account status.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_profile_privileges ON public.user_profiles;
CREATE TRIGGER protect_user_profile_privileges BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_privileges();
