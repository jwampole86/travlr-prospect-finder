import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { answerFromReport, HANDOFF } from '@/lib/services/estimateChat';
import { inSendWindow } from '@/lib/services/estimateOutreachSms';
import { isSuppressed } from '@/lib/services/smsConsent';

type Db = ReturnType<typeof getSupabaseAdmin>;
const MAX_PER_DAY = 3;
const SMS_RULES = `SMS MODE: you are replying by text message. Reply in under 280 characters of plain sentences with no lists. Do not quote nightly rates or occupancy; talk about yearly net estimates and the free estimate only. If you cannot answer from the context, reply with only ${HANDOFF}.`;

export const looksLikeQuestion = (t: string) => /\?/.test(t) || /^\s*(who|what|how|why|when|where|which|is|are|do|does|did|can|could|will|would|should|am)\b/i.test(t);

const clip = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '...').trim();
};

/**
 * An immediate text answer to a homeowner's question, at any hour (it answers their message, so quiet hours do not apply).
 * Grounded in their own estimate report; when it cannot answer, a holding reply says when a person will text back.
 */
export async function questionReply(db: Db, leadId: string, from: string, question: string): Promise<string | null> {
  if (await isSuppressed(db, from)) return null;
  const { data: lead } = await db.from('leads').select('address,city,state,zip,sms_opted_out_at').eq('id', leadId).maybeSingle();
  if (!lead?.address || lead.sms_opted_out_at) return null;
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('metadata->>kind', 'auto_answer').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= MAX_PER_DAY) return null;

  const address = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  let answer: string | null = null;
  try {
    const r = await Promise.race([
      answerFromReport(address, [{ role: 'user', content: question.slice(0, 500) }], { extraRules: SMS_RULES, timeoutMs: 8000, maxTokens: 200 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000)),
    ]);
    if (r.text) answer = clip(r.text, 300);
  } catch { /* the holding reply below covers it */ }

  const when = inSendWindow(lead.state) ? 'shortly' : 'first thing in the morning';
  const message = answer ? `${answer} Reply STOP to opt out.` : `Good question! A TRAVLR specialist will text you back ${when} with the details. Reply STOP to opt out.`;
  await db.from('outreach_history').insert({ lead_id: leadId, channel: 'sms', status: 'sent', sent_at: new Date().toISOString(), metadata: { kind: 'auto_answer', direction: 'outbound', to: from, message, answered: !!answer, twilio_status: 'sent', question: question.slice(0, 300) } });
  return message;
}
