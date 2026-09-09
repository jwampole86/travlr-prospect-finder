'use server';

import { NextRequest, NextResponse } from 'next/server';

/**
 * Twilio Voice Access Token endpoint.
 * Generates a short-lived Twilio Access Token with VoiceGrant for in-browser VoIP.
 * Credentials are read from environment variables — never hardcoded.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_TWIML_APP_SID   (TwiML App SID for Voice SDK)
 *   TWILIO_FROM_NUMBER
 *
 * NOTE: Install the twilio package to activate real token generation:
 *   npm install twilio
 */

function isTwilioVoiceConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const appSid = process.env.TWILIO_TWIML_APP_SID;
  return !!(
    sid && !sid.startsWith('your-') &&
    token && !token.startsWith('your-') &&
    appSid && !appSid.startsWith('your-')
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const identity: string = (body as Record<string, string>).identity || 'agent';

    if (!isTwilioVoiceConfigured()) {
      return NextResponse.json({
        token: null,
        configured: false,
        message: 'Twilio Voice not yet configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_TWIML_APP_SID to your environment variables.',
      });
    }

    // Attempt to use the twilio SDK if installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID!;

      const accessToken = new AccessToken(accountSid, authToken, {
        identity,
        ttl: 3600,
      });

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true,
      });

      accessToken.addGrant(voiceGrant);

      return NextResponse.json({
        token: accessToken.toJwt(),
        configured: true,
        identity,
      });
    } catch {
      return NextResponse.json({
        token: null,
        configured: false,
        message: 'Twilio SDK not installed. Run: npm install twilio',
      });
    }
  } catch (err) {
    console.error('[TwilioVoiceToken] Error:', err);
    return NextResponse.json(
      { token: null, configured: false, message: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
