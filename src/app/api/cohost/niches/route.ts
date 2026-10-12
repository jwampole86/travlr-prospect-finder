import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** GET /api/cohost/niches?state=CO&market=Aspen,%20CO  (admin). How many candidate listings carry each niche, optionally within one state or market. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const u = new URL(req.url); const state = u.searchParams.get('state'); const market = u.searchParams.get('market');
  const { data, error } = await getSupabaseAdmin().rpc('cohost_niche_counts', { p_state: state && state !== 'all' ? state : null, p_market: market && market !== 'all' ? market : null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const counts: Record<number, { listings: number; elite: number }> = {};
  for (const r of (data ?? []) as Array<{ niche: number; listings: number; elite: number }>) counts[r.niche] = { listings: Number(r.listings), elite: Number(r.elite) };
  return NextResponse.json({ counts });
}
