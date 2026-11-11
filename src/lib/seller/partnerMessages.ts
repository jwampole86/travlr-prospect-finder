/**
 * The emails AVYRO sends to a partner broker about a referral. Plain text, written once here so the wording is the same everywhere.
 * The lead packet carries only what the owner has permitted to be shared; the partner is asked to reply with the lead reference in the
 * subject, which is the reporting method in Exhibit B of the partner agreement.
 */
export type MessageTemplate = 'intro' | 'nudge' | 'closed';

export interface MessageContext {
  brand: string;
  senderName: string;
  partnerName: string;
  leadRef: string;
  address: string;
  market: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  intent: string | null;
  feePercent: number | null;
  protectionEndsOn: string | null;
  payeeName: string | null;
  paymentMethod: string | null;
  paymentDueDays: number | null;
  sentOn: string;
  status: string;
  commissionNote: string | null;
}

export const TEMPLATE_LABEL: Record<MessageTemplate, string> = { intro: 'Lead packet', nudge: 'Status request', closed: 'Fee details' };

/** A short reference the partner quotes back: state, year, then the first six characters of the referral id. */
export function leadRef(state: string | null | undefined, referralId: string, sentAt: string): string {
  return `${(state ?? 'XX').toUpperCase()}-${new Date(sentAt).getUTCFullYear()}-${referralId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;
}

const STATUS_HELP = 'Received, Contacted, Listed (MLS number if you have it), Under contract, then Closed (close date and price band) or Dead (a short reason).';
const dateOf = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

export function renderPartnerMessage(t: MessageTemplate, c: MessageContext): { subject: string; body: string } {
  const hi = `Hi ${c.partnerName},`;
  const sign = `Thank you,\n${c.senderName}\n${c.brand}`;
  const reply = `Please reply to this email with the lead reference in the subject, for example "Lead ${c.leadRef} – Contacted".`;

  if (t === 'intro') {
    const lines = [
      hi, '',
      `Here is a permissioned seller lead under our referral agreement.`, '',
      `Lead reference: ${c.leadRef}`,
      `Property: ${c.address}${c.market ? ` (${c.market})` : ''}`,
      c.ownerName ? `Owner: ${c.ownerName}` : null,
      c.ownerPhone ? `Phone: ${c.ownerPhone}` : null,
      c.intent ? `What we know: ${c.intent}` : null,
      `Referred on: ${c.sentOn}`, '',
      `Terms: ${c.feePercent != null ? `${c.feePercent}% of your commission on the referred side` : 'as in Exhibit A'}${c.protectionEndsOn ? `, protected until ${c.protectionEndsOn}` : ''}.`,
      `The owner agreed to be introduced to a licensed broker. You handle all licensed brokerage activity from here.`, '',
      `Please confirm receipt and update us within 7 days of first contact, and on each change after that: ${STATUS_HELP}`,
      reply, '', sign
    ];
    return { subject: `Lead ${c.leadRef} – ${c.address}`, body: lines.filter((l) => l !== null).join('\n') };
  }

  if (t === 'nudge') {
    return {
      subject: `Lead ${c.leadRef} – status update please`,
      body: [hi, '', `Could you give us a quick status on ${c.address} (lead ${c.leadRef}, sent ${c.sentOn})? It is currently showing as "${c.status}" on our side.`, '', `Any of these is enough: ${STATUS_HELP}`, reply, '', sign].join('\n')
    };
  }

  const due = c.paymentDueDays != null ? `within ${c.paymentDueDays} business days after you receive your commission` : 'as set out in Exhibit A';
  return {
    subject: `Lead ${c.leadRef} – closed: fee details`,
    body: [
      hi, '', `Congratulations on closing ${c.address} (lead ${c.leadRef}).`, '',
      `Under our referral agreement the fee is ${c.feePercent != null ? `${c.feePercent}% of your gross commission on the referred side` : 'the Exhibit A percentage of your commission on the referred side'}, due ${due}.`,
      c.payeeName ? `Payee: ${c.payeeName}${c.paymentMethod ? ` (${c.paymentMethod})` : ''}` : null,
      c.commissionNote, '',
      `Please reply with the commission you received and the date you received it, and we will send the invoice.`, '', sign
    ].filter((l) => l !== null).join('\n')
  };
}

/** Whether this kind of message makes sense for a referral in this state, and how soon the same one may be sent again. */
export function messageAllowed(t: MessageTemplate, status: string, lastSameAt: string | null, now: Date = new Date()): string | null {
  const final = status === 'closed' || status === 'dead';
  if (t === 'closed' && status !== 'closed') return 'Fee details are only sent for a closed referral.';
  if (t === 'nudge' && final) return 'This referral is already finished.';
  if (t === 'intro' && final) return 'This referral is already finished.';
  if (lastSameAt) {
    const hours = (now.getTime() - Date.parse(lastSameAt)) / 3_600_000;
    const min = t === 'nudge' ? 72 : 24;
    if (hours < min) return `The same message went out ${Math.floor(hours)} hours ago. Wait ${t === 'nudge' ? '3 days' : 'a day'} before sending it again.`;
  }
  return null;
}

export { dateOf };
