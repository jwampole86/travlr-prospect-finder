import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runFsboSkipTrace, UNDISCLOSED_ADDRESS_PREFIX } from '@/lib/services/fsboSkipTraceService';
import { skipTracePace } from '@/lib/services/skipTraceQuota';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';

/** A lead with no resident found is looked at again after this long, in case the listing or the public records changed. */
const RECHECK_NO_MATCH_DAYS = 45;

export const maxDuration = 300;

/**
 * GET /api/cron/fsbo-skip-trace
 * Drains the skip-trace queue that csv-import fills for new owner-listed leads.
 *
 * Query params:
 *   limit          leads to process this run (default 15, max 50)
 *   leadId         run one specific lead regardless of its queue status
 *   enqueueBacklog number of existing eligible FSBO leads to queue (default 0). Opt-in
 *                  because each lead costs up to 4 Skip Tracing API calls.
 *   enqueueLuxury  number of existing luxury leads (any source) to queue: standalone homes with a real address
 *                  and no contact yet, regardless of agent attribution. Luxury leads are always traced first.
 *   enqueueListings number of existing Trulia/Zillow/PadMapper/HotPads/Craigslist leads to queue
 *                  (default 0): standalone homes with a real address and no contact yet. Owner-listed
 *                  and unattributed rentals go first, then for-sale homes (the resident is usually the
 *                  owner); agent-managed rentals are skipped because the resident would be a tenant.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit')) || 15;
  const leadId = searchParams.get('leadId') || undefined;
  const db = getSupabaseAdmin();

  // The monthly allowance is spread over the days until it resets, so a large queue cannot use it all up and block new leads. 600 calls are held for the co-host queue.
  const paced = leadId ? 1 : await skipTracePace(process.env.RAPIDAPI_KEY_1, Math.min(50, limit), { held: 600 });
  if (paced === 0) return NextResponse.json({ ok: true, paused: 'skip-trace allowance is at its reserve' });
  // Unless told otherwise, keep a few runs of work queued: luxury homes first, then owner-listed and for-sale listings.
  let feed = 0;
  if (!leadId && searchParams.get('autoFeed') !== '0') {
    const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('skip_trace_status', 'PENDING');
    if ((count ?? 0) < paced * 3) feed = paced * 6;
  }
  const enqueueBacklog = Math.min(500, Math.max(0, Number(searchParams.get('enqueueBacklog')) || 0));
  const enqueueListings = Math.min(500, Math.max(feed, Number(searchParams.get('enqueueListings')) || 0));
  const enqueueLuxury = Math.min(500, Math.max(feed, Number(searchParams.get('enqueueLuxury')) || 0));

  let enqueued = 0;
  if (enqueueBacklog > 0) {
    const { data: backlog } = await db.from('leads').select('id')
      .eq('is_fsbo', true)
      .or('is_apartment_community.is.null,is_apartment_community.eq.false')
      .is('contact_name', null)
      .is('skip_trace_status', null)
      .not('address', 'ilike', `${UNDISCLOSED_ADDRESS_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(enqueueBacklog);
    const ids = (backlog || []).map(l => l.id as string);
    if (ids.length > 0) {
      await db.from('leads').update({ skip_trace_status: 'PENDING' }).in('id', ids);
      enqueued = ids.length;
    }
  }

  let enqueuedListings = 0;
  if (enqueueListings > 0) {
    const base = () => db.from('leads').select('id')
      .eq('is_synthetic', false)
      .in('source', ['Trulia', 'Zillow', 'PadMapper', 'HotPads', 'Craigslist'])
      .or('is_apartment_community.is.null,is_apartment_community.eq.false')
      .is('contact_name', null)
      .is('skip_trace_status', null)
      .not('zip', 'is', null)
      .not('address', 'ilike', `${UNDISCLOSED_ADDRESS_PREFIX}%`)
      .not('address', 'like', '%#%')
      .order('prospect_score', { ascending: false });
    // Priority: rentals with no agent or broker (likely the owner), then for-sale homes.
    const { data: rentals } = await base().eq('price_type', 'rent').is('listing_agent_name', null).is('listing_broker_name', null).limit(enqueueListings);
    const remaining = enqueueListings - (rentals?.length ?? 0);
    const { data: sales } = remaining > 0 ? await base().eq('price_type', 'sale').limit(remaining) : { data: [] };
    const ids = [...(rentals || []), ...(sales || [])].map(l => l.id as string);
    if (ids.length > 0) {
      await db.from('leads').update({ skip_trace_status: 'PENDING' }).in('id', ids);
      enqueuedListings = ids.length;
    }
  }

  let enqueuedLuxury = 0;
  if (enqueueLuxury > 0) {
    const { data: luxury } = await db.from('leads').select('id')
      .eq('is_synthetic', false)
      .eq('luxury', true)
      .or('is_apartment_community.is.null,is_apartment_community.eq.false')
      .is('contact_name', null)
      .is('skip_trace_status', null)
      .not('zip', 'is', null)
      .not('address', 'ilike', `${UNDISCLOSED_ADDRESS_PREFIX}%`)
      .not('address', 'like', '%#%')
      .order('prospect_score', { ascending: false })
      .limit(enqueueLuxury);
    const ids = (luxury || []).map(l => l.id as string);
    if (ids.length > 0) {
      await db.from('leads').update({ skip_trace_status: 'PENDING' }).in('id', ids);
      enqueuedLuxury = ids.length;
    }
  }

  // When there is no new lead left to queue, spend the spare allowance re-checking addresses that found nobody a while ago.
  let requeuedNoMatch = 0;
  if (!leadId && feed > 0 && enqueuedListings + enqueuedLuxury + enqueued === 0) {
    const cutoff = new Date(Date.now() - RECHECK_NO_MATCH_DAYS * 86_400_000).toISOString();
    const { data: stale } = await db.from('leads').select('id')
      .eq('skip_trace_status', 'NO_MATCH')
      .filter('skip_trace_result->>reason', 'eq', 'no_resident_at_address')
      .is('contact_name', null)
      .lt('skip_traced_at', cutoff)
      .order('skip_traced_at', { ascending: true })
      .limit(paced * 3);
    const ids = (stale || []).map(l => l.id as string);
    if (ids.length > 0) {
      await db.from('leads').update({ skip_trace_status: 'PENDING' }).in('id', ids);
      requeuedNoMatch = ids.length;
    }
  }

  const run = await startCronRun('fsbo-skip-trace', { paced, leadId: leadId ?? null });
  try {
    const summary = await runFsboSkipTrace(db, { limit: leadId ? limit : paced, leadId, deadlineMs: 240_000 });
    await finishCronRun(run, {
      status: summary.stoppedEarly === 'RATE_LIMITED' ? 'partial' : 'success',
      leadsScanned: summary.claimed,
      errorCount: summary.errors,
      errors: summary.stopReason ? [summary.stopReason] : [],
      metadata: { paced, enqueued, enqueuedListings, enqueuedLuxury, requeuedNoMatch, ...summary },
    });
    return NextResponse.json({ ok: true, paced, enqueued, enqueuedListings, enqueuedLuxury, requeuedNoMatch, ...summary });
  } catch (e) {
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [(e as Error).message] });
    throw e;
  }
}
