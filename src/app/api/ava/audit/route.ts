import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { avaEnabled } from '@/lib/ava/defaults';

export const dynamic = 'force-dynamic';

/** GET /api/ava/audit?limit=100&actor=<user id>  ->  the latest AVA audit events. Admins only. */
export async function GET(req: NextRequest) {
  if (!avaEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));
  const actorId = req.nextUrl.searchParams.get('actor');
  let q = getSupabaseAdmin().from('ava_audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (actorId && /^[A-Za-z0-9_-]{1,64}$/.test(actorId)) q = q.eq('actor_id', actorId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'The audit log could not be loaded.' }, { status: 500 });
  return NextResponse.json({ events: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
