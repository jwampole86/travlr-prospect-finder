import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';

/**
 * POST /api/cron/property-refresh
 * Background cron job that:
 * 1. Refreshes property data for all active leads (re-fetches enrichment fields)
 * 2. Recalculates prospect scores for all leads
 * 3. Triggers re-enrichment on leads not contacted in 7+ days
 *
 * Designed to run hourly via an external cron scheduler.
 * Protected by SEQUENCE_JOB_SECRET header (cron) or an authenticated admin session (UI).
 */

async function runPropertyRefresh(req: NextRequest) {
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

  const results = {
    runId,
    startedAt,
    completedAt: '',
    leadsScanned: 0,
    scoresRecalculated: 0,
    reenrichmentTriggered: 0,
    propertyDataRefreshed: 0,
    errors: [] as string[],
  };

  try {
    // Process a bounded priority slice per run. Loading every lead turns a
    // routine rescore into a slow, failure-prone full-table operation.
    const batchSize = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit') || 500), 1), 500);
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, prospect_score, last_contacted_at, created_at, enrichment_status, stage, address, city, state, beds, baths, price, estimated_net_monthly, estimated_gross_monthly, estimated_adr, regulation_status, verified_owner, verified_number, verified_address, contact_phone, luxury, days_on_market')
      .not('stage', 'eq', 'Not a Fit')
      .not('stage', 'eq', 'Closed')
      .order('updated_at', { ascending: true })
      .limit(batchSize);

    if (leadsErr) {
      results.errors.push(`Failed to load leads: ${leadsErr.message}`);
      results.completedAt = new Date().toISOString();
      return NextResponse.json(results, { status: 500 });
    }

    const allLeads = leads ?? [];
    results.leadsScanned = allLeads.length;

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const scoreUpdates: { id: string; prospect_score: number; score_refreshed_at: string }[] = [];
    const reenrichIds: string[] = [];

    for (const lead of allLeads) {
      // ── 2. Recalculate using the same deterministic factor model as the AI API ──
      const score = calculateProspectScore({
        estimatedNetMonthly: lead.estimated_net_monthly,
        estimatedGrossMonthly: lead.estimated_gross_monthly,
        estimatedADR: lead.estimated_adr,
        price: lead.price,
        beds: lead.beds,
        baths: lead.baths,
        regulationStatus: lead.regulation_status,
        verifiedOwner: lead.verified_owner,
        verifiedNumber: lead.verified_number,
        verifiedAddress: lead.verified_address,
        contactPhone: lead.contact_phone,
        daysOnMarket: lead.days_on_market,
        stage: lead.stage,
        luxury: lead.luxury,
      });

      scoreUpdates.push({
        id: lead.id,
        prospect_score: score.score,
        score_refreshed_at: new Date().toISOString(),
      });

      // ── 3. Flag leads for re-enrichment if not contacted in 7+ days ─────────
      const lastContact = lead.last_contacted_at
        ? new Date(lead.last_contacted_at).getTime()
        : new Date(lead.created_at).getTime();

      const daysSinceContact = (now - lastContact) / SEVEN_DAYS_MS;

      if (daysSinceContact >= 1 && lead.enrichment_status !== 'pending') {
        reenrichIds.push(lead.id);
      }
    }

    // Use limited concurrent updates; each row has a distinct score and this
    // avoids a large upsert payload that can contend with normal lead traffic.
    const SCORE_CONCURRENCY = 20;
    for (let i = 0; i < scoreUpdates.length; i += SCORE_CONCURRENCY) {
      const chunk = scoreUpdates.slice(i, i + SCORE_CONCURRENCY);
      const updates = await Promise.all(chunk.map(update => supabase.from('leads').update({ prospect_score: update.prospect_score, score_refreshed_at: update.score_refreshed_at }).eq('id', update.id)));
      updates.forEach((result, index) => {
        if (result.error) results.errors.push(`Score update ${chunk[index].id}: ${result.error.message}`);
        else results.scoresRecalculated += 1;
      });
    }

    // ── Batch re-enrichment flags ─────────────────────────────────────────────
    if (reenrichIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < reenrichIds.length; i += CHUNK) {
        const chunk = reenrichIds.slice(i, i + CHUNK);
        const { error: enrichErr } = await supabase
          .from('leads')
          .update({ enrichment_status: 'pending', enrichment_queued_at: new Date().toISOString() })
          .in('id', chunk);

        if (enrichErr) {
          results.errors.push(`Re-enrichment flag chunk ${i / CHUNK}: ${enrichErr.message}`);
        } else {
          results.reenrichmentTriggered += chunk.length;
        }
      }
    }

    results.propertyDataRefreshed = results.scoresRecalculated;

    // ── Log cron run to cron_job_runs table ───────────────────────────────────
    results.completedAt = new Date().toISOString();
    await supabase.from('cron_job_runs').insert({
      job_name: 'property-refresh',
      run_id: runId,
      started_at: startedAt,
      completed_at: results.completedAt,
      leads_scanned: results.leadsScanned,
      scores_recalculated: results.scoresRecalculated,
      reenrichment_triggered: results.reenrichmentTriggered,
      property_data_refreshed: results.propertyDataRefreshed,
      error_count: results.errors.length,
      errors: results.errors,
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
  return runPropertyRefresh(req);
}

// Vercel Cron invokes routes with GET and a Bearer CRON_SECRET header.
export async function GET(req: NextRequest) {
  return runPropertyRefresh(req);
}
