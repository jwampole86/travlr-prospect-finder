import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

type Db = ReturnType<typeof getSupabaseAdmin>;

export interface TrackedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  leadId: string;
  /** e.g. 'homeowner_report' | 'homeowner_confirmation'; webhooks use it to decide follow-up on a bounce */
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface TrackedResult { ok: boolean; messageId: string | null; attempts: number; error: string | null }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const transient = (msg: string, status?: number) => (status ? status === 429 || status >= 500 : /timeout|network|fetch failed|ECONN|socket|rate limit/i.test(msg));

/**
 * Sends through Resend, retries once on a transient failure, and records the attempt in outreach_history with the
 * Resend message id so the delivery webhook can later mark it delivered, opened or bounced.
 */
export async function sendTrackedEmail(db: Db, mail: TrackedEmail): Promise<TrackedResult> {
  const from = getResendFrom();
  const resend = getResendClient();
  let attempts = 0;
  let lastError: string | null = null;
  let messageId: string | null = null;

  for (; attempts < 2 && !messageId;) {
    attempts++;
    try {
      const { data, error } = await resend.emails.send({
        from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        tags: [{ name: 'kind', value: mail.kind.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) }],
      });
      if (error) {
        lastError = error.message || 'Resend rejected the message';
        const status = (error as { statusCode?: number }).statusCode;
        if (attempts < 2 && transient(lastError, status)) { await sleep(1200); continue; }
        break;
      }
      messageId = data?.id ?? null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Send failed';
      if (attempts < 2 && transient(lastError)) { await sleep(1200); continue; }
      break;
    }
  }

  const now = new Date().toISOString();
  await db.from('outreach_history').insert({
    lead_id: mail.leadId, channel: 'email', subject: mail.subject, body_preview: mail.text.slice(0, 200),
    status: messageId ? 'sent' : 'failed', failure_reason: messageId ? null : (lastError ?? 'unknown').slice(0, 300),
    recipient_email: mail.to, sent_at: now, resend_message_id: messageId,
    metadata: { kind: mail.kind, attempts, ...(mail.metadata ?? {}) },
  }).then(() => null, () => null);

  return { ok: Boolean(messageId), messageId, attempts, error: messageId ? null : lastError };
}
