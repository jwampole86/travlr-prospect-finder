import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { EmailCampaignCounts, EmailMessageRow, EmailOverview } from '@/lib/emailOverviewTypes';

type Row = Record<string, any>;
const empty = (): EmailCampaignCounts => ({ total: 0, drafts: 0, sent: 0, delivered: 0, opened: 0, replied: 0, bounced: 0, optedOut: 0 });

/** GET /api/campaigns/email-overview  Every co-host email campaign with its real send, delivery, open, reply and bounce counts, plus each email. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();

  const [campRes, msgRes] = await Promise.all([
    db.from('cohost_email_campaigns').select('id,name,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('cohost_email_messages').select('id,campaign_id,offer_code,to_email,to_name,subject,body,status,sent_at,delivered_at,opened_at,bounced_at,bounce_type,failure_reason,replied_at,reply_text,opted_out_at,retry_at,created_at').order('created_at', { ascending: false }).limit(2000),
  ]);
  if (campRes.error || msgRes.error) return NextResponse.json({ error: 'Could not load email campaigns' }, { status: 500 });

  const totals = empty();
  const per = new Map<string, EmailCampaignCounts>();
  const messages: EmailMessageRow[] = [];
  for (const m of (msgRes.data ?? []) as Row[]) {
    const c = per.get(m.campaign_id) ?? empty(); per.set(m.campaign_id, c);
    for (const t of [c, totals]) {
      t.total++;
      if (m.status === 'draft') t.drafts++;
      if (m.sent_at) t.sent++;
      if (m.delivered_at) t.delivered++;
      if (m.opened_at) t.opened++;
      if (m.replied_at) t.replied++;
      if (m.bounced_at || m.status === 'bounced') t.bounced++;
      if (m.opted_out_at) t.optedOut++;
    }
    messages.push({
      id: m.id, campaignId: m.campaign_id, offerCode: m.offer_code ?? null, toName: m.to_name ?? null, toEmail: m.to_email, subject: m.subject ?? '', body: String(m.body ?? '').slice(0, 6000), status: m.status,
      sentAt: m.sent_at ?? null, deliveredAt: m.delivered_at ?? null, openedAt: m.opened_at ?? null, repliedAt: m.replied_at ?? null, bouncedAt: m.bounced_at ?? null, bounceType: m.bounce_type ?? null,
      failureReason: m.failure_reason ?? null, replyText: m.reply_text ? String(m.reply_text).slice(0, 600) : null, optedOut: !!m.opted_out_at, retryAt: m.retry_at ?? null,
    });
  }
  const campaigns = ((campRes.data ?? []) as Row[]).map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at, counts: per.get(c.id) ?? empty() }));
  const body: EmailOverview = { campaigns, messages, totals };
  return NextResponse.json(body);
}
