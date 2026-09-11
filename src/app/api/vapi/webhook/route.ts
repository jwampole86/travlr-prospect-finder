import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function getMessagePayload(body: any) {
  return body?.message || body;
}

function getCallId(message: any): string | null {
  return message?.call?.id || message?.callId || message?.call?.providerCallId || null;
}

function getTranscript(message: any) {
  const transcript = message?.artifact?.transcript || message?.transcript || '';
  const messages = message?.artifact?.messages || message?.transcriptMessages || message?.messages || null;
  return {
    transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript || ''),
    messages,
  };
}

function mapEndedReason(endedReason: unknown): 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled' {
  const reason = String(endedReason || '').toLowerCase();
  if (reason.includes('no-answer') || reason.includes('no answer') || reason.includes('voicemail')) return 'no_answer';
  if (reason.includes('busy') || reason.includes('line-busy')) return 'busy';
  if (reason.includes('cancel') || reason.includes('customer-did-not-give-consent')) return 'cancelled';
  if (reason.includes('error') || reason.includes('failed') || reason.includes('provider')) return 'failed';
  return 'completed';
}

async function generateSummary(input: { candidateName: string; roleTitle: string; resumeSummary: string; strengths: unknown; concerns: unknown; transcript: string }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.transcript.trim()) return null;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system: 'You are a recruiting interviewer analyst for TRAVLR Vacation Homes. Use only evidence in the resume context and transcript. Never invent evidence, protected characteristics, or hiring decisions. The result is advisory and requires human review.',
    messages: [{
      role: 'user',
      content: `Create a concise, evidence-based admin interview summary for ${input.candidateName} interviewing for ${input.roleTitle}.

RESUME SUMMARY:
${input.resumeSummary}

PRE-INTERVIEW STRENGTHS:
${JSON.stringify(input.strengths || [])}

AREAS TO VALIDATE:
${JSON.stringify(input.concerns || [])}

TRANSCRIPT:
${input.transcript.slice(0, 30000)}

Return plain text with these headings:
Overall assessment
Evidence from interview
Strengths demonstrated
Concerns or follow-up questions
Recommended human follow-up

Do not make an automatic hire or reject decision.`,
    }],
  });
  const block = response.content.find((item) => item.type === 'text');
  return block?.type === 'text' ? block.text.trim() : null;
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.VAPI_WEBHOOK_SECRET;
  const customSecret = request.headers.get('x-vapi-secret');
  const authorization = request.headers.get('authorization');
  const bearerSecret = authorization?.replace(/^Bearer\s+/i, '');
  const webhookAuthorized = customSecret === configuredSecret || bearerSecret === configuredSecret;
  if (configuredSecret && !webhookAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const message = getMessagePayload(body);
    const callId = getCallId(message);
    if (!callId) return NextResponse.json({ ok: true, ignored: true });

    const db = getSupabaseAdmin();
    const { data: session, error } = await db.from('interview_sessions').select('id, candidate_id, role_title, status').eq('provider_call_id', callId).maybeSingle();
    if (error || !session) {
      console.warn('vapi_webhook_unresolved', { providerCallId: callId });
      return NextResponse.json({ ok: true, unresolved: true });
    }

    const eventType = message?.type || message?.event || body?.type;
    const status = message?.status || message?.call?.status;
    const { data: candidate } = await db.from('candidates').select('full_name, professional_summary, strengths, concerns').eq('id', session.candidate_id).maybeSingle();
    const timestamps = {
      started_at: message?.call?.startedAt || message?.startedAt || undefined,
      ended_at: message?.call?.endedAt || message?.endedAt || undefined,
      duration_seconds: message?.durationSeconds || message?.call?.durationSeconds || undefined,
      ended_reason: message?.endedReason || message?.call?.endedReason || undefined,
    };

    if (eventType === 'status-update' || status) {
      const mappedStatus = status === 'in-progress' ? 'in_progress' : undefined;
      const endedStatus = status === 'ended' ? mapEndedReason(timestamps.ended_reason) : undefined;
      await db.from('interview_sessions').update({
        ...(mappedStatus ? { status: mappedStatus } : endedStatus ? { status: endedStatus } : {}),
        ...timestamps,
        updated_at: new Date().toISOString(),
      }).eq('id', session.id).eq('status', 'in_progress');
    }

    if (eventType === 'end-of-call-report' || message?.artifact || message?.endedReason || status === 'ended') {
      const transcriptData = getTranscript(message);
      const summary = await generateSummary({
        candidateName: candidate?.full_name || 'Candidate',
        roleTitle: session.role_title,
        resumeSummary: candidate?.professional_summary || 'No resume summary available.',
        strengths: candidate?.strengths,
        concerns: candidate?.concerns,
        transcript: transcriptData.transcript,
      }).catch((summaryError) => {
        console.error('vapi_summary_failed', { interviewId: session.id, error: summaryError instanceof Error ? summaryError.message : 'unknown' });
        return null;
      });

      const finalStatus = mapEndedReason(timestamps.ended_reason);
      await db.from('interview_sessions').update({
        ...(session.status === 'in_progress' ? { status: finalStatus } : {}),
        ...timestamps,
        transcript: transcriptData.transcript,
        transcript_messages: transcriptData.messages,
        summary: summary || null,
        summary_status: summary ? 'COMPLETED' : 'FAILED',
        summary_generated_at: summary ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', session.id);

      // Permanent test fixture — always reset back to callable after any call ends.
      if (candidate?.full_name?.trim().toUpperCase() === 'TEST') {
        await db.from('interview_sessions').update({
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
        }).eq('id', session.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('vapi_webhook_failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}