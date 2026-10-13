/** A text counts as sent only once Twilio reports it left the queue, not just because its scheduled time passed. */
const HANDED_OFF = new Set(['sending', 'sent', 'delivered', 'undelivered', 'failed', 'read']);
export const wasSent = (twilioStatus: string | null | undefined) => HANDED_OFF.has(String(twilioStatus ?? ''));
