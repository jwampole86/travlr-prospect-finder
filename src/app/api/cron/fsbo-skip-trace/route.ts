import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runFsboSkipTrace, UNDISCLOSED_ADDRESS_PREFIX } from '@/lib/services/fsboSkipTraceService';

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
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit')) || 15;
  const leadId = searchParams.get('leadId') || undefined;
  const enqueueBacklog = Math.min(500, Math.max(0, Number(searchParams.get('enqueueBacklog')) || 0));

  const db = getSupabaseAdmin();
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

  const summary = await runFsboSkipTrace(db, { limit, leadId, deadlineMs: 240_000 });
  return NextResponse.json({ ok: true, enqueued, ...summary });
}
