import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** Property operations are staff tools: admins only. Returns either the actor and a service-role client, or the error response. */
export async function adminContext(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) } as const;
  return { actor: auth.actor, db: getSupabaseAdmin() } as const;
}

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
