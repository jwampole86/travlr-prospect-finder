import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { executiveOverview } from '@/lib/services/executiveOverview';

export const maxDuration = 60;

/** GET /api/executive/overview?days=30&state=CO&fresh=1  (admin only). Company-wide numbers for the Executive Overview page. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const q = req.nextUrl.searchParams;
  const days = [0, 1, 7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const state = /^[A-Za-z]{2}$/.test(q.get('state') ?? '') ? q.get('state')!.toUpperCase() : null;
  try {
    return NextResponse.json(await executiveOverview(getSupabaseAdmin(), { days, state }, { fresh: q.get('fresh') === '1' }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('executive overview failed', e);
    return NextResponse.json({ error: 'Could not load the overview. Try again in a moment.' }, { status: 500 });
  }
}
