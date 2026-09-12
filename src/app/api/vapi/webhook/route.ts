import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { OUTREACH_BIZDEV_JOB_DESCRIPTION } from '@/lib/roles/outreachBizDevRole';

const SCORECARD_COMPETENCY_KEYS = [
  'vacation_rental_knowledge', 'property_management_knowledge', 'luxury_homeowner_communication',
  'outbound_calling_ability', 'consultative_sales', 'discovery_questioning', 'objection_handling',
  'closing_ability', 'follow_up_discipline', 'crm_pipeline_management', 'relationship_building',
  'professional_communication', 'self_motivation', 'remote_work_discipline', 'coachability',
  'operational_understanding', 'business_development', 'judgment', 'organization', 'overall_fit',
] as const;

function getMessagePayload(body: any) {
  return body?.message || body;
}

function getRecordingUrl(message: any): string | null {
  // presignedMonoUrl/presignedStereoUrl are directly downloadable; recordingUrl/stereoRecordingUrl require additional signing and 400 on plain GET.
  return message?.artifact?.presignedMonoUrl || message?.artifact?.presignedStereoUrl
    || message?.artifact?.recordingUrl || message?.artifact?.stereoRecordingUrl
    || message?.recordingUrl || message?.stereoRecordingUrl || message?.call?.recordingUrl || null;
}

