import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/twilio/voice/transcribe
 * Accepts a multipart audio blob and returns Whisper speech-to-text.
 * Used by the ImmersiveCallView for real-time dual-channel transcription.
 */
export async function POST(request: NextRequest) {
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

    // Skip very small files (silence/noise)
    if (audioFile.size < 1000) {
      return NextResponse.json({ text: '', speaker });
    }

    // Build multipart form for OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, 'audio.webm');
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
