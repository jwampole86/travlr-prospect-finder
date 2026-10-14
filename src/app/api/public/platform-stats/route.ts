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
    const [leads, phones, verified, texts, replies, optOuts] = await Promise.all([
      real(),
      real().eq('has_phone', true),
      db.from('dashboard_lead_facts').select('lead_id', { count: 'exact', head: true }).eq('is_synthetic', false).eq('verified_owner', true).eq('verified_address', true).eq('verified_number', true),
      db.from('outreach_history').select('id', { count: 'exact', head: true }).ilike('channel', 'sms%'),
      db.from('sms_thread_messages').select('id', { count: 'exact', head: true }).ilike('direction', 'in%'),
      db.from('sms_suppressions').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json(
      {
        leads: floorRound(leads.count ?? 0),
        phones: floorRound(phones.count ?? 0),
        verified: floorRound(verified.count ?? 0),
        texts: floorRound(texts.count ?? 0),
        replies: replies.count ?? 0,
        optOuts: optOuts.count ?? 0,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
