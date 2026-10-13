/** A text counts as sent only once Twilio reports it left the queue, not just because its scheduled time passed. */
const HANDED_OFF = new Set(['sending', 'sent', 'delivered', 'undelivered', 'failed', 'read']);
export const wasSent = (twilioStatus: string | null | undefined) => HANDED_OFF.has(String(twilioStatus ?? ''));

export interface OutreachDisplay {
  label: string;
  tone: 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'gray';
  /** Dated lines for the log, in the order they happened. */
  events: Array<{ label: string; at: string }>;
}

type HistoryRow = { channel: string; status: string; sent_at: string; metadata?: Record<string, any> | null };

/** What the outreach log shows for a row: a queued text is "Scheduled" with its send time, never "Sent" with that time. */
export function outreachDisplay(r: HistoryRow): OutreachDisplay {
  const m = r.metadata ?? {};
  const events: OutreachDisplay['events'] = [];
  const add = (label: string, at: unknown) => { if (typeof at === 'string' && at && !Number.isNaN(Date.parse(at))) events.push({ label, at }); };

  if (r.status === 'replied' || m.direction === 'inbound') {
    add('Reply received', r.sent_at);
    return { label: 'Reply', tone: 'purple', events };
  }
  if (r.channel !== 'sms') {
    add(r.status === 'sent' || r.status === 'delivered' ? 'Sent' : `Status: ${r.status}`, r.sent_at);
    return { label: r.status, tone: r.status === 'failed' || r.status === 'bounced' ? 'red' : 'blue', events };
  }

  const tw = String(m.twilio_status ?? (r.status === 'sent' ? 'sent' : r.status));
  const scheduledFor = String(m.scheduled_for ?? r.sent_at);
  const due = Date.parse(scheduledFor) <= Date.now();
  if (tw === 'canceled') { add('Was scheduled for', scheduledFor); add('Cancelled before sending', m.twilio_status_at); return { label: 'Cancelled', tone: 'gray', events }; }
  if (tw === 'scheduled' || tw === 'accepted') {
    add(due ? 'Was due to send at' : 'Scheduled to send at', scheduledFor);
    return { label: due ? 'Due to send' : 'Scheduled', tone: 'amber', events };
  }
  if (tw === 'queued') { add('Handed to Twilio at', r.sent_at); return { label: 'Queued', tone: 'amber', events }; }
  if (tw === 'failed' || tw === 'undelivered') {
    add('Sent at', m.scheduled_for ?? r.sent_at);
    add(`${tw === 'failed' ? 'Failed' : 'Not delivered'}${m.twilio_error_code ? ` (error ${m.twilio_error_code})` : ''} at`, m.twilio_status_at);
    return { label: tw === 'failed' ? 'Failed' : 'Undelivered', tone: 'red', events };
  }
  add('Sent at', m.scheduled_for ?? r.sent_at);
  if (tw === 'delivered' || tw === 'read') {
    add('Delivered at', m.delivered_at ?? m.twilio_status_at);
    return { label: tw === 'read' ? 'Read' : 'Delivered', tone: 'green', events };
  }
  return { label: 'Sent', tone: 'blue', events };
}
