import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { displayLocalDateTime, localDateTimeParts, localDateTimeToUtc, resolveInterviewTimezone } from '@/lib/interviewScheduling';

function extractCallId(body: any) {
  return body?.callId || body?.call?.id || body?.message?.call?.id || null;
}

function authorized(request: NextRequest) {
  const configured = process.env.VAPI_TOOL_SECRET || process.env.VAPI_WEBHOOK_SECRET;
  if (!configured) return false;
  const supplied = request.headers.get('x-vapi-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return supplied === configured;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const interviewId = typeof body.interviewId === 'string' ? body.interviewId : '';
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
    const callId = extractCallId(body);
    const timezone = resolveInterviewTimezone(body.scheduledTimezone || body.candidateTimezone);
    const scheduledAtInput = typeof body.selectedScheduledAt === 'string' ? body.selectedScheduledAt : '';
    if (!interviewId || !candidateId || !callId || !scheduledAtInput) return NextResponse.json({ error: 'interviewId, candidateId, callId, and selectedScheduledAt are required' }, { status: 400 });

    const scheduledAt = new Date(scheduledAtInput);
    if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: 'selectedScheduledAt is invalid' }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: interview, error: interviewError } = await db
      .from('interview_sessions')
      .select('id, candidate_id, provider_call_id, status')
      .eq('id', interviewId)
      .eq('provider_call_id', callId)
      .single();
    if (interviewError || !interview || !interview.candidate_id || interview.candidate_id !== candidateId) return NextResponse.json({ error: 'Live interview could not be reconciled' }, { status: 403 });
    if (interview.status !== 'in_progress') return NextResponse.json({ error: 'Interview is not active' }, { status: 409 });

    const localParts = localDateTimeParts(scheduledAt, timezone);
    const expectedUtc = localDateTimeToUtc(localParts.date, localParts.time, timezone);
    if (Math.abs(expectedUtc.getTime() - scheduledAt.getTime()) > 60_000) return NextResponse.json({ error: 'Selected time does not match its timezone' }, { status: 400 });

    const { data: result, error: rpcError } = await db.rpc('reschedule_interview_atomically', {
      p_interview_id: interviewId,
      p_new_scheduled_at: scheduledAt.toISOString(),
      p_new_local_date: body.scheduledLocalDate || localParts.date,
      p_new_local_time: body.scheduledLocalTime || localParts.time,
      p_new_timezone: timezone,
      p_reason: 'CANDIDATE_REQUESTED_RESCHEDULE',
      p_changed_by_type: 'VAPI_AI_ASSISTANT',
      p_provider_call_id: callId,
      p_buffer_minutes: 5,
    });
    if (rpcError) throw rpcError;
    const booking = Array.isArray(result) ? result[0] : result;
    if (!booking?.ok) return NextResponse.json({ ok: false, reason: booking?.reason || 'SLOT_NO_LONGER_AVAILABLE' }, { status: 409 });

    return NextResponse.json({
      ok: true,
      status: 'RESCHEDULED',
      timezone,
      display: displayLocalDateTime(scheduledAt, timezone),
      scheduledAt: scheduledAt.toISOString(),
      endCall: true,
    });
  } catch (error) {
    console.error('vapi_reschedule_failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ ok: false, reason: 'RESCHEDULE_REQUIRES_HUMAN_FOLLOWUP' }, { status: 500 });
  }
}
