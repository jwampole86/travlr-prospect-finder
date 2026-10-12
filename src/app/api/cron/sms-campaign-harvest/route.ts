import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { harvestBatch, listBatches } from '@/lib/services/smsCampaignHarvest';
import { buildOverview, generateInsights, saveSnapshot } from '@/lib/services/campaignInsights';

export const maxDuration = 300;

/**
 * GET /api/cron/sms-campaign-harvest  (CRON_SECRET)
 * Keeps every text campaign's per-lead record current. Once a campaign has been out for 24 hours it also saves a report with
 * AI takeaways, and again when the 72-hour collection window closes.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getSupabaseAdmin();
  const now = Date.now();
  const out: Array<Record<string, unknown>> = [];

  for (const b of await listBatches(db)) {
    if (Date.parse(b.firstSend) > now + 3_600_000) continue; // not close to sending yet
    const { count: open } = await db.from('sms_lead_engagement').select('lead_id', { count: 'exact', head: true }).eq('batch', b.batch).eq('final', false);
    const { count: existing } = await db.from('sms_lead_engagement').select('lead_id', { count: 'exact', head: true }).eq('batch', b.batch);
    if ((existing ?? 0) > 0 && (open ?? 0) === 0) continue; // collection window closed
    const result = await harvestBatch(db, b.batch, { writeCrm: Date.parse(b.firstSend) < now });
    const entry: Record<string, unknown> = { ...result };

    const lastSend = Date.parse(b.lastSend);
    const milestone = now > lastSend + 72 * 3_600_000 ? 'final' : now > lastSend + 24 * 3_600_000 ? 'day1' : null;
    if (milestone) {
      const { data: done } = await db.from('campaign_insight_snapshots').select('id').eq('batch', b.batch).not('insights', 'is', null).gte('created_at', new Date(lastSend + (milestone === 'final' ? 72 : 24) * 3_600_000).toISOString()).limit(1);
      if (!done?.length) {
        const overview = await buildOverview(db, [b.batch]);
        const ai = await generateInsights(overview);
        await saveSnapshot(db, b.batch, overview, 'error' in ai ? undefined : ai);
        entry.insights = 'error' in ai ? ai.error : milestone;
      }
    }
    out.push(entry);
  }
  return NextResponse.json({ ok: true, batches: out });
}
