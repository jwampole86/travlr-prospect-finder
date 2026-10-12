import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifySvixSignature } from '@/lib/estimateTokens';
import { applyResendEvent } from '@/lib/services/cohostEmail';

/**
 * POST /api/webhooks/resend
 * Resend delivery events (delivered, opened, bounced, complained, failed). Updates outreach_history for the matching message.
 * A homeowner email that bounces or fails permanently creates a "call them instead" task so the report still reaches them.
 * Requires RESEND_WEBHOOK_SECRET (the signing secret Resend shows for this webhook); unsigned requests are rejected.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });

  const body = await req.text();
  const ok = verifySvixSignature({
    id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature'), body, secret,
  });
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let event: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string; subType?: string; message?: string }; reason?: string } };
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }

  const type = event.type ?? '';
  const messageId = event.data?.email_id;
  if (!messageId) return NextResponse.json({ ok: true, ignored: 'no email id' });

  const db = getSupabaseAdmin();
  // Co-host campaign emails are tracked apart from homeowner emails.
  if (await applyResendEvent(db, messageId, type, event.created_at ?? new Date().toISOString(), event.data?.bounce, event.data?.reason)) return NextResponse.json({ ok: true, cohost: true });
  const { data: row } = await db.from('outreach_history').select('id, lead_id, status, recipient_email, metadata').eq('resend_message_id', messageId).limit(1).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, ignored: 'unknown message' });

  const at = event.created_at ?? new Date().toISOString();
  const rank: Record<string, number> = { sent: 1, delivered: 2, opened: 3 };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (type === 'email.delivered' && (rank[row.status] ?? 0) < 2) Object.assign(update, { status: 'delivered', delivered_at: at });
  else if (type === 'email.opened' || type === 'email.clicked') Object.assign(update, { status: 'opened', opened_at: at, ...(row.status === 'sent' ? { delivered_at: at } : {}) });
  else if (type === 'email.bounced') {
    const hard = (event.data?.bounce?.type ?? '').toLowerCase().includes('perm');
    Object.assign(update, { status: 'bounced', bounce_type: hard ? 'hard' : 'soft', failure_reason: (event.data?.bounce?.message ?? 'Bounced').slice(0, 300) });
  } else if (type === 'email.complained') Object.assign(update, { status: 'failed', failure_reason: 'Recipient marked the email as spam' });
  else if (type === 'email.failed') Object.assign(update, { status: 'failed', failure_reason: (event.data?.reason ?? 'Send failed').slice(0, 300) });
  else return NextResponse.json({ ok: true, ignored: type });

  await db.from('outreach_history').update(update).eq('id', row.id);

  const kind = String((row.metadata as { kind?: string } | null)?.kind ?? '');
  const undeliverable = update.status === 'bounced' && update.bounce_type === 'hard' || update.status === 'failed';
  if (undeliverable && kind.startsWith('homeowner_')) {
    try {
      const reason = String(update.failure_reason ?? 'could not be delivered');
      // A hard bounce means the address is dead: stop emailing it and make sure a person follows up another way.
      await db.from('leads').update({ email_opt_in: false }).eq('id', row.lead_id);
      const { data: existing } = await db.from('lead_tasks').select('id').eq('lead_id', row.lead_id).eq('status', 'pending').ilike('title', 'Email bounced%').limit(1);
      if (!existing?.length) {
        await db.from('lead_tasks').insert({
          lead_id: row.lead_id, task_type: 'call', status: 'pending', priority: 'high', due_date: new Date(Date.now() + 4 * 3600_000).toISOString(),
          title: `Email bounced for homeowner: confirm their email by phone (${row.recipient_email})`,
          description: `Their estimate email to ${row.recipient_email} did not arrive (${reason}). Call or text them to confirm a working email address and resend the report.`,
        });
        const { data: admins } = await db.from('user_profiles').select('id').in('app_role', ['admin', 'owner']).limit(10);
        if (admins?.length) {
          await db.from('app_notifications').insert(admins.map(a => ({
            user_id: a.id, type: 'homeowner_email_bounced', title: 'Homeowner report email bounced',
            message: `${row.recipient_email}: ${reason}`, severity: 'warning', category: 'leads', metadata: { lead_id: row.lead_id },
          })));
        }
      }
    } catch (e) { console.warn('[webhooks/resend] follow-up failed:', e instanceof Error ? e.message : e); }
  }
  return NextResponse.json({ ok: true, updated: update.status ?? null });
}
