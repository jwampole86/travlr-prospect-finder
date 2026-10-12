import 'server-only';

// Twilio-side scheduling: Twilio holds each message and sends it at SendAt, so delivery does not depend on this app being up.
// Requires a Messaging Service (the service's number and opt-out handling are used). SendAt must be 15 minutes to 35 days ahead.

function creds() {
  const key = process.env.TWILIO_ACCOUNT_SID!;
  const secret = process.env.TWILIO_AUTH_TOKEN!;
  const sid = key.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : key;
  return { auth: Buffer.from(`${key}:${secret}`).toString('base64'), accountSid: sid };
}

export interface ScheduleResult { ok: boolean; sid?: string; status?: string; error?: string }

export async function scheduleSMS(input: { to: string; body: string; sendAt: Date; messagingServiceSid: string; statusCallback: string }): Promise<ScheduleResult> {
  const { auth, accountSid } = creds();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      To: input.to, Body: input.body, MessagingServiceSid: input.messagingServiceSid,
      ScheduleType: 'fixed', SendAt: input.sendAt.toISOString().replace(/\.\d{3}Z$/, 'Z'), StatusCallback: input.statusCallback,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || `Twilio error ${res.status}` };
  return { ok: true, sid: data.sid, status: data.status };
}

export async function cancelScheduled(sid: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { auth, accountSid } = creds();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'Status=canceled',
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, status: data.status } : { ok: false, error: data.message || `Twilio error ${res.status}` };
}
