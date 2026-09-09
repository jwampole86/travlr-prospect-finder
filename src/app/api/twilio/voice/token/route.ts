'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const identity: string = (body as Record<string, string>).identity || 'agent';

    const status = getTwilioConfigStatus();

    if (!status.voiceTokenConfigured) {
      return NextResponse.json({
        token: null,
        configured: false,
        missing: status.missing,
        message: `Twilio Voice not yet configured. Missing: ${status.missing.join(', ')}. Voice SDK requires an SK... API Key SID, API key secret, parent AC... Account SID, and TWILIO_TWIML_APP_SID.`,
      });
    }

    // Attempt to use the twilio SDK if installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const apiKeySid = process.env.TWILIO_ACCOUNT_SID!;
      const apiKeySecret = process.env.TWILIO_AUTH_TOKEN!;
      const accountSid = process.env.TWILIO_ACCOUNT_SID_MAIN!;
      const twimlAppSid = process.env.TWILIO_TWIML_APP_SID!;

      const accessToken = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
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
        authMode: status.authMode,
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
