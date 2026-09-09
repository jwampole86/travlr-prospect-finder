import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as File | null;
    const recordingId = formData.get('recording_id') as string | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Forward to the existing speech-to-text route
    const sttFormData = new FormData();
    sttFormData.append('provider', 'OPEN_AI');
    sttFormData.append('model', 'whisper-1');
    sttFormData.append('file', audioFile);
    sttFormData.append('parameters', JSON.stringify({
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: 'en',
    }));

    const sttRes = await fetch(`${req.nextUrl.origin}/api/ai/speech-to-text`, {
      method: 'POST',
      body: sttFormData,
    });

    if (!sttRes.ok) {
      const err = await sttRes.json().catch(() => ({}));
      return NextResponse.json({ error: err.error || 'Transcription failed' }, { status: 500 });
    }

    const transcriptionData = await sttRes.json();
    const text: string = transcriptionData.text || '';
    const segments: Array<{ id: number; start: number; end: number; text: string }> =
      transcriptionData.segments || [];

    // Build timestamped transcript entries
    const transcript = segments.map((seg) => ({
      id: String(seg.id),
      speaker: 'Conversation',
      text: seg.text.trim(),
      timestamp: formatTimestamp(seg.start),
      start_seconds: seg.start,
      end_seconds: seg.end,
    }));

    // Update recording in Supabase if recordingId provided
    if (recordingId) {
      const supabase = createClient();
      await supabase
        .from('interview_audio_recordings')
        .update({
          transcript,
          transcript_text: text,
          transcript_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordingId);
    }

    return NextResponse.json({ text, transcript, segments });
  } catch (error: any) {
    console.error('[interview/transcribe] error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
