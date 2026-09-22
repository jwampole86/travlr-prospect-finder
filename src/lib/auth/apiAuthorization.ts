import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const ADMIN_ROLES = new Set(['admin', 'owner', 'operator', 'super_admin']);

export type ApiActor = {
  client: SupabaseClient;
  user: User;
  role: string;
  isAdmin: boolean;
};

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
}

/** Resolves a cookie or bearer-token session without using the service role. */
export async function getApiActor(request: NextRequest): Promise<ApiActor | null> {
  const serverClient = await createServerClient();
  const bearerToken = getBearerToken(request);
  let client = serverClient as SupabaseClient;
  let user = (await serverClient.auth.getUser()).data.user;

  if (!user && bearerToken) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
    );
    user = (await client.auth.getUser(bearerToken)).data.user;
  }

  if (!user) return null;

  const { data: profile } = await client
    .from('user_profiles')
    .select('app_role, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.app_role || profile?.role || user.user_metadata?.role || '';
  if (!role || profile?.is_active === false) return null;

  return { client, user, role, isAdmin: ADMIN_ROLES.has(role) };
}

export async function requireApiActor(request: NextRequest) {
  const actor = await getApiActor(request);
  if (!actor) return { actor: null, error: 'Unauthorized', status: 401 } as const;
  return { actor, error: null, status: 200 } as const;
}

export async function requireAdminActor(request: NextRequest) {
  const result = await requireApiActor(request);
  if (!result.actor) return result;
  if (!result.actor.isAdmin) return { actor: null, error: 'Forbidden', status: 403 } as const;
  return result;
}

/** Permits admins and the agent currently assigned through the canonical user ID. */
export async function requireLeadAccess(request: NextRequest, leadId: string) {
  const result = await requireApiActor(request);
  if (!result.actor) return result;
  if (result.actor.isAdmin) return result;
  if (result.actor.role !== 'agent') return { actor: null, error: 'Forbidden', status: 403 } as const;

  const { data: lead } = await result.actor.client
    .from('leads')
    .select('primary_agent_id')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead || lead.primary_agent_id !== result.actor.user.id) {
    return { actor: null, error: 'Forbidden', status: 403 } as const;
  }

  return result;
}