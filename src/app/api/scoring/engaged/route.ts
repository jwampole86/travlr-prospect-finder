import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { EngagedProspect, EngagedProspectsResponse } from '@/lib/engagedProspectTypes';

type Row = Record<string, any>;
const redactPhone = (s: string) => s.replace(/\+?\d[\d\s().-]{8,}\d/g, '[number]');

/** GET /api/scoring/engaged  Leads who have actually engaged with a text (clicked, replied, or rated warm/hot), with the real signals behind each. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  const count = async (build: (q: any) => any) => { const { count: n } = await build(db.from('sms_lead_engagement').select('lead_id', { count: 'exact', head: true })); return n ?? 0; };

  const [texted, delivered, clicked, replied, hot, warm, rowsRes] = await Promise.all([
    count((q) => q),
    count((q) => q.not('delivered_at', 'is', null)),
    count((q) => q.not('first_click_at', 'is', null)),
    count((q) => q.not('reply_text', 'is', null)),
    count((q) => q.eq('temperature', 'hot')),
    count((q) => q.eq('temperature', 'warm')),
    db.from('sms_lead_engagement')
      .select('lead_id,engagement_score,temperature,human_clicks,estimate_viewed,time_on_page_s,chat_questions,report_downloaded,contact_requested_at,estimate_submitted_at,reply_text,reply_intent,last_activity_at,first_click_at')
      .or('temperature.in.(hot,warm),first_click_at.not.is.null,reply_text.not.is.null')
      .order('engagement_score', { ascending: false }).limit(600),
  ]);

  // One row per lead: keep the strongest engagement across batches.
  const byLead = new Map<string, Row>();
  for (const r of (rowsRes.data ?? []) as Row[]) { const cur = byLead.get(r.lead_id); if (!cur || (r.engagement_score ?? 0) > (cur.engagement_score ?? 0)) byLead.set(r.lead_id, r); }
  const ids = [...byLead.keys()];
  const leads = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('leads').select('id,address,city,state,stage,contact_name,owner_name,prospect_score,regulation_status').in('id', ids.slice(i, i + 100));
    for (const l of (data ?? []) as Row[]) leads.set(l.id, l);
  }

  const prospects: EngagedProspect[] = [];
  for (const [id, e] of byLead) {
    const l = leads.get(id); if (!l) continue;
    prospects.push({
      leadId: id, address: l.address ?? '', place: [l.city, l.state].filter(Boolean).join(', '), name: l.contact_name || l.owner_name || null, stage: l.stage ?? null, regulation: l.regulation_status ?? null,
      baseScore: Number(l.prospect_score) || 0, engagementScore: Math.min(100, Number(e.engagement_score) || 0), temperature: e.temperature === 'hot' || e.temperature === 'warm' ? e.temperature : 'cold',
      clicks: Number(e.human_clicks) || 0, viewed: e.estimate_viewed === true, timeOnPage: Number.isFinite(e.time_on_page_s) ? e.time_on_page_s : null, chatQuestions: Number(e.chat_questions) || 0,
      downloaded: e.report_downloaded === true, contactRequested: !!(e.contact_requested_at || e.estimate_submitted_at), replied: !!e.reply_text, replyIntent: e.reply_intent ?? null,
      replyText: e.reply_text ? redactPhone(String(e.reply_text)).slice(0, 240) : null, lastActivityAt: e.last_activity_at ?? e.first_click_at ?? null,
    });
  }
  const body: EngagedProspectsResponse = { totals: { texted, delivered, clicked, replied, hot, warm }, prospects };
  return NextResponse.json(body);
}
