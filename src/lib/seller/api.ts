import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** Seller pipeline endpoints are admin-only and always scoped to the caller's organization. */
export async function sellerContext(req: NextRequest) {
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
