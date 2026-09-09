import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/enrichment/bulk-enrich
 * Queues bulk enrichment jobs for multiple leads.
 * Scope: MISSING_PHONE | MISSING_OWNER | MISSING_OWNER_AND_PHONE | SELECTED_LEADS | HIGH_PRIORITY
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { scope = 'MISSING_OWNER_AND_PHONE', leadIds, portfolioId, limit = 50 } = body;

    let query = supabase.from('leads').select('id, address, city, state, zip, apn, contact_phone, contact_name, is_synthetic, do_not_contact, enrichment_status').limit(limit);

    if (leadIds?.length) {
      query = query.in('id', leadIds);
    } else if (scope === 'MISSING_PHONE') {
      query = query.is('contact_phone', null).eq('is_synthetic', false).neq('do_not_contact', true);
    } else if (scope === 'MISSING_OWNER') {
      query = query.is('contact_name', null).eq('is_synthetic', false).neq('do_not_contact', true);
    } else if (scope === 'HIGH_PRIORITY') {
      query = query.gte('prospect_score', 70).eq('is_synthetic', false).neq('do_not_contact', true);
    } else {
      // MISSING_OWNER_AND_PHONE
      query = query.is('contact_phone', null).is('contact_name', null).eq('is_synthetic', false).neq('do_not_contact', true);
    }

    if (portfolioId) query = query.eq('portfolio_id', portfolioId);

    const { data: leads, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads?.length) return NextResponse.json({ queued: 0, message: 'No eligible leads found' });

    // Prioritize: high priority + missing phone first
    const sorted = [...leads].sort((a, b) => {
      const aScore = (a.prospect_score || 0);
      const bScore = (b.prospect_score || 0);
      return bScore - aScore;
    });

    let queued = 0;
    const errors: string[] = [];

    for (const lead of sorted) {
      if (!lead.address || !lead.city || !lead.state || !lead.zip) continue;

      // Check no existing pending job
      const { data: existing } = await supabase
        .from('enrichment_jobs')
        .select('id')
        .eq('lead_id', lead.id)
        .in('job_status', ['PENDING', 'RUNNING'])
        .single();

      if (existing) continue;

      const { error: insertErr } = await supabase.from('enrichment_jobs').insert({
        lead_id: lead.id,
        canonical_address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
        raw_address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
        normalized_address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
        standardized_address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`.toUpperCase(),
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        apn: lead.apn || null,
        job_status: 'PENDING',
        scope,
        priority: (lead.prospect_score || 0) >= 70 ? 1 : 5,
        created_by: user.id,
      });

      if (insertErr) {
        errors.push(`Lead ${lead.id}: ${insertErr.message}`);
      } else {
        queued++;
      }
    }

    return NextResponse.json({
      queued,
      total: leads.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${queued} enrichment jobs queued`,
    });
  } catch (err) {
    console.error('Bulk enrich error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/enrichment/bulk-enrich
 * Returns bulk enrichment status summary.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: jobs } = await supabase
      .from('enrichment_jobs')
      .select('job_status')
      .order('created_at', { ascending: false })
      .limit(1000);

    const counts = {
      queued: 0, running: 0, found: 0, reviewRequired: 0, noMatch: 0, failed: 0, rateLimited: 0,
    };

    for (const job of jobs || []) {
      if (job.job_status === 'PENDING') counts.queued++;
      else if (job.job_status === 'RUNNING') counts.running++;
      else if (job.job_status === 'FOUND') counts.found++;
      else if (job.job_status === 'REVIEW_REQUIRED') counts.reviewRequired++;
      else if (job.job_status === 'NO_MATCH') counts.noMatch++;
      else if (job.job_status === 'FAILED') counts.failed++;
      else if (job.job_status === 'RATE_LIMITED') counts.rateLimited++;
    }

    return NextResponse.json(counts);
  } catch (err) {
    console.error('Bulk enrich status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
