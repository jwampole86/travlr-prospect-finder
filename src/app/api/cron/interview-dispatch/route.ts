import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { startVapiCall, stopVapiCall } from '@/lib/vapiServer';

const LATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_IN_PROGRESS_MS = 35 * 60 * 1000;

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return value.startsWith('+') ? `+${digits}` : null;
}

async function stopOverlongInterviews(db: ReturnType<typeof getSupabaseAdmin>, now: number) {
  const { data: activeSessions, error } = await db
    .from('interview_sessions')
    .select('id, provider_call_id, provider, started_at, execution_started_at')
    .eq('status', 'in_progress')
    .not('provider_call_id', 'is', null)
    .limit(50);

  if (error) throw error;

  let timedOut = 0;
  let timeoutStopFailures = 0;

  for (const session of activeSessions || []) {
    const startedAt = session.execution_started_at || session.started_at;
    if (!startedAt || new Date(startedAt).getTime() > now - MAX_IN_PROGRESS_MS) continue;

    try {
      await stopVapiCall(session.provider_call_id);
      const endedAt = new Date().toISOString();
      await db
        .from('interview_sessions')
        .update({
          status: 'completed',
          ended_reason: 'auto_stopped_duration_limit',
          execution_status: 'COMPLETED',
          ended_at: endedAt,
          updated_at: endedAt,
        })
        .eq('id', session.id)
        .eq('status', 'in_progress');
      timedOut += 1;
      console.info('vapi_interview_auto_stopped_duration_limit', { interviewId: session.id, providerCallId: session.provider_call_id });
    } catch (stopError) {
      timeoutStopFailures += 1;
      const message = stopError instanceof Error ? stopError.message : 'Unable to stop overlong interview';
      await db
        .from('interview_sessions')
        .update({ execution_error: message, updated_at: new Date().toISOString() })
        .eq('id', session.id)
        .eq('status', 'in_progress');
      console.error('vapi_interview_auto_stop_failed', { interviewId: session.id, providerCallId: session.provider_call_id, error: message });
    }
  }

  return { timedOut, timeoutStopFailures };
}

// Safety net: the TEST candidate must always stay callable in "scheduled" — never linger as completed/failed/etc,
// regardless of any webhook timing/race condition.
async function resetTestCandidateSessions(db: ReturnType<typeof getSupabaseAdmin>) {
  const { data: testCandidates } = await db.from('candidates').select('id').ilike('full_name', 'TEST');
  const testCandidateIds = (testCandidates || []).map((c) => c.id);
  if (testCandidateIds.length === 0) return 0;

  const { data: stray } = await db
    .from('interview_sessions')
    .select('id')
    .in('candidate_id', testCandidateIds)
    .neq('status', 'scheduled');
  if (!stray || stray.length === 0) return 0;

  await db.from('interview_sessions').update({
    status: 'scheduled',
    provider_call_id: null,
    started_at: null,
    ended_at: null,
    ended_reason: null,
    duration_seconds: null,
    summary: null,
    summary_status: null,
    execution_status: 'QUEUED',
    execution_started_at: null,
    execution_error: null,
    auto_start_enabled: false,
    updated_at: new Date().toISOString(),
  }).in('id', stray.map((s) => s.id));

  return stray.length;
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const now = Date.now();
  const timeoutResult = await stopOverlongInterviews(db, now).catch((timeoutErr) => {
    console.error('vapi_stop_overlong_check_failed', { error: timeoutErr instanceof Error ? timeoutErr.message : 'unknown' });
    return { timedOut: 0, timeoutStopFailures: 0 };
  });
  const testCandidatesReset = await resetTestCandidateSessions(db).catch((testErr) => {
    console.error('vapi_test_candidate_reset_failed', { error: testErr instanceof Error ? testErr.message : 'unknown' });
    return 0;
  });
  const { data: due, error } = await db
    .from('interview_sessions')
    .select('id, candidate_id, scheduled_at, execution_status')
    .eq('auto_start_enabled', true)
    .eq('execution_status', 'QUEUED')
    .lte('scheduled_at', new Date(now).toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(25);

  if (error) return NextResponse.json({ error: 'Unable to load due interviews' }, { status: 500 });

  let started = 0;
  let missed = 0;
  for (const session of due || []) {
    const scheduledAt = new Date(session.scheduled_at).getTime();
    if (now - scheduledAt > LATE_WINDOW_MS) {
      await db.from('interview_sessions').update({ execution_status: 'MISSED', execution_error: 'Automatic execution window was missed.', updated_at: new Date().toISOString() }).eq('id', session.id).eq('execution_status', 'QUEUED');
      missed += 1;
      continue;
    }

    const claimTime = new Date().toISOString();
    const { data: claimed } = await db
      .from('interview_sessions')
      .update({ execution_status: 'CLAIMED', execution_claimed_at: claimTime, last_execution_attempt_at: claimTime, updated_at: claimTime })
      .eq('id', session.id)
      .eq('execution_status', 'QUEUED')
      .select('id, candidate_id')
      .maybeSingle();
    if (!claimed || !session.candidate_id) continue;

    try {
      const { data: candidate, error: candidateError } = await db.from('candidates').select('id, full_name, phone, professional_summary, work_experience, strengths, concerns, resume_highlights').eq('id', session.candidate_id).single();
      if (candidateError || !candidate) throw new Error('Candidate not found');
      const phone = normalizePhone(candidate.phone || '');
      if (!phone) throw new Error('Candidate phone number is missing or invalid');
      const variableValues = {
        candidateId: candidate.id,
        interviewId: session.id,
        candidateName: candidate.full_name,
        roleTitle: 'TRAVLR Outreach & Business Development Agent',
        resumeSummary: candidate.professional_summary || 'No resume summary is available.',
        relevantExperience: JSON.stringify(candidate.work_experience || []),
        candidateStrengths: JSON.stringify(candidate.strengths || []),
        riskAreas: JSON.stringify(candidate.concerns || []),
        claimsToValidate: JSON.stringify(candidate.resume_highlights || []),
        recommendedInterviewFocus: JSON.stringify(candidate.concerns || []),
      };
      const call = await startVapiCall({ to: phone, candidateName: candidate.full_name, variableValues });
      await db.from('interview_sessions').update({ provider: 'VAPI', provider_call_id: call.id, status: 'in_progress', execution_status: 'STARTED', execution_started_at: new Date().toISOString(), execution_error: null, updated_at: new Date().toISOString() }).eq('id', session.id);
      console.info('scheduled_vapi_interview_started', { interviewId: session.id, candidateId: candidate.id, providerCallId: call.id });
      started += 1;
    } catch (dispatchError) {
      const safeError = dispatchError instanceof Error ? dispatchError.message : 'Unable to start scheduled interview';
      await db.from('interview_sessions').update({ execution_status: 'FAILED', execution_error: safeError, updated_at: new Date().toISOString() }).eq('id', session.id);
    }
  }

  return NextResponse.json({ ok: true, inspected: due?.length || 0, started, missed, testCandidatesReset, ...timeoutResult });
}