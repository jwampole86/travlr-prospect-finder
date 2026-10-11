import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyLuxury, loadBenchmarks } from '@/lib/services/luxuryClassifier';
import { isSkipTraceEligible } from '@/lib/services/fsboSkipTraceService';

export const maxDuration = 300;
const PAGE = 1000;

/**
 * GET /api/cron/luxury-reclassify
 * Re-checks every lead that has a price against its ZIP/state market benchmark and flags
 * newly qualifying leads as luxury. Upgrade-only: an existing luxury flag is never removed.
 *
 * Query params:
 *   dryRun=true  report what would change (counts by state plus a sample) without writing
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  let evaluated = 0, alreadyLuxury = 0, newlyLuxury = 0, noBenchmark = 0;
  const byState: Record<string, { rent: number; sale: number }> = {};
  const sample: Array<Record<string, unknown>> = [];

  for (let from = 0; ; from += PAGE) {
    const { data: leads, error } = await db.from('leads')
      .select('id,address,city,state,zip,price,price_type,luxury,is_synthetic,contact_name,is_apartment_community,skip_trace_status')
      .gt('price', 0)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message, evaluated }, { status: 500 });
    if (!leads || leads.length === 0) break;

    const benchmarks = await loadBenchmarks(db, leads.map(l => l.zip as string), leads.map(l => l.state as string));
    for (const lead of leads) {
      if (lead.is_synthetic) continue;
      evaluated++;
      if (lead.luxury) { alreadyLuxury++; continue; }
      const priceType = lead.price_type === 'sale' ? 'sale' : 'rent';
      const result = classifyLuxury({ state: lead.state, zip: lead.zip, priceType, price: Number(lead.price), benchmarks });
      if (result.basis === null) { noBenchmark++; continue; }
      if (!result.luxury) continue;

      newlyLuxury++;
      const st = String(lead.state || '??').toUpperCase();
      byState[st] ??= { rent: 0, sale: 0 };
      byState[st][priceType === 'sale' ? 'sale' : 'rent']++;
      if (sample.filter(s => s.priceType === priceType).length < 15) {
        sample.push({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip, priceType, price: lead.price, threshold: result.threshold, basis: result.basis });
      }
      if (!dryRun) {
        await db.from('leads').update({
          luxury: true,
          luxury_source_field: 'MARKET_BENCHMARK',
          luxury_threshold_used: result.threshold,
          luxury_basis: result.basis,
          luxury_classified_at: now,
          ...(!lead.skip_trace_status && isSkipTraceEligible({
            luxury: true, isApartmentCommunity: lead.is_apartment_community, address: lead.address, contactName: lead.contact_name,
          }) ? { skip_trace_status: 'PENDING' } : {}),
        }).eq('id', lead.id);
      }
    }
    if (leads.length < PAGE) break;
  }

  return NextResponse.json({ ok: true, dryRun, evaluated, alreadyLuxury, newlyLuxury, noBenchmark, byState, sample });
}
