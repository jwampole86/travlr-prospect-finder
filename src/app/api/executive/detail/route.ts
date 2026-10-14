import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { executiveDetail } from '@/lib/services/executiveDetail';

export const maxDuration = 60;

const KINDS = new Set(['kpi', 'funnel', 'days', 'day', 'campaigns', 'campaign', 'states', 'state', 'hot', 'lead', 'queue', 'queueday', 'pipeline', 'cohost']);

/** GET /api/executive/detail?kind=campaign&id=<name>&days=30&state=CO  (admin only). The detail behind one Executive Overview panel. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const q = req.nextUrl.searchParams;
  const kind = q.get('kind') ?? ''; const id = q.get('id') ?? '';
  if (!KINDS.has(kind) || !/^[\w:.\- ]{0,120}$/.test(id)) return NextResponse.json({ error: 'Unknown detail.' }, { status: 400 });
  const days = [0, 1, 7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const state = /^[A-Za-z]{2}$/.test(q.get('state') ?? '') ? q.get('state')!.toUpperCase() : null;
  try {
    return NextResponse.json(await executiveDetail(getSupabaseAdmin(), { kind, id, days, state }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('executive detail failed', e);
    return NextResponse.json({ error: e instanceof Error && /not found/i.test(e.message) ? e.message : 'Could not load these details. Try again in a moment.' }, { status: 500 });
  }
}
