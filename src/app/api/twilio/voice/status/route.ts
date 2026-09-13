'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function mapOutcome(answeredBy: string | null, callStatus: string | null) {
  const answer = (answeredBy || '').toLowerCase();
  if (answer.startsWith('machine') || answer === 'fax') return 'voicemail';
  if (answer === 'human') return 'connected';
  if (callStatus === 'busy') return 'busy';
  if (callStatus === 'no-answer') return 'no_answer';
  if (callStatus === 'failed' || callStatus === 'canceled') return 'failed';
  return null;
}

async function endMachineCall(callSid: string) {
  const authSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const accountSid = authSid?.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN?.trim() : authSid;
  if (!authSid || !authToken || !accountSid) return;
  const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${encodeURIComponent(callSid)}.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ Status: 'completed' }).toString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData().catch(() => new FormData());
    const callSid = formData.get('CallSid') as string | null;
    const callStatus = formData.get('CallStatus') as string | null;
    const answeredBy = formData.get('AnsweredBy') as string | null;
    const duration = Number(formData.get('CallDuration') || 0);
    const outcome = mapOutcome(answeredBy, callStatus);
    if (!callSid) return NextResponse.json({ received: true });

    const db = getSupabaseAdmin();
    const update = {
      call_outcome: outcome,
      duration_seconds: Number.isFinite(duration) ? duration : 0,
      is_in_progress: !['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus || ''),
      updated_at: new Date().toISOString(),
    };
    await db.from('call_sessions').update(update).eq('call_sid', callSid);

    if (outcome) {
      const logUpdate = {
        outcome,
        duration_seconds: update.duration_seconds,
        metadata: { answered_by: answeredBy, call_status: callStatus },
      };
      await db.from('outreach_call_log').update(logUpdate).eq('call_sid', callSid);
      if (outcome === 'voicemail') await endMachineCall(callSid);
    }

    return NextResponse.json({ received: true, callSid, answeredBy, callStatus, outcome });
  } catch (error) {
    console.error('[TwilioStatus] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
