import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  INTERVIEW_BUFFER_MINUTES,
  INTERVIEW_DURATION_MINUTES,
  INTERVIEW_MIN_LEAD_MINUTES,
  INTERVIEW_SLOT_INTERVAL_MINUTES,
  addLocalDays,
  displayLocalDateTime,
  localDateTimeParts,
  localDateTimeToUtc,
  localWeekday,
  matchesPreferredTime,
  resolveInterviewTimezone,
} from '@/lib/interviewScheduling';

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
    if (!interviewId || !candidateId || !callId) return NextResponse.json({ error: 'interviewId, candidateId, and callId are required' }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: interview, error: interviewError } = await db
      .from('interview_sessions')
      .select('id, candidate_id, candidate_name, provider_call_id, scheduled_timezone, duration_minutes, status')
      .eq('id', interviewId)
      .eq('provider_call_id', callId)
      .single();
    if (interviewError || !interview || !interview.candidate_id || interview.candidate_id !== candidateId) return NextResponse.json({ error: 'Live interview could not be reconciled' }, { status: 403 });
    if (interview.status !== 'in_progress') return NextResponse.json({ error: 'Interview is not active' }, { status: 409 });

    const timezone = resolveInterviewTimezone(body.candidateTimezone || interview.scheduled_timezone);
    const preferredDate = typeof body.preferredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate)
      ? body.preferredDate
      : localDateTimeParts(new Date(), timezone).date;
    const searchDays = Math.min(Math.max(Number(body.searchDays) || 7, 1), 14);
    const rangeStart = localDateTimeToUtc(preferredDate, '00:00:00', timezone).toISOString();
    const rangeEnd = localDateTimeToUtc(addLocalDays(preferredDate, searchDays + 1), '00:00:00', timezone).toISOString();
    const { data: existing, error: existingError } = await db
      .from('interview_sessions')
      .select('id, scheduled_at, duration_minutes, status')
      .gte('scheduled_at', rangeStart)
      .lt('scheduled_at', rangeEnd)
      .in('status', ['scheduled', 'in_progress']);
    if (existingError) throw existingError;

    const nowWithLead = Date.now() + INTERVIEW_MIN_LEAD_MINUTES * 60_000;
    const slots: Array<{ startLocal: string; endLocal: string; scheduledAt: string; display: string }> = [];
    for (let dayOffset = 0; dayOffset <= searchDays && slots.length < 4; dayOffset += 1) {
      const date = addLocalDays(preferredDate, dayOffset);
      if ([0, 6].includes(localWeekday(date))) continue;
      for (let minutes = 9 * 60; minutes < 17 * 60 && slots.length < 4; minutes += INTERVIEW_SLOT_INTERVAL_MINUTES) {
        const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
        const minute = String(minutes % 60).padStart(2, '0');
        const localTime = `${hour}:${minute}:00`;
        if (!matchesPreferredTime(localTime, body.preferredTime, body.preferredTimeOfDay)) continue;
        const start = localDateTimeToUtc(date, localTime, timezone);
        const end = new Date(start.getTime() + INTERVIEW_DURATION_MINUTES * 60_000);
        if (start.getTime() < nowWithLead) continue;
        const conflict = (existing || []).some((other) => {
          if (other.id === interviewId) return false;
          const otherStart = new Date(other.scheduled_at).getTime();
          const otherEnd = otherStart + (Number(other.duration_minutes) || INTERVIEW_DURATION_MINUTES) * 60_000;
          return start.getTime() < otherEnd + INTERVIEW_BUFFER_MINUTES * 60_000 && end.getTime() + INTERVIEW_BUFFER_MINUTES * 60_000 > otherStart;
        });
        if (conflict) continue;
        slots.push({
          startLocal: `${date}T${localTime}`,
          endLocal: `${date}T${String(Math.floor((minutes + INTERVIEW_DURATION_MINUTES) / 60)).padStart(2, '0')}:${String((minutes + INTERVIEW_DURATION_MINUTES) % 60).padStart(2, '0')}:00`,
          scheduledAt: start.toISOString(),
          display: displayLocalDateTime(start, timezone),
        });
      }
    }

    return NextResponse.json({ ok: true, timezone, slots });
  } catch (error) {
    console.error('vapi_availability_failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Unable to retrieve interview availability' }, { status: 500 });
  }
}
