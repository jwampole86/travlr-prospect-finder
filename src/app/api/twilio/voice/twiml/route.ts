'use server';

import { NextRequest, NextResponse } from 'next/server';

/**
 * TwiML response endpoint — Twilio calls this URL to get call instructions.
 * Returns XML that:
 *  1. Plays a consent disclosure BEFORE recording begins (required for two-party
 *     consent states: CA, WA, FL, IL, MD, MA, MI, MT, NV, NH, OR, PA).
 *  2. Connects the call with dual-channel recording after consent.
 */

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => new FormData());
  const to = formData.get('To') as string | null;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">This call may be recorded for quality assurance and training purposes. By continuing, you consent to being recorded.</Say>
  <Pause length="1"/>
  <Dial callerId="${process.env.TWILIO_FROM_NUMBER || ''}" record="record-from-answer-dual" recordingStatusCallback="${process.env.NEXT_PUBLIC_SITE_URL}/api/twilio/voice/recording-status" recordingStatusCallbackMethod="POST">
    ${to ? `<Number>${to}</Number>` : '<Client>agent</Client>'}
  </Dial>
</Response>`;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(_req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>TRAVLR Prospect Finder call system. Connecting you now.</Say>
</Response>`;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
