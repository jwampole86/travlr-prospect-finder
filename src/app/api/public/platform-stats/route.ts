import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const revalidate = 3600;

/** Rounds down to two significant figures so a public number is never overstated (9,046 becomes 9,000). */
const floorRound = (n: number) => {
  if (n < 100) return n;
  const step = 10 ** (String(Math.floor(n)).length - 2);
  return Math.floor(n / step) * step;
};

// GET /api/public/platform-stats — production counts for the marketing pages. Counts only, no records.
export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const real = () => db.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false);
    const [leads, phones, listings, stateRows] = await Promise.all([
      real(),
      real().eq('has_phone', true),
      db.from('str_listings').select('property_id', { count: 'exact', head: true }),
      db.from('leads').select('state').eq('is_synthetic', false).not('state', 'is', null).range(0, 19_999),
    ]);
    const states = new Set((stateRows.data ?? []).map((r) => String(r.state).toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))).size;

    return NextResponse.json(
      { leads: floorRound(leads.count ?? 0), phones: floorRound(phones.count ?? 0), listings: floorRound(listings.count ?? 0), states },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
