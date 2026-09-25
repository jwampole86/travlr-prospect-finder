import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin', 'owner', 'operator', 'super_admin'];

/**
 * Authorizes background-job endpoints for two callers:
 * 1. External cron schedulers — via the `x-job-secret` header matching SEQUENCE_JOB_SECRET.
 * 2. Logged-in admins — via their Supabase session cookie (no secret ever sent to the browser).
 */
export async function verifyJobRequest(req: NextRequest): Promise<{ authorized: boolean; reason?: string }> {
  // Placeholder env values (e.g. "your-sequence-job-secret-here") are truthy but must never
  // be accepted as a real secret — otherwise the well-known placeholder string itself becomes
  // a valid credential for every deployment that hasn't configured a real one yet.
  const isRealSecret = (secret: string | undefined): secret is string =>
    Boolean(secret) && !/your-|placeholder|changeme|example/i.test(secret!);
  const secrets = [process.env.SEQUENCE_JOB_SECRET, process.env.CRON_SECRET].filter(isRealSecret);
  const headerSecret = req.headers.get('x-job-secret');
    const authorization = req.headers.get('authorization');
  if (secrets.some(secret => headerSecret === secret || authorization === `Bearer ${secret}`)) {
    return { authorized: true };
  }
  if (secrets.length === 0 && !headerSecret) {
    // No secret configured anywhere — dev mode, allow.
    return { authorized: true };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { authorized: false, reason: 'Unauthorized' };

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('app_role, role')
      .eq('id', user.id)
      .single();

    const effectiveRole = profile?.app_role || profile?.role || user.user_metadata?.role || 'agent';
    if (!ADMIN_ROLES.includes(effectiveRole)) {
      return { authorized: false, reason: 'Forbidden' };
    }
    return { authorized: true };
  } catch {
    return { authorized: false, reason: 'Unauthorized' };
  }
}
