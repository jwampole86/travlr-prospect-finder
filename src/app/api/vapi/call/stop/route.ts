import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stopVapiCall } from '@/lib/vapiServer';

type StopCallRequest = {
  interviewId?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await request.json()) as StopCallRequest;
    if (!body.interviewId) {
      return NextResponse.json({ error: 'Interview ID is required' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions')
      .select('id, provider_call_id, status, candidate_id')
      .eq('id', body.interviewId)
      .single();

    if (sessionError || !session) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    if (session.status !== 'in_progress') {
      return NextResponse.json({ error: 'This interview is no longer active' }, { status: 409 });
    }
    if (!session.provider_call_id) {
      return NextResponse.json({ error: 'No provider call is attached to this interview' }, { status: 409 });
    }

    await stopVapiCall(session.provider_call_id);

    let isTestCandidate = false;
    if (session.candidate_id) {
      const { data: candidate } = await supabase.from('candidates').select('full_name').eq('id', session.candidate_id).maybeSingle();
      isTestCandidate = candidate?.full_name?.trim().toUpperCase() === 'TEST';
    }

    const { error: updateError } = await supabase
      .from('interview_sessions')
      .update(
        isTestCandidate
          ? {
              status: 'scheduled',
              provider_call_id: null,
              started_at: null,
              ended_at: null,
              ended_reason: null,
              duration_seconds: null,
              execution_status: 'QUEUED',
              execution_started_at: null,
              execution_error: null,
              auto_start_enabled: false,
              updated_at: new Date().toISOString(),
            }
          : {
              status: 'cancelled',
              ended_reason: 'cancelled_by_admin',
              execution_status: 'CANCELLED',
              ended_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
      )
      .eq('id', body.interviewId)
      .eq('status', 'in_progress');

    if (updateError) throw updateError;
    console.info('vapi_call_stopped', { userId: user.id, interviewId: body.interviewId });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const configurationError = /is not configured/.test(message);
    console.error('vapi_call_stop_failed', { userId: user.id, configurationError });
    return NextResponse.json(
      { error: configurationError ? 'Vapi configuration is incomplete' : 'Unable to stop Vapi call' },
      { status: configurationError ? 503 : 502 },
    );
  }
}