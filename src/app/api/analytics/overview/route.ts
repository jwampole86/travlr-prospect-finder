import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildAnalytics } from '@/lib/services/analyticsOverview';

/** GET /api/analytics/overview?days=30  Company-wide outreach, pipeline and results numbers for a window. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requested = Number(req.nextUrl.searchParams.get('days'));
  const days = [7, 14, 30, 60, 90].includes(requested) ? requested : 30;
  try {
    return NextResponse.json(await buildAnalytics(getSupabaseAdmin(), days));
  } catch {
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
