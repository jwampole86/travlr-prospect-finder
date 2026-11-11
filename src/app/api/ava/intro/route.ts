import { avaDeps } from '@/lib/ava/defaults';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { STAFF_ROLES } from '@/lib/ava/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ava/intro: claims AVA's one-time introduction for the signed-in person. Answers { first: true } to exactly one caller
 * (the update only succeeds while ava_introduced_at is empty), so a second browser or device never sees the hello again.
 */
export async function POST(req: Request) {
  const deps = avaDeps();
  if (!deps.enabled()) return Response.json({ error: 'not_found' }, { status: 404 });
  const actor = await deps.getActor(req);
  if (!actor) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (!STAFF_ROLES.has(actor.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await getSupabaseAdmin().from('user_profiles')
    .update({ ava_introduced_at: new Date().toISOString() }).eq('id', actor.id).is('ava_introduced_at', null).select('id');
  // If the column cannot be written, say not-first: better no hello than a hello on every sign-in.
  return Response.json({ first: !error && Array.isArray(data) && data.length === 1 }, { headers: { 'cache-control': 'no-store' } });
}
