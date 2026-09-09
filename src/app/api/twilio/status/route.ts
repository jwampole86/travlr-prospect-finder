import { NextResponse } from 'next/server';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';

export async function GET() {
  const status = getTwilioConfigStatus();

  let providerReachable = false;
  let providerStatus: number | null = null;
  let providerError: string | null = null;

  if (status.smsConfigured) {
    const authSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const accountSid = authSid.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : authSid;
    const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');

    try {
      // Use the Calls list endpoint (not the Account resource itself) — Twilio API Keys
      // are commonly denied access to GET /Accounts/{Sid}.json even when fully permissioned
      // for creating calls/messages, which produced false-negative "unreachable" results.
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=1`, {
        headers: { Authorization: `Basic ${credentials}` },
        cache: 'no-store',
      });
      providerStatus = response.status;
      providerReachable = response.ok;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        providerError = body?.message || `Twilio returned HTTP ${response.status}`;
      }
    } catch (err) {
      providerError = err instanceof Error ? err.message : 'Twilio status check failed';
    }
  }

  const ok = status.smsConfigured && providerReachable;

  return NextResponse.json({
    ok,
    configured: status.smsConfigured,
    smsConfigured: status.smsConfigured,
    voiceTokenConfigured: status.voiceTokenConfigured,
    voiceCallConfigured: status.voiceCallConfigured,
    authMode: status.authMode,
    missing: status.missing,
    fromNumberConfigured: status.fromNumberConfigured,
    twimlAppConfigured: status.twimlAppConfigured,
    providerReachable,
    providerStatus,
    providerError,
    message: ok
      ? 'Twilio SMS/REST credentials validated successfully.'
      : status.missing.length > 0
        ? `Twilio is not fully configured. Missing: ${status.missing.join(', ')}.`
        : providerError || 'Twilio credentials are configured but provider validation failed.',
  }, { status: ok ? 200 : 503 });
}
