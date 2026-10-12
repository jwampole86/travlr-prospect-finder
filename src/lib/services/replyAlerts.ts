import 'server-only';
import { dispatchSMS } from '@/lib/services/twilioService';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { toE164 } from '@/lib/services/smsConsent';

// Where a person is told that a prospect wrote back. Override with REPLY_ALERT_PHONE and REPLY_ALERT_EMAIL.
const ALERT_PHONE = toE164(process.env.REPLY_ALERT_PHONE ?? '+19498758622');
const ALERT_EMAIL = process.env.REPLY_ALERT_EMAIL ?? 'info@staytrvlr.com';

export interface ReplyAlert {
  kind: 'yes' | 'question';
  from: string;
  text: string;
  name?: string | null;
  place?: string | null;
  /** Page to open to answer them. */
  url: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Emails and texts the team about a reply that needs a person. Never throws: the reply is already saved. */
export async function sendReplyAlert(a: ReplyAlert): Promise<void> {
  // A reply from the alert number itself must not set off another alert.
  if (ALERT_PHONE && toE164(a.from) === ALERT_PHONE) return;
  const who = [a.name, a.place].filter(Boolean).join(', ') || a.from;
  const label = a.kind === 'yes' ? 'replied YES' : 'sent a reply';
  const quote = a.text.replace(/\s+/g, ' ').trim();

  const tasks: Array<Promise<unknown>> = [];
  if (ALERT_EMAIL) {
    tasks.push((async () => {
      await getResendClient().emails.send({
        from: getResendFrom(), to: [ALERT_EMAIL], subject: `TRAVLR text reply: ${who} ${label}`,
        text: `${who} ${label} to a TRAVLR text.\n\nThey wrote: "${quote.slice(0, 500)}"\nTheir number: ${a.from}\n\nOpen: ${a.url}`,
        html: `<p><strong>${esc(who)}</strong> ${label} to a TRAVLR text.</p><p>They wrote: &ldquo;${esc(quote.slice(0, 500))}&rdquo;<br>Their number: ${esc(a.from)}</p><p><a href="${esc(a.url)}">Open it</a></p>`,
      });
    })());
  }
  if (ALERT_PHONE) {
    tasks.push(dispatchSMS({ to: ALERT_PHONE, leadId: 'internal-reply-alert', body: `TRAVLR: ${who} ${label}: "${quote.slice(0, 110)}" ${a.url}` }));
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.warn('[replyAlert]', r.reason instanceof Error ? r.reason.message : r.reason);
}
