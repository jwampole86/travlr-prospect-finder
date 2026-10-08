import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BATCH_LIMIT = 10;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 25000;

/**
 * POST /api/enrichment/propertyreach-bulk-retry
 *
 * PropertyReach is a per-lead OWNER/PHONE ENRICHMENT provider, not a lead
 * discovery source (unlike Trulia/Zillow it can't "pull" brand new leads from
 * a region — see propertyReachProvider.ts). The real, honest "sync" action
 * for this source is: find existing leads in a state that are missing
 * verified owner/phone data, and run the EXISTING real single-lead
 * /api/enrichment/propertyreach pipeline on a small batch of them.
 *
 * Body: { state: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const state = body?.state as string;
  if (!state) {
    return NextResponse.json({ error: 'state is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, address, city, state, zip, apn')
    .eq('state', state)
    .or('verified_owner.eq.false,verified_number.eq.false')
    .not('address', 'is', null)
    .neq('address', '')
    .not('zip', 'is', null)
    .order('prospect_score', { ascending: false, nullsFirst: false })
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!leads || leads.length === 0) {
    return NextResponse.json({ attempted: 0, message: `No leads in ${state} are missing verified owner/phone data` });
  }

  const origin = req.nextUrl.origin;
  const jobIds: string[] = [];
  // /api/enrichment/propertyreach uses the cookie/session-based Supabase client
  // (RLS-enforced), unlike the service-role client used elsewhere in this
  // route — forward the caller's cookies or every internal call 500s.
  const cookieHeader = req.headers.get('cookie') || '';

  for (const lead of leads) {
    const res = await fetch(`${origin}/api/enrichment/propertyreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        leadId: lead.id, address: lead.address, city: lead.city, state: lead.state, zip: lead.zip, apn: lead.apn,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.jobId) jobIds.push(data.jobId);
  }

  if (jobIds.length === 0) {
    return NextResponse.json({ error: 'Failed to queue any enrichment jobs' }, { status: 503 });
  }

  // Poll until every queued job reaches a terminal status, or time out.
  const terminal = new Set(['CONTACT_ENRICHED', 'OWNER_RESOLVED', 'REVIEW_REQUIRED', 'NO_MATCH', 'FAILED']);
  const start = Date.now();
  let statuses: Record<string, string> = {};

  while (Date.now() - start < MAX_POLL_MS) {
    const { data: jobs } = await supabase
      .from('propertyreach_enrichment_jobs')
      .select('id, job_status')
      .in('id', jobIds);

    statuses = Object.fromEntries((jobs || []).map((j) => [j.id, j.job_status as string]));
    const allDone = jobIds.every((id) => terminal.has(statuses[id]));
    if (allDone) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const counts = { enriched: 0, reviewRequired: 0, noMatch: 0, failed: 0, stillRunning: 0 };
  for (const id of jobIds) {
    const s = statuses[id];
    if (s === 'CONTACT_ENRICHED' || s === 'OWNER_RESOLVED') counts.enriched++;
    else if (s === 'REVIEW_REQUIRED') counts.reviewRequired++;
    else if (s === 'NO_MATCH') counts.noMatch++;
    else if (s === 'FAILED') counts.failed++;
    else counts.stillRunning++;
  }

  return NextResponse.json({ attempted: jobIds.length, ...counts });
}
