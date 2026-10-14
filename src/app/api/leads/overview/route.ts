import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** GET /api/leads/overview?stateCode=CO  ->  headline lead numbers and campaign-stage counts (agents see only their own leads). */
export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.actor.isAdmin && auth.actor.role !== 'agent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const state = req.nextUrl.searchParams.get('stateCode') ?? '';
  const { data, error } = await getSupabaseAdmin().rpc('lead_overview', { p_state: /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null, p_agent: auth.actor.isAdmin ? null : auth.actor.user.id });
  if (error) return NextResponse.json({ error: 'The overview could not be loaded.' }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