function buildTranscriptSegments(transcriptText: string, messages: unknown) {
  if (Array.isArray(messages)) {
    return messages
      .map((item: any, index: number) => {
        const text = typeof item?.message === 'string' ? item.message : typeof item?.content === 'string' ? item.content : '';
        if (!text.trim()) return null;
        const seconds = typeof item?.secondsFromStart === 'number' ? item.secondsFromStart : index * 30;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return {
          id: `vapi-${index}`,
          speaker: typeof item?.role === 'string' ? item.role : 'Speaker',
          text: text.trim(),
          timestamp: `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
          start_seconds: seconds,
        };
      })
      .filter(Boolean);
  }
  return transcriptText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const splitIndex = line.indexOf(':');
      return {
        id: `vapi-line-${index}`,
        speaker: splitIndex > 0 ? line.slice(0, splitIndex).trim() : 'Speaker',
        text: splitIndex > 0 ? line.slice(splitIndex + 1).trim() : line,
        timestamp: `${String(Math.floor((index * 30) / 60)).padStart(2, '0')}:${String((index * 30) % 60).padStart(2, '0')}`,
        start_seconds: index * 30,
      };
    });
}

async function saveCallRecording(db: ReturnType<typeof getSupabaseAdmin>, sessionId: string, recordingUrl: string, durationSeconds: number | undefined, transcriptText: string, transcriptMessages: unknown) {
  const audioResponse = await fetch(recordingUrl);
  if (!audioResponse.ok) throw new Error(`Failed to download recording (${audioResponse.status})`);
  const contentType = audioResponse.headers.get('content-type') || 'audio/wav';
  const extension = contentType.includes('mp3') ? 'mp3' : contentType.includes('mpeg') ? 'mp3' : 'wav';
  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  const storagePath = `vapi/${sessionId}.${extension}`;

  const { error: uploadError } = await db.storage
    .from('interview-recordings')
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const segments = buildTranscriptSegments(transcriptText, transcriptMessages);
  const recordingRow = {
    session_id: sessionId,
    storage_path: storagePath,
    file_name: `vapi-interview-${sessionId}.${extension}`,
    file_size_bytes: buffer.byteLength,
    duration_seconds: durationSeconds || 0,
    mime_type: contentType,
    transcript: segments,
    transcript_text: transcriptText,
    transcript_status: 'completed' as const,
    timestamp_markers: [],
  };

  const { data: existing } = await db.from('interview_audio_recordings').select('id').eq('session_id', sessionId).maybeSingle();
  if (existing) {
    await db.from('interview_audio_recordings').update(recordingRow).eq('id', existing.id);
  } else {
    await db.from('interview_audio_recordings').insert(recordingRow);
  }
}

async function generateRoleScorecard(input: { candidateName: string; roleTitle: string; resumeSummary: string; transcript: string }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.transcript.trim()) return null;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are an expert interview evaluator for TRAVLR Vacation Homes. Score strictly against the provided role requirements using only evidence present in the transcript. Never fabricate evidence. Never infer protected characteristics. This is advisory only — a human always makes the final hire decision.',
    messages: [{
      role: 'user',
      content: `Evaluate this AI-conducted phone interview transcript for ${input.candidateName} against the role requirements below. Score each competency 1-10 based only on evidence in the transcript. If a competency was not addressed, score conservatively (use 5) rather than fabricate evidence.

ROLE REQUIREMENTS:
${input.roleTitle === 'TRAVLR Outreach & Business Development Agent' ? OUTREACH_BIZDEV_JOB_DESCRIPTION : `Role: ${input.roleTitle}`}

CANDIDATE RESUME SUMMARY:
${input.resumeSummary}

INTERVIEW TRANSCRIPT:
${input.transcript.slice(0, 30000)}

Return ONLY a valid JSON object with these integer fields (1-10 each): ${SCORECARD_COMPETENCY_KEYS.join(', ')}, plus "hire_recommendation" (one of STRONG_YES, YES, MAYBE, NO, PENDING) and "interviewer_notes" (a short evidence-based paragraph). Use PENDING if the transcript is too short or inconclusive to judge.`,
    }],
  });
  const block = response.content.find((item) => item.type === 'text');
  const rawText = block?.type === 'text' ? block.text.trim() : '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const scores: Record<string, number> = {};
    for (const key of SCORECARD_COMPETENCY_KEYS) {
      const value = Number(parsed[key]);
      scores[key] = Number.isFinite(value) ? Math.min(10, Math.max(1, Math.round(value))) : 5;
    }
    return {
      ...scores,
      hire_recommendation: ['STRONG_YES', 'YES', 'MAYBE', 'NO', 'PENDING'].includes(parsed.hire_recommendation) ? parsed.hire_recommendation : 'PENDING',
      interviewer_notes: typeof parsed.interviewer_notes === 'string' ? `[AI-generated from Vapi interview — requires human review] ${parsed.interviewer_notes}` : '[AI-generated from Vapi interview — requires human review]',
    };
  } catch {
    return null;
  }
}

async function saveRoleScorecard(db: ReturnType<typeof getSupabaseAdmin>, candidateId: string, scorecard: Record<string, unknown>) {
  await db.from('candidate_scorecards').insert({ candidate_id: candidateId, ...scorecard });
  await db.from('candidates').update({ candidate_status: 'INTERVIEWED', updated_at: new Date().toISOString() }).eq('id', candidateId);
  await db.from('candidate_audit_events').insert({
    candidate_id: candidateId,
    event_type: 'INTERVIEW_COMPLETED',
    event_data: { source: 'vapi_ai_interview', overall_fit: scorecard.overall_fit, hire_recommendation: scorecard.hire_recommendation },
  });
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Vapi's webhook payload can arrive before the recording/transcript artifact finishes processing.
// Poll the call directly so we always persist the finalized transcript, messages, and recording URL.
async function fetchFinalizedCallArtifact(callId: string) {
  const apiKey = process.env.VAPI_PRIVATE_API_KEY;
  if (!apiKey) return null;

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(2500);
    try {
      const response = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const body = await response.json().catch(() => null);
      const artifact = body?.artifact;
      if (!artifact) continue;
      const transcript = typeof artifact.transcript === 'string' ? artifact.transcript : '';
      const recordingUrl = artifact.presignedMonoUrl || artifact.presignedStereoUrl || artifact.recordingUrl || artifact.stereoRecordingUrl || null;
      const startedAt = body?.startedAt ? new Date(body.startedAt).getTime() : null;
      const endedAt = body?.endedAt ? new Date(body.endedAt).getTime() : null;
      const computedDuration = startedAt && endedAt && endedAt > startedAt ? Math.round((endedAt - startedAt) / 1000) : undefined;
      const result = {
        transcript,
        messages: artifact.messages || null,
        recordingUrl,
        startedAt: body?.startedAt || undefined,
        endedAt: body?.endedAt || undefined,
        durationSeconds: typeof body?.durationSeconds === 'number' ? body.durationSeconds : computedDuration,
        endedReason: body?.endedReason || undefined,
      };
      // Keep polling briefly until both transcript and recording are ready, otherwise return whatever we have on the last attempt.
      if ((transcript && recordingUrl) || attempt === maxAttempts - 1) return result;
    } catch {
      continue;
    }
  }
  return null;
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

      // Permanent test fixture — reset immediately so it never lingers as "completed", even briefly.
      if (endedStatus && candidate?.full_name?.trim().toUpperCase() === 'TEST') {
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

    if (eventType === 'end-of-call-report' || status === 'ended') {
      const finalizedArtifact = await fetchFinalizedCallArtifact(callId).catch(() => null);
      const webhookTranscript = getTranscript(message);
      const transcriptData = {
        transcript: finalizedArtifact?.transcript || webhookTranscript.transcript,
        messages: finalizedArtifact?.messages || webhookTranscript.messages,
      };
      if (finalizedArtifact?.durationSeconds) timestamps.duration_seconds = finalizedArtifact.durationSeconds;
      if (finalizedArtifact?.endedReason) timestamps.ended_reason = finalizedArtifact.endedReason;
      if (finalizedArtifact?.startedAt) timestamps.started_at = finalizedArtifact.startedAt;
      if (finalizedArtifact?.endedAt) timestamps.ended_at = finalizedArtifact.endedAt;

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
      } else {
        const recordingUrl = finalizedArtifact?.recordingUrl || getRecordingUrl(message);
        if (recordingUrl) {
          await saveCallRecording(db, session.id, recordingUrl, timestamps.duration_seconds, transcriptData.transcript, transcriptData.messages).catch((recordingError) => {
            console.error('vapi_recording_save_failed', { interviewId: session.id, error: recordingError instanceof Error ? recordingError.message : 'unknown' });
          });
        }

        if (session.candidate_id) {
          const roleScorecard = await generateRoleScorecard({
            candidateName: candidate?.full_name || 'Candidate',
            roleTitle: session.role_title,
            resumeSummary: candidate?.professional_summary || 'No resume summary available.',
            transcript: transcriptData.transcript,
          }).catch((scorecardError) => {
            console.error('vapi_scorecard_failed', { interviewId: session.id, error: scorecardError instanceof Error ? scorecardError.message : 'unknown' });
            return null;
          });
          if (roleScorecard) {
            await saveRoleScorecard(db, session.candidate_id, roleScorecard).catch((saveError) => {
              console.error('vapi_scorecard_save_failed', { interviewId: session.id, error: saveError instanceof Error ? saveError.message : 'unknown' });
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('vapi_webhook_failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}