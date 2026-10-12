import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { recordOptOut, verifyTwilioSignature } from '@/lib/services/smsConsent';

// Callbacks can arrive out of order, so a status only ever moves forward.
const RANK: Record<string, number> = { scheduled: 0, accepted: 1, queued: 1, sending: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4, canceled: 4 };

/**
 * POST /api/sms/delivery
 * Twilio StatusCallback for outreach texts. Records delivery status and carrier error codes per message for analytics.
 * Error 21610 means the recipient already opted out at Twilio, so the number is suppressed here too.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const body: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => { body[k] = v; });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  if (verifyTwilioSignature(`${site}/api/sms/delivery`, body, req.headers.get('x-twilio-signature')) !== true) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const sid = body.MessageSid;
  const status = (body.MessageStatus || '').toLowerCase();
  if (!sid || !status) return NextResponse.json({ error: 'Missing MessageSid or MessageStatus' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: row } = await db.from('outreach_history').select('id, lead_id, status, metadata').eq('channel', 'sms').eq('metadata->>message_sid', sid).limit(1).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, ignored: 'unknown message' });

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const current = String(meta.twilio_status ?? 'scheduled');
  if ((RANK[status] ?? 0) < (RANK[current] ?? 0)) return NextResponse.json({ ok: true, ignored: 'older status' });

  const now = new Date().toISOString();
  const next: Record<string, unknown> = { ...meta, twilio_status: status, twilio_status_at: now };
  if (body.ErrorCode) { next.twilio_error_code = body.ErrorCode; next.error = body.ErrorMessage ?? body.ErrorCode; }
  if (status === 'delivered') next.delivered_at = now;

  const mapped = status === 'delivered' ? 'delivered' : ['failed', 'undelivered', 'canceled'].includes(status) ? 'failed' : String(row.status);
  await db.from('outreach_history').update({ status: mapped, metadata: next }).eq('id', row.id);

  if (body.ErrorCode === '21610') await recordOptOut(db, { leadId: row.lead_id, phone: body.To || String(meta.to ?? ''), message: 'Twilio 21610: already unsubscribed' });
  return NextResponse.json({ ok: true });
}
