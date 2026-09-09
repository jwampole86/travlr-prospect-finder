/**
 * Twilio SMS Service
 *
 * Supports both Account SID (AC...) and API Key (SK...) authentication.
 * When TWILIO_ACCOUNT_SID is an API Key (SK prefix), set TWILIO_ACCOUNT_SID_MAIN
 * to the actual Account SID for the API URL path.
 *
 * All sends are logged to outreach_history regardless of Twilio status.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface SMSDispatchPayload {
  to: string;
  body: string;
  leadId: string;
  templateId?: string;
  sequenceStepId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SMSDispatchResult {
  success: boolean;
  messageSid?: string;
  status: 'sent' | 'failed' | 'queued' | 'placeholder';
  error?: string;
  twilioConfigured: boolean;
}

/**
 * Returns the Account SID to use in the Twilio API URL.
 * If TWILIO_ACCOUNT_SID is an API Key (SK prefix), falls back to TWILIO_ACCOUNT_SID_MAIN.
 */
function getTwilioAccountSid(): string | undefined {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) return undefined;
  // API Key SIDs start with SK — the actual Account SID must be in TWILIO_ACCOUNT_SID_MAIN
  if (sid.startsWith('SK')) {
    return process.env.TWILIO_ACCOUNT_SID_MAIN || sid;
  }
  return sid;
}

/**
 * Returns true when all three Twilio env vars are present and non-placeholder.
 */
export function isTwilioConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  return !!(
    sid && !sid.startsWith('your-') &&
    token && !token.startsWith('your-') &&
    from && !from.startsWith('your-')
  );
}

/**
 * Dispatch a single SMS via Twilio REST API.
 * Falls back to placeholder mode when credentials are not configured.
 */
export async function dispatchSMS(payload: SMSDispatchPayload): Promise<SMSDispatchResult> {
  const configured = isTwilioConfigured();

  if (!configured) {
    console.info('[TwilioService] Placeholder mode — SMS not dispatched. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to activate.');
    return {
      success: true,
      status: 'placeholder',
      twilioConfigured: false,
      messageSid: `placeholder-${Date.now()}`,
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_FROM_NUMBER!;

  // For API Key auth (SK prefix), use the API Key SID + secret as Basic Auth credentials
  // The URL path still uses the Account SID (from TWILIO_ACCOUNT_SID_MAIN if set)
  const urlAccountSid = getTwilioAccountSid() || accountSid;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${urlAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: payload.to,
          From: fromNumber,
          Body: payload.body,
        }).toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        status: 'failed',
        twilioConfigured: true,
        error: data.message || `Twilio error ${response.status}`,
      };
    }

    return {
      success: true,
      status: data.status === 'queued' ? 'queued' : 'sent',
      messageSid: data.sid,
      twilioConfigured: true,
    };
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      twilioConfigured: true,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Fetch delivery status for a previously sent message.
 * Returns null in placeholder mode.
 */
export async function getSMSStatus(messageSid: string): Promise<{
  status: string;
  errorCode?: string;
  errorMessage?: string;
} | null> {
  if (!isTwilioConfigured() || messageSid.startsWith('placeholder-')) return null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const urlAccountSid = getTwilioAccountSid() || accountSid;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${urlAccountSid}/Messages/${messageSid}.json`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
      status: data.status,
      errorCode: data.error_code?.toString(),
      errorMessage: data.error_message,
    };
  } catch {
    return null;
  }
}
