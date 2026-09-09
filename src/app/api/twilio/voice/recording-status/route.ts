'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

/**
 * Twilio recording status callback.
 * Receives recording completion webhooks from Twilio.
 * Updates outreach_call_log and call_sessions with recording URL + SID.
 */

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => new FormData());
    const recordingUrl = formData.get('RecordingUrl') as string | null;
    const callSid = formData.get('CallSid') as string | null;
    const recordingSid = formData.get('RecordingSid') as string | null;
    const recordingStatus = formData.get('RecordingStatus') as string | null;
    const recordingDuration = formData.get('RecordingDuration') as string | null;

    console.info('[TwilioRecording] Status callback received:', {
      callSid,
      recordingSid,
      recordingStatus,
      recordingDuration,
      recordingUrl,
    });

    // Persist recording URL to outreach_call_log and call_sessions when available
    if (callSid && recordingUrl && recordingStatus === 'completed') {
      try {
        const supabase = createClient();

        // Update outreach_call_log
        await supabase
          .from('outreach_call_log')
          .update({
            recording_url: recordingUrl,
            recording_sid: recordingSid ?? null,
          })
          .eq('call_sid', callSid);

        // Update call_sessions
        await supabase
          .from('call_sessions')
          .update({
            recording_url: recordingUrl,
            recording_sid: recordingSid ?? null,
          })
          .eq('call_sid', callSid);

        console.info('[TwilioRecording] Recording URL saved for callSid:', callSid);
      } catch (dbErr) {
        console.warn('[TwilioRecording] DB update failed:', dbErr);
      }
    }

    return NextResponse.json({ received: true, callSid, recordingSid });
  } catch (err) {
    console.error('[TwilioRecording] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
