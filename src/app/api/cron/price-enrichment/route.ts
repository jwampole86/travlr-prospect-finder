import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getRentEstimate, RentEstimateParams } from '@/lib/services/rentcastService';

/**
 * POST/GET /api/cron/price-enrichment
 * Backfills `leads.price` (monthly rent estimate) for leads that have never
 * been priced, via RentCast's per-address AVM rent-estimate endpoint.
 *
 * Only ~4% of leads have a price today — most were imported as raw address
 * records with no rent enrichment, which silently suppresses the "Luxury
 * Prospects" / "active_leads" / "regulation_friendly" KPIs on the dashboard
 * (all of them require has_price). Each lookup is a real, metered RentCast
 * API call, so this processes a small, priority-ordered batch per run
 * (highest prospect_score / lowest priority_tier first) rather than all
 * ~157k at once — call repeatedly (e.g. via a scheduled cron) to work
 * through the backlog over time.
 */
async function runPriceEnrichment(req: NextRequest) {
  const auth = await verifyJobRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Supabase admin configuration is incomplete' }, { status: 503 });
  }

  const runId = `run_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const batchSize = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit') || 50), 1), 200);

  const results = {
    runId,
    startedAt,
    completedAt: '',
    leadsScanned: 0,
    pricesUpdated: 0,
    noEstimateFound: 0,
    errors: [] as string[],
  };

  try {
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, beds, baths, property_type')
      .is('price', null)
      .eq('is_synthetic', false)
      .not('stage', 'eq', 'Not a Fit')
      .not('address', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .order('prospect_score', { ascending: false, nullsFirst: false })
      .order('priority_tier', { ascending: true, nullsFirst: false })
      .limit(batchSize);

    if (leadsErr) {
      results.errors.push(`Failed to load leads: ${leadsErr.message}`);
      results.completedAt = new Date().toISOString();
      return NextResponse.json(results, { status: 500 });
    }

    const allLeads = leads ?? [];
    results.leadsScanned = allLeads.length;

    // RentCast is a metered, per-request-billed API — process sequentially
    // (not in parallel) so a bad run can't fan out into a burst of paid calls.
    for (const lead of allLeads) {
      const fullAddress = `${lead.address}, ${lead.city}, ${lead.state}${lead.zip ? ` ${lead.zip}` : ''}`;
      const estimate = await getRentEstimate({
        address: fullAddress,
        propertyType: (lead.property_type as RentEstimateParams['propertyType']) || undefined,
        bedrooms: lead.beds ?? undefined,
        bathrooms: lead.baths ?? undefined,
      });

      if (!estimate.ok) {
        if (estimate.error && !/No rent estimate returned/i.test(estimate.error)) {
          results.errors.push(`${lead.id}: ${estimate.error}`);
        } else {
          results.noEstimateFound += 1;
        }
        continue;
      }

      const { error: updateErr } = await supabase
        .from('leads')
        .update({ price: estimate.rent, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      if (updateErr) {
        results.errors.push(`${lead.id}: ${updateErr.message}`);
      } else {
        results.pricesUpdated += 1;
      }
    }

    results.completedAt = new Date().toISOString();
    await supabase.from('cron_job_runs').insert({
      job_name: 'price-enrichment',
      run_id: runId,
      started_at: startedAt,
      completed_at: results.completedAt,
      leads_scanned: results.leadsScanned,
      error_count: results.errors.length,
      errors: results.errors,
      metadata: { pricesUpdated: results.pricesUpdated, noEstimateFound: results.noEstimateFound },
      status: results.errors.length === 0 ? 'success' : 'partial',
    }).then(() => {});

    return NextResponse.json(results);
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : 'Unknown error');
    results.completedAt = new Date().toISOString();
    return NextResponse.json(results, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runPriceEnrichment(req);
}

// Vercel Cron invokes routes with GET and a Bearer CRON_SECRET header.
export async function GET(req: NextRequest) {
  return runPriceEnrichment(req);
}
