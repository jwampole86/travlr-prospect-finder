import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { harvestBatch, listBatches } from '@/lib/services/smsCampaignHarvest';
import { buildOverview, generateInsights, saveSnapshot } from '@/lib/services/campaignInsights';
import { audienceCandidates } from '@/lib/services/campaignBuilder';
import { sendTeamAlert } from '@/lib/services/replyAlerts';
import { wasSent } from '@/lib/services/smsSendState';

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
    // Once a fresh campaign has finished sending and delivery has settled, text the result and what to do next (once).
    if (now - lastSend > 90 * 60_000 && now - lastSend < 6 * 3_600_000) {
      const { data: rows } = await db.from('sms_lead_engagement').select('twilio_status,opted_out,temperature').eq('batch', b.batch);
      const live = (rows ?? []).filter(r => r.twilio_status !== 'canceled');
      if (live.length && live.every(r => wasSent(r.twilio_status))) {
        const delivered = live.filter(r => ['delivered', 'read'].includes(r.twilio_status)).length;
        const undelivered = live.filter(r => ['undelivered', 'failed'].includes(r.twilio_status)).length;
        const optOut = live.filter(r => r.opted_out).length;
        const warm = live.filter(r => r.temperature === 'hot' || r.temperature === 'warm').length;
        const dPct = Math.round((delivered / live.length) * 100); const oPct = (optOut / live.length) * 100;
        const [high, verified] = await Promise.all([audienceCandidates(db, 'high-score'), audienceCandidates(db, 'fully-verified')]);
        const next = dPct >= 85 && oPct <= 5
          ? `Delivery is good: ready to launch the next campaign from the ${high.length} untexted leads scoring 70+. Say go.`
          : `Delivery or opt-outs are off: hold the unverified-phone groups and send only fully verified (${verified.length} available).`;
        await sendTeamAlert({ key: `batch-verdict:${b.batch}`, text: `${b.batch} finished: ${live.length} texts, ${delivered} delivered (${dPct}%), ${undelivered} undelivered, ${optOut} opted out, ${warm} warm/hot. ${next}`, url: `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '')}/campaigns`, email: true });
      }
    }
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
