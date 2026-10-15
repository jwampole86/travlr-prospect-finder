import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getLeadSourceOverview } from '@/lib/services/leadSourceOverview';

export const maxDuration = 60;

/** GET /api/lead-sources/overview[?fresh=1]  Each source with its market configs, sync schedule, coverage and measured lead quality. */
export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const overview = await getLeadSourceOverview(getSupabaseAdmin(), { fresh: req.nextUrl.searchParams.get('fresh') === '1' });
    return NextResponse.json({ ...overview, canManage: auth.actor.isAdmin });
  } catch (e) {
    console.error('[lead-sources/overview]', e);
    return NextResponse.json({ error: 'Could not load lead sources. Try again in a moment.' }, { status: 500 });
  }
}
