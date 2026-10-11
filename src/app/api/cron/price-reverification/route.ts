import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const CHUNK_SIZE = 20; // Zillow Detail Scraper's per-request limit

/**
 * GET /api/cron/price-reverification
 * Re-verifies price/price_type/listing attribution for already-synced leads
 * that have a live Zillow listing_url, by replaying them through the same
 * zillow-detail → rapidapi-import → csv-import pipeline used for new syncs.
 * This is how pre-existing leads get the price_type/FSBO/attribution fixes
 * applied retroactively, instead of only new imports benefiting.
 *
 * Query params:
 *   batchSize  — max leads to process this run (default 200, capped at 1000)
 *   staleDays  — only re-verify leads last verified more than this many days
 *                ago, or never verified (default 0 = always eligible)
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(1000, Math.max(1, Number(searchParams.get('batchSize')) || 200));
  const staleDays = Math.max(0, Number(searchParams.get('staleDays')) || 0);

  const db = getSupabaseAdmin();
  let query = db.from('leads')
    .select('id, listing_url')
    .ilike('listing_url', '%zillow.com%')
    .order('price_verified_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (staleDays > 0) {
    const cutoff = new Date(Date.now() - staleDays * 86400000).toISOString();
    query = query.or(`price_verified_at.is.null,price_verified_at.lt.${cutoff}`);
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No leads need re-verification' });
  }

  const urls = [...new Set(leads.map(l => l.listing_url as string).filter(Boolean))];
  const origin = request.nextUrl.origin;
  const totals: Record<string, number> = {};
  const errors: string[] = [];

  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(`${origin}/api/leads/rapidapi-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'zillow-detail', urls: chunk }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push(data?.error || `HTTP ${res.status} on chunk starting at ${i}`);
        continue;
      }
      for (const [key, value] of Object.entries(data?.totals || {})) {
        if (typeof value === 'number') totals[key] = (totals[key] || 0) + value;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Chunk request failed');
    }
  }

  return NextResponse.json({
    ok: true,
    leadsConsidered: leads.length,
    urlsProcessed: urls.length,
    totals,
    errors,
    hasMore: leads.length >= batchSize,
  });
}
