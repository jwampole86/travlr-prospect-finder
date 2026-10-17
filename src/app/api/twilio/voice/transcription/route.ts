import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyTwilioSignature } from '@/lib/services/smsConsent';

/**
 * POST /api/twilio/voice/transcription?sessionId=
 * Twilio's real-time transcription posts each phrase it hears here. The track that carries the homeowner's voice (what Twilio sends to
 * the agent's browser) is stored as the homeowner; the agent's own side is stored too but the teleprompter hears the agent directly.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let fields: Record<string, string> = {};
  if (contentType.includes('application/json')) {
    const json = await req.json().catch(() => ({})) as Record<string, unknown>;
    fields = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  } else {
    const form = await req.formData().catch(() => new FormData());
    form.forEach((v, k) => { fields[k] = String(v); });
    const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const verified = verifyTwilioSignature(`${site}${req.nextUrl.pathname}${req.nextUrl.search}`, fields, req.headers.get('x-twilio-signature'));
    if (verified === false) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const event = fields.TranscriptionEvent || 'unknown';
  const track = fields.Track || null;
  let text: string | null = null;
  if (event === 'transcription-content') {
    try {
      const data = JSON.parse(fields.TranscriptionData || '{}') as { transcript?: string };
      text = (data.transcript ?? fields.Transcript ?? '').trim() || null;
    } catch { text = (fields.Transcript ?? '').trim() || null; }
  }
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ received: true });

  const speaker = track === 'outbound_track' ? 'Homeowner' : track === 'inbound_track' ? 'Agent' : null;
  await getSupabaseAdmin().from('call_transcript_events').insert({
    session_id: sessionId,
    call_sid: fields.CallSid || null,
    event,
    track,
    speaker,
    text,
    is_final: fields.Final === undefined ? null : fields.Final === 'true',
    sequence: Number.isFinite(Number(fields.SequenceId)) ? Number(fields.SequenceId) : null,
  });
  return NextResponse.json({ received: true });
}
