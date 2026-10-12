import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getRentEstimate } from '@/lib/services/rentcastService';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';

export const maxDuration = 300;

const JOB = 'rent-estimate-enrichment';
const DEFAULT_MONTHLY_BUDGET = 40;
const AVM_MISS = 'LOW_AVM_MISS';

/**
 * GET /api/cron/rent-estimate-enrichment
 * Replaces the market-average rent estimate on for-sale leads with RentCast's per-address rent AVM,
 * highest-scoring leads first. Each lookup is a metered RentCast request, so the number of requests per
 * calendar month is capped (RENTCAST_MONTHLY_BUDGET, default 40) and counted
 * from this job's own run log. Stops immediately on a quota or auth error.
 *
 * Query: limit (1-50, default 10), dryRun=true (list the targets only).
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.RENTCAST_API_KEY) return NextResponse.json({ error: 'RentCast is not configured' }, { status: 503 });

  const q = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(q.get('limit')) || 10));
  const dryRun = q.get('dryRun') === 'true';
  const budget = Number(process.env.RENTCAST_MONTHLY_BUDGET) || DEFAULT_MONTHLY_BUDGET;

  const db = getSupabaseAdmin();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { data: runs } = await db.from('cron_job_runs').select('metadata').eq('job_name', JOB).gte('started_at', monthStart);
  const usedThisMonth = (runs ?? []).reduce((s, r) => s + Number((r.metadata as { requests?: number } | null)?.requests || 0), 0);
  const remaining = Math.max(0, budget - usedThisMonth);
  if (remaining === 0 && !dryRun) {
    return NextResponse.json({ ok: true, processed: 0, budget, usedThisMonth, message: 'Monthly RentCast budget used up' });
  }

  const { data: targets, error } = await db.from('leads')
    .select('id,address,city,state,zip,beds,baths,property_type,prospect_score,price')
    .eq('price_type', 'sale')
    .or('is_synthetic.is.null,is_synthetic.eq.false')
    .or('estimated_monthly_rent_ai_source.is.null,estimated_monthly_rent_ai_source.in.("PRICE_MODEL","PRICE_MODEL+FLOOR",ZORI_BED_ADJUSTED,RENTAL_COMPS_ZIP,RENTAL_COMPS_CITY)')
    .not('estimated_monthly_rent_ai_confidence', 'eq', AVM_MISS)
    .not('address', 'is', null).neq('address', '').not('address', 'ilike', 'Address Not Disclosed%')
    .not('city', 'is', null).not('state', 'is', null)
    .order('prospect_score', { ascending: false }).order('id')
    .limit(dryRun ? limit : Math.min(limit, remaining));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, budget, usedThisMonth, targets });

  const propertyTypes: Record<string, 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Apartment'> = {
    single_family: 'Single Family', 'single family': 'Single Family', house: 'Single Family', condo: 'Condo',
    townhouse: 'Townhouse', townhome: 'Townhouse', multi_family: 'Multi-Family', apartment: 'Apartment',
  };

  const startedAt = new Date().toISOString();
  const updated: string[] = [];
  const results: Array<{ id: string; city: string; before?: number; rent?: number; low?: number; high?: number; note?: string }> = [];
  let requests = 0;
  let stopped: string | null = null;

  for (const lead of targets ?? []) {
    const fullAddress = `${lead.address}, ${lead.city}, ${lead.state}${lead.zip ? ` ${lead.zip}` : ''}`;
    requests++;
    const est = await getRentEstimate({
      address: fullAddress,
      propertyType: propertyTypes[String(lead.property_type || '').toLowerCase()],
      bedrooms: lead.beds ?? undefined,
      bathrooms: lead.baths ?? undefined,
    });

    if (!est.ok) {
      if (est.status === 401 || est.status === 403 || est.status === 429 || /limit|quota|subscription/i.test(est.error || '')) {
        stopped = `RentCast stopped the run: ${est.error || est.status}`;
        break;
      }
      await db.from('leads').update({ estimated_monthly_rent_ai_confidence: AVM_MISS }).eq('id', lead.id);
      results.push({ id: String(lead.id), city: String(lead.city), note: est.error || 'No estimate' });
      continue;
    }

    const rent = Math.round(est.rent as number);
    const spread = est.rentRangeLow && est.rentRangeHigh ? (est.rentRangeHigh - est.rentRangeLow) / rent : null;
    const { error: upErr } = await db.from('leads').update({
      estimated_monthly_rent_ai: rent,
      estimated_monthly_rent_ai_source: 'RENTCAST_AVM',
      estimated_monthly_rent_ai_confidence: spread !== null && spread <= 0.4 ? 'HIGH' : 'MEDIUM',
      estimated_monthly_rent_ai_at: new Date().toISOString(),
    }).eq('id', lead.id);
    if (upErr) { results.push({ id: String(lead.id), city: String(lead.city), note: upErr.message }); continue; }
    updated.push(String(lead.id));
    results.push({ id: String(lead.id), city: String(lead.city), rent, low: est.rentRangeLow, high: est.rentRangeHigh });
  }

  const rescored = await rescoreLeadsByIds(db, updated);
  await db.from('cron_job_runs').insert({
    job_name: JOB, run_id: `run_${Date.now()}`, started_at: startedAt, completed_at: new Date().toISOString(),
    leads_scanned: results.length, error_count: stopped ? 1 : 0, errors: stopped ? [stopped] : [],
    metadata: { requests, updated: updated.length }, status: stopped ? 'partial' : 'success',
  });

  return NextResponse.json({
    ok: !stopped, warning: stopped, requests, updated: updated.length, rescored,
    budget, usedThisMonth: usedThisMonth + requests, results,
  });
}
