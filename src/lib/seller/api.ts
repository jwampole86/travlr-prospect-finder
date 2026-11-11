import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor, type ApiActor } from '@/lib/auth/apiAuthorization';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** Seller pipeline endpoints are admin-only (or the NAVEO integration key on an allowlist) and always scoped to one organization. */
export async function sellerContext(req: NextRequest) {
  const naveo = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (naveo) {
    // The integration acts as one dedicated user in one organization; see naveoAccess.ts for the routes it may reach.
    const actor = { user: { id: naveo.userId, email: null, user_metadata: { full_name: 'NAVEO Homes' } }, role: 'integration', isAdmin: true, organizationId: naveo.organizationId } as unknown as ApiActor;
    return { actor, db: getSupabaseAdmin(), orgId: naveo.organizationId } as const;
  }
  const auth = await requireAdminActor(req);
  if (!auth.actor) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) } as const;
  return { actor: auth.actor, db: getSupabaseAdmin(), orgId: auth.actor.organizationId } as const;
}

export function pick(body: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) out[key] = body[key] === '' ? null : body[key];
  return out;
}

export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error: message, ...extra }, { status });
