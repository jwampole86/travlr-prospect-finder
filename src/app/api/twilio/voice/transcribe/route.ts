import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';

/**
 * POST /api/twilio/voice/transcribe
 * Accepts a multipart audio blob and returns Whisper speech-to-text.
 * Used by the ImmersiveCallView for real-time dual-channel transcription.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiActor(request);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 400 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const speaker = (formData.get('speaker') as string) || 'Agent';

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (audioFile.size > 4_000_000) {
      return NextResponse.json({ error: 'Audio clip is too large' }, { status: 413 });
    }

    // Skip very small files (silence/noise)
    if (audioFile.size < 1000) {
      return NextResponse.json({ text: '', speaker });
    }

    // Build multipart form for OpenAI Whisper
    const whisperForm = new FormData();
    // Keep the real file type: the format is read from the file name.
    const isWav = audioFile.type.includes('wav') || audioFile.name.endsWith('.wav');
    whisperForm.append('file', audioFile, isWav ? 'audio.wav' : 'audio.webm');
    whisperForm.append('temperature', '0');
    // Words that come up on these calls and are easy to mishear.
    whisperForm.append('prompt', 'A phone call about vacation rental management. Terms: TRAVLR, Airbnb, Vrbo, HOA, short-term rental, property manager, permit, mortgage, Kihei, Aspen.');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'en');
    whisperForm.append('response_format', 'json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.warn('[transcribe] Whisper error:', err);
      return NextResponse.json({ error: 'Whisper transcription failed', details: err }, { status: 500 });
    }

    const { text } = await whisperRes.json();

    return NextResponse.json({
      text: text?.trim() || '',
      speaker,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[transcribe] error:', error);
    return NextResponse.json({ error: 'Transcription failed', details: String(error) }, { status: 500 });
  }
}
