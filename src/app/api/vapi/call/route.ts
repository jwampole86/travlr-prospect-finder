import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startVapiCall } from '@/lib/vapiServer';

const MANUAL_START_LATE_WINDOW_MINUTES = 300;
const LATE_WINDOW_GRACE_MINUTES = 5;

function normalizeE164(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    const normalized = `+${digits}`;
    return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

type CallRequest = {
  interviewId?: string;
  candidateId?: string;
  to?: string;
  candidateName?: string;
  variableValues?: Record<string, string>;
};

function asInterviewText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length > 0) {
    return value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .filter(Boolean)
      .join('\n- ');
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await request.json()) as CallRequest;
    let to = body.to ? normalizeE164(body.to) : null;
    let candidateName = body.candidateName?.trim() || undefined;
    let variableValues = body.variableValues;

    if (body.interviewId) {
      const { data: interview, error: interviewError } = await supabase
        .from('interview_sessions')
        .select('id, candidate_id, scheduled_at, status')
        .eq('id', body.interviewId)
        .single();
      if (interviewError || !interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
      if (interview.status !== 'scheduled') return NextResponse.json({ error: 'This interview is no longer scheduled' }, { status: 409 });
      const minutesLate = (Date.now() - new Date(interview.scheduled_at).getTime()) / 60000;
      if (minutesLate > MANUAL_START_LATE_WINDOW_MINUTES + LATE_WINDOW_GRACE_MINUTES) return NextResponse.json({ error: 'This interview is more than 5 hours past its scheduled time. Reschedule it before calling.' }, { status: 409 });
      if (!body.candidateId) body.candidateId = interview.candidate_id || undefined;
    }

    if (body.candidateId) {
      const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .select('id, full_name, phone, professional_summary, work_experience, skills, relevant_systems, strengths, concerns, resume_highlights')
        .eq('id', body.candidateId)
        .single();

      if (candidateError || !candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
      }

      to = normalizeE164(candidate.phone || '');
      candidateName = candidate.full_name;
      variableValues = {
        ...(body.interviewId ? { interviewId: body.interviewId } : {}),
        candidateId: candidate.id,
        candidateName: candidate.full_name,
        roleTitle: 'TRAVLR Outreach & Business Development Agent',
        resumeSummary: asInterviewText(candidate.professional_summary, 'No resume summary is available.'),
        relevantExperience: asInterviewText(candidate.work_experience, 'No additional relevant experience is available.'),
        candidateStrengths: asInterviewText(candidate.strengths, 'No specific strengths have been identified.'),
        riskAreas: asInterviewText(candidate.concerns, 'No specific risk areas have been identified.'),
        claimsToValidate: asInterviewText(candidate.resume_highlights, 'No specific resume claims have been flagged.'),
        recommendedInterviewFocus: asInterviewText(candidate.concerns, 'Conduct the standard TRAVLR structured interview.'),
      };
    }

    if (!to) {
      return NextResponse.json({ error: body.candidateId ? 'Candidate phone number is missing or invalid' : 'A valid destination phone number is required' }, { status: 400 });
    }

    const call = await startVapiCall({
      to,
      candidateName,
      variableValues,
    });

    if (body.interviewId) {
      await supabase.from('interview_sessions').update({
        provider: 'VAPI',
        provider_call_id: call.id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        execution_status: 'STARTED',
        execution_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', body.interviewId);
    }

    console.info('vapi_call_started', { userId: user.id, providerCallId: call.id });
    return NextResponse.json({ ok: true, callId: call.id, status: call.status ?? 'queued' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const configurationError = /is not configured/.test(message);
    console.error('vapi_call_failed', { userId: user.id, configurationError, message });
    return NextResponse.json(
      { error: configurationError ? 'Vapi configuration is incomplete' : message || 'Unable to start Vapi call' },
      { status: configurationError ? 503 : 502 },
    );
  }
}