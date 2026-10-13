import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { inSendWindow } from '@/lib/services/estimateOutreachSms';
import { scheduleSMS } from '@/lib/services/twilioSchedule';
import { toE164 } from '@/lib/services/smsConsent';
import { duplicateTextReason } from '@/lib/services/smsDuplicateGuard';

type Db = ReturnType<typeof getSupabaseAdmin>;
const SITE = 'https://prospect.staytrvlr.com';
const MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG9c28a48828aae9a648e8d4bcc8c0cd41';

/** The follow-up to a YES reply. Open-ended on purpose: the homeowner names the day and time, not a "today or tomorrow" slot. */
export const yesFollowupText = (firstName: string | null, address: string) =>
  `Hi${firstName ? ` ${firstName}` : ''}, this is TRAVLR Vacation Homes following up on your YES about ${address}. When would be the best day and time for a quick call about your free rental estimate? Just reply to this text with whatever works for you. Reply STOP to opt out.`;

/** Schedules the follow-up for the first moment in the owner's texting window, once per lead. */
export async function scheduleYesFollowup(db: Db, leadId: string, firstName: string | null): Promise<{ ok: boolean; reason?: string; sendAt?: string }> {
  const { data: l } = await db.from('leads').select('address,state,contact_phone,sms_opt_in,sms_opted_out_at').eq('id', leadId).maybeSingle();
  if (!l?.address) return { ok: false, reason: 'lead_not_found' };
  if (l.sms_opted_out_at || l.sms_opt_in === false) return { ok: false, reason: 'opted_out' };
  const to = toE164(l.contact_phone);
  if (!to) return { ok: false, reason: 'no_valid_number' };
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('metadata->>kind', 'yes_followup').neq('metadata->>twilio_status', 'canceled');
  if ((count ?? 0) > 0) return { ok: false, reason: 'already_followed_up' };
  const dup = await duplicateTextReason(db, leadId);
  if (dup) return { ok: false, reason: dup };

  let sendAt: Date | null = null;
  for (let m = 20; m <= 36 * 60; m += 15) { const t = new Date(Date.now() + m * 60_000); if (inSendWindow(l.state, t)) { sendAt = t; break; } }
  if (!sendAt) return { ok: false, reason: 'no_send_window' };

  const message = yesFollowupText(firstName, l.address);
  const r = await scheduleSMS({ to, body: message, sendAt, messagingServiceSid: MESSAGING_SERVICE, statusCallback: `${SITE}/api/sms/delivery` });
  if (!r.ok || !r.sid) return { ok: false, reason: r.error ?? 'twilio_rejected' };
  await db.from('outreach_history').insert({ lead_id: leadId, channel: 'sms', status: 'sent', sent_at: sendAt.toISOString(), metadata: { kind: 'yes_followup', variant: 'open_ended', to, message, message_sid: r.sid, twilio_status: 'scheduled', scheduled_for: sendAt.toISOString(), direction: 'outbound' } });
  return { ok: true, sendAt: sendAt.toISOString() };
}
