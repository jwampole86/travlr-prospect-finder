import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getZillowPropertyHistory, summarizePriceHistory } from '@/lib/services/rapidApiRealEstateService';

export const maxDuration = 300;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEADLINE_MS = 240_000;

/**
 * GET /api/cron/zillow-history?limit=5
 * Reads the Zillow price/tax history of the best unchecked for-sale leads (best prospects first): the last sale, price cuts since,
 * and the assessed value when the lead has none. One request per lead against the Zillow Real Estate API plan (40,000 a month,
 * shared with the listing sync), so the default of 5 every 10 minutes stays near 22,000.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.reason || 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT));
  const db = getSupabaseAdmin();
  const startedAt = Date.now();
  const run = await startCronRun('zillow-history', { limit });

  try {
    const { data: leads, error } = await db.from('leads')
      .select('id,listing_url,tax_assessment')
      .eq('price_type', 'sale')
      .eq('is_synthetic', false)
      .is('price_history_checked_at', null)
      .like('listing_url', '%zillow.com%_zpid%')
      .order('prospect_score', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    let checked = 0, withSale = 0, withCuts = 0, notFound = 0;
    const errors: string[] = [];
    let stopped: string | undefined;

    for (const lead of leads ?? []) {
      if (Date.now() - startedAt > DEADLINE_MS) { stopped = 'DEADLINE'; break; }
      const zpid = /(\d+)_zpid/.exec(String(lead.listing_url ?? ''))?.[1];
      const now = new Date().toISOString();
      if (!zpid) {
        await db.from('leads').update({ price_history_checked_at: now }).eq('id', lead.id);
        continue;
      }

      const result = await getZillowPropertyHistory(zpid);
      if (!result.ok || !result.history) {
        // A listing Zillow no longer has will never answer, so it is marked checked. Anything else (quota, rate limit, a timeout) is tried again later.
        if (result.status === 404 || result.status === 400) {
          await db.from('leads').update({ price_history_checked_at: now }).eq('id', lead.id);
          notFound++;
          continue;
        }
        errors.push(`${zpid}: ${result.error ?? 'request failed'}`);
        if (result.status === 429 || result.status === 401 || result.status === 403) { stopped = 'RATE_LIMITED'; break; }
        continue;
      }

      const summary = summarizePriceHistory(result.history.priceHistory);
      const update: Record<string, unknown> = {
        price_history: result.history.priceHistory.slice(0, 12),
        last_sold_price: summary.lastSoldPrice,
        last_sold_date: summary.lastSoldDate,
        price_cut_count: summary.priceCuts,
        price_history_checked_at: now,
      };
      if (lead.tax_assessment == null && result.history.taxAssessedValue) update.tax_assessment = result.history.taxAssessedValue;
      const { error: updateError } = await db.from('leads').update(update).eq('id', lead.id);
      if (updateError) { errors.push(`${zpid}: ${updateError.message}`); continue; }
      checked++;
      if (summary.lastSoldPrice) withSale++;
      if (summary.priceCuts > 0) withCuts++;
    }

    await finishCronRun(run, {
      status: stopped === 'RATE_LIMITED' || errors.length > 0 ? 'partial' : 'success',
      leadsScanned: checked,
      errorCount: errors.length,
      errors,
      metadata: { limit, checked, withSale, withCuts, notFound, stopped: stopped ?? null, durationMs: Date.now() - startedAt },
    });
    return NextResponse.json({ ok: true, checked, withSale, withCuts, notFound, stopped: stopped ?? null, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Zillow history job failed';
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [message] });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
