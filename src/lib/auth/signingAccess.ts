import 'server-only';
import type { NextRequest } from 'next/server';
import { requireApiActor, requireLeadAccess, type ApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type SigningAccess =
  | { ok: true; actor: ApiActor; kind: 'staff' | 'homeowner' }
  | { ok: false; error: string; status: number };

/**
 * Who may see or act on a lead's signing sessions: admins, the agent assigned to the lead, and the
 * homeowner account that belongs to that lead (read and sign only; callers decide what each kind may do).
 */
export async function authorizeSigning(req: NextRequest, leadId: string): Promise<SigningAccess> {
  const staff = await requireLeadAccess(req, leadId);
  if (staff.actor) return { ok: true, actor: staff.actor, kind: 'staff' };
  if (staff.status === 401) return { ok: false, error: staff.error, status: 401 };

  const base = await requireApiActor(req);
  if (base.actor && base.actor.role === 'homeowner') {
    const { data } = await getSupabaseAdmin().from('user_profiles').select('lead_id').eq('id', base.actor.user.id).maybeSingle();
    if (data?.lead_id && String(data.lead_id) === leadId) return { ok: true, actor: base.actor, kind: 'homeowner' };
  }
  return { ok: false, error: 'Forbidden', status: 403 };
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
