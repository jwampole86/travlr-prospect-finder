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

export interface TwilioConfigStatus {
  smsConfigured: boolean;
  voiceTokenConfigured: boolean;
  voiceCallConfigured: boolean;
  authMode: 'account_sid' | 'api_key' | 'missing';
  accountSidConfigured: boolean;
  apiKeySidConfigured: boolean;
  apiAccountSidConfigured: boolean;
  authTokenConfigured: boolean;
  fromNumberConfigured: boolean;
  twimlAppConfigured: boolean;
  missing: string[];
}

function isConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && !/your-|placeholder|changeme|example/i.test(value));
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
    return isConfiguredValue(process.env.TWILIO_ACCOUNT_SID_MAIN) ? process.env.TWILIO_ACCOUNT_SID_MAIN : undefined;
  }
  return sid;
}

export function getTwilioConfigStatus(): TwilioConfigStatus {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const accountSidMain = process.env.TWILIO_ACCOUNT_SID_MAIN;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  const apiKeySidConfigured = isConfiguredValue(sid) && sid.startsWith('SK');
  const accountSidConfigured = isConfiguredValue(sid) && sid.startsWith('AC');
  const apiAccountSidConfigured = apiKeySidConfigured ? isConfiguredValue(accountSidMain) && accountSidMain.startsWith('AC') : accountSidConfigured;
  const authTokenConfigured = isConfiguredValue(token);
  const fromNumberConfigured = isConfiguredValue(from);
  const twimlAppConfigured = isConfiguredValue(twimlAppSid) && twimlAppSid.startsWith('AP');
  const authMode = apiKeySidConfigured ? 'api_key' : accountSidConfigured ? 'account_sid' : 'missing';

  const missing: string[] = [];
  if (!isConfiguredValue(sid)) missing.push('TWILIO_ACCOUNT_SID');
  if (apiKeySidConfigured && !apiAccountSidConfigured) missing.push('TWILIO_ACCOUNT_SID_MAIN');
  if (!authTokenConfigured) missing.push('TWILIO_AUTH_TOKEN');
  if (!fromNumberConfigured) missing.push('TWILIO_FROM_NUMBER');
  if (!twimlAppConfigured) missing.push('TWILIO_TWIML_APP_SID');

  return {
    smsConfigured: apiAccountSidConfigured && authTokenConfigured && fromNumberConfigured,
    voiceTokenConfigured: apiKeySidConfigured && apiAccountSidConfigured && authTokenConfigured && twimlAppConfigured,
    voiceCallConfigured: apiAccountSidConfigured && authTokenConfigured && fromNumberConfigured,
    authMode,
    accountSidConfigured,
    apiKeySidConfigured,
    apiAccountSidConfigured,
    authTokenConfigured,
    fromNumberConfigured,
    twimlAppConfigured,
    missing,
  };
}

/**
 * Returns true when all three Twilio env vars are present and non-placeholder.
 */
export function isTwilioConfigured(): boolean {
  return getTwilioConfigStatus().smsConfigured;
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
  const urlAccountSid = getTwilioAccountSid();
  if (!urlAccountSid) {
    return {
      success: false,
      status: 'failed',
      twilioConfigured: false,
      error: 'Twilio API Key SID is configured, but TWILIO_ACCOUNT_SID_MAIN is missing. Set the parent AC... Account SID for REST API URLs.',
    };
  }

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
  const urlAccountSid = getTwilioAccountSid();
  if (!urlAccountSid) return null;
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
