import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { startVapiCall } from '@/lib/vapiServer';

const LATE_WINDOW_MS = 5 * 60 * 1000;

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return value.startsWith('+') ? `+${digits}` : null;
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const now = Date.now();
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
      await db.from('interview_sessions').update({ execution_status: 'STARTED', execution_started_at: new Date().toISOString(), execution_error: null, updated_at: new Date().toISOString() }).eq('id', session.id);
      console.info('scheduled_vapi_interview_started', { interviewId: session.id, candidateId: candidate.id, providerCallId: call.id });
      started += 1;
    } catch (dispatchError) {
      const safeError = dispatchError instanceof Error ? dispatchError.message : 'Unable to start scheduled interview';
      await db.from('interview_sessions').update({ execution_status: 'FAILED', execution_error: safeError, updated_at: new Date().toISOString() }).eq('id', session.id);
    }
  }

  return NextResponse.json({ ok: true, inspected: due?.length || 0, started, missed });
}