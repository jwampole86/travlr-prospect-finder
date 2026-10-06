import { NextRequest, NextResponse } from 'next/server';
import { lookupPhoneNumber } from '@/lib/services/twilioService';

/**
 * GET /api/twilio/lookup?phone=+19498778728
 * Validates a phone number and returns line type (mobile/landline/VoIP), carrier,
 * and caller name via Twilio Lookup v2 — call this before sending SMS or dialing
 * to avoid wasting outreach on dead/VoIP/landline numbers.
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone query param is required' }, { status: 400 });
  }

  const result = await lookupPhoneNumber(phone);
  if (result.error && !result.twilioConfigured) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
