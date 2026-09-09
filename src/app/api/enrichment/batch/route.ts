import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/enrichment/batch
 * Create and queue a bulk enrichment batch job.
 * Scope options: SELECTED_LEADS | HIGH_PRIORITY_MISSING_PHONE | MISSING_OWNER |
 *   MISSING_PHONE | MISSING_OWNER_AND_PHONE | VERIFIED_ADDRESS_MISSING_PHONE |
 *   ENTIRE_PORTFOLIO | ALL_ELIGIBLE
 *
 * CRITICAL: Never enriches synthetic, DNC, quarantined, or terminal records.
 * Priority order: High Priority → Verified Address → Missing Phone → Score DESC
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      scope = 'HIGH_PRIORITY_MISSING_PHONE',
      leadIds,
      portfolioId,
      batchSize = 50,
      concurrencyLimit = 5,
      batchName,
    } = body;

    // Check monthly budget guard
    const { data: budgetSetting } = await supabase
      .from('enrichment_settings')
      .select('setting_value')
      .eq('setting_key', 'monthly_budget_cents')
      .single();

    const monthlyBudgetCents = parseInt(budgetSetting?.setting_value || '50000');

    if (monthlyBudgetCents > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: costData } = await supabase
        .from('enrichment_cost_records')
        .select('estimated_cost_cents')
        .gte('created_at', monthStart.toISOString());

      const spentCents = (costData || []).reduce((sum, r) => sum + (r.estimated_cost_cents || 0), 0);
      const warnPct = 80;
      const spentPct = monthlyBudgetCents > 0 ? (spentCents / monthlyBudgetCents) * 100 : 0;

      if (spentPct >= 100) {
        return NextResponse.json({
          error: 'ENRICHMENT_BUDGET_EXCEEDED',
          message: `Monthly enrichment budget of $${(monthlyBudgetCents / 100).toFixed(2)} has been reached. Automatic bulk enrichment is paused. Manual Admin requests require explicit confirmation.`,
          spentCents,
          budgetCents: monthlyBudgetCents,
        }, { status: 402 });
      }
    }

    // Build lead query based on scope
    let query = supabase
      .from('leads')
      .select('id, address, city, state, zip, apn, contact_phone, contact_name, prospect_score, verified_address, verified_owner, verified_number, is_synthetic, do_not_contact, lead_stage, property_reach_match_status')
      .eq('is_synthetic', false)
      .neq('do_not_contact', true)
      .not('lead_stage', 'in', '("EXCLUDED","TERMINAL","INVALID","DUPLICATE")')
      .not('address', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('zip', 'is', null);

    if (leadIds?.length) {
      query = query.in('id', leadIds);
    } else {
      switch (scope) {
        case 'HIGH_PRIORITY_MISSING_PHONE':
          query = query.gte('prospect_score', 70).is('contact_phone', null);
          break;
        case 'MISSING_PHONE':
          query = query.is('contact_phone', null);
          break;
        case 'MISSING_OWNER':
          query = query.is('contact_name', null);
          break;
        case 'MISSING_OWNER_AND_PHONE':
          query = query.is('contact_phone', null).is('contact_name', null);
          break;
        case 'VERIFIED_ADDRESS_MISSING_PHONE':
          query = query.eq('verified_address', true).is('contact_phone', null);
          break;
        case 'ALL_ELIGIBLE':
          // All non-synthetic, non-DNC, non-terminal
          break;
        case 'ENTIRE_PORTFOLIO':
          if (portfolioId) query = query.eq('portfolio_id', portfolioId);
          break;
      }
    }

    if (portfolioId && scope !== 'ENTIRE_PORTFOLIO') {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data: leads, error: leadsError } = await query.limit(5000);
    if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });
    if (!leads?.length) return NextResponse.json({ queued: 0, message: 'No eligible leads found for this scope' });

    // Priority sort: High Priority → Verified Address → Missing Phone → Score DESC
    const sorted = [...leads].sort((a, b) => {
      const aHighPriority = (a.prospect_score || 0) >= 70 ? 1 : 0;
      const bHighPriority = (b.prospect_score || 0) >= 70 ? 1 : 0;
      if (bHighPriority !== aHighPriority) return bHighPriority - aHighPriority;

      const aVerifiedAddr = a.verified_address ? 1 : 0;
      const bVerifiedAddr = b.verified_address ? 1 : 0;
      if (bVerifiedAddr !== aVerifiedAddr) return bVerifiedAddr - aVerifiedAddr;

      const aMissingPhone = !a.contact_phone ? 1 : 0;
      const bMissingPhone = !b.contact_phone ? 1 : 0;
      if (bMissingPhone !== aMissingPhone) return bMissingPhone - aMissingPhone;

      return (b.prospect_score || 0) - (a.prospect_score || 0);
    });

    // Create batch job
    const { data: batchJob, error: batchError } = await supabase
      .from('enrichment_batch_jobs')
      .insert({
        batch_name: batchName || `${scope} — ${new Date().toLocaleDateString()}`,
        scope,
        status: 'QUEUED',
        total_leads: sorted.length,
        batch_size: batchSize,
        concurrency_limit: concurrencyLimit,
        created_by: user.id,
        filter_portfolio_id: portfolioId || null,
        filter_lead_ids: leadIds || null,
      })
      .select()
      .single();

    if (batchError || !batchJob) {
      return NextResponse.json({ error: 'Failed to create batch job' }, { status: 500 });
    }

    // Create queue items for each eligible lead
    const queueItems = sorted.map((lead, idx) => ({
      batch_job_id: batchJob.id,
      lead_id: lead.id,
      status: 'QUEUED',
      priority: (lead.prospect_score || 0) >= 70 ? 1 : 5,
      provider: 'PROPERTYREACH',
    }));

    // Insert in chunks to avoid payload limits
    const chunkSize = 500;
    let totalQueued = 0;
    for (let i = 0; i < queueItems.length; i += chunkSize) {
      const chunk = queueItems.slice(i, i + chunkSize);
      const { error: insertErr } = await supabase.from('enrichment_queue_items').insert(chunk);
      if (!insertErr) totalQueued += chunk.length;
    }

    return NextResponse.json({
      batchJobId: batchJob.id,
      queued: totalQueued,
      total: sorted.length,
      scope,
      message: `Batch job created with ${totalQueued} leads queued`,
    });
  } catch (err) {
    console.error('[Batch Enrich] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/enrichment/batch
 * Returns batch job list with progress.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const batchJobId = searchParams.get('batchJobId');

    if (batchJobId) {
      const [batchRes, itemsRes] = await Promise.all([
        supabase.from('enrichment_batch_jobs').select('*').eq('id', batchJobId).single(),
        supabase.from('enrichment_queue_items').select('status, result_type, cost_cents, duration_ms, error_code').eq('batch_job_id', batchJobId),
      ]);

      return NextResponse.json({
        batch: batchRes.data,
        items: itemsRes.data || [],
      });
    }

    const { data: batches } = await supabase
      .from('enrichment_batch_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ batches: batches || [] });
  } catch (err) {
    console.error('[Batch Enrich] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/enrichment/batch
 * Pause, resume, or cancel a batch job.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { batchJobId, action } = body;

    if (!batchJobId || !action) {
      return NextResponse.json({ error: 'batchJobId and action required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    let update: Record<string, unknown> = {};

    if (action === 'PAUSE') {
      update = { status: 'PAUSED', paused_at: now, updated_at: now };
    } else if (action === 'RESUME') {
      update = { status: 'RUNNING', resumed_at: now, updated_at: now };
    } else if (action === 'CANCEL') {
      update = { status: 'CANCELLED', cancelled_at: now, updated_at: now };
      // Cancel remaining QUEUED items — do NOT roll back completed ones
      await supabase
        .from('enrichment_queue_items')
        .update({ status: 'FAILED', error_code: 'BATCH_CANCELLED', updated_at: now })
        .eq('batch_job_id', batchJobId)
        .eq('status', 'QUEUED');
    } else if (action === 'RETRY_FAILED') {
      // Only retry failed items, not successful ones
      await supabase
        .from('enrichment_queue_items')
        .update({ status: 'QUEUED', error_code: null, error_message: null, retry_count: 0, updated_at: now })
        .eq('batch_job_id', batchJobId)
        .in('status', ['FAILED', 'PROVIDER_ERROR']);
      update = { status: 'RUNNING', updated_at: now };
    } else {
      return NextResponse.json({ error: 'Invalid action. Use PAUSE, RESUME, CANCEL, or RETRY_FAILED' }, { status: 400 });
    }

    const { error } = await supabase
      .from('enrichment_batch_jobs')
      .update(update)
      .eq('id', batchJobId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, action, batchJobId });
  } catch (err) {
    console.error('[Batch Enrich] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
