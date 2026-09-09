import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { createClient } from '@/lib/supabase/client';

const SUMMARY_SYSTEM_PROMPT = `You are an expert call analyst for TRAVLR, a luxury short-term rental property management company. 
Analyze the provided call transcript and return a structured JSON summary.

Return ONLY valid JSON with this exact structure:
{
  "key_points": ["string", ...],
  "objections": ["string", ...],
  "next_steps": ["string", ...],
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "sentiment_explanation": "string",
  "homeowner_interest_level": "high" | "medium" | "low" | "unknown",
  "summary_text": "string (2-3 sentence plain English summary)"
}

Rules:
- key_points: 2-5 most important things discussed
- objections: concerns or pushback raised by the homeowner (empty array if none)
- next_steps: concrete follow-up actions agreed upon or recommended
- sentiment: overall tone of the homeowner during the call
- summary_text: concise narrative summary an agent can read at a glance`;

export async function POST(request: NextRequest) {
  try {
    const { sessionId, transcript, leadId } = await request.json();

    if (!sessionId || !transcript || !Array.isArray(transcript)) {
      return NextResponse.json({ error: 'Missing sessionId or transcript' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
    }

    const transcriptText = transcript
      .map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`)
      .join('\n');

    if (!transcriptText.trim()) {
      return NextResponse.json({ error: 'Empty transcript' }, { status: 400 });
    }

    const response = await completion({
      model: 'claude-haiku-4-5-20251001',
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze this call transcript and return the structured JSON summary:\n\n${transcriptText}`,
        },
      ],
      stream: false,
      api_key: apiKey,
      temperature: 0.2,
      max_tokens: 800,
    } as any);

    const rawContent = (response as any)?.choices?.[0]?.message?.content || '';

    // Parse JSON from Claude's response
    let summary: Record<string, unknown>;
    try {
      // Extract JSON if wrapped in markdown code block
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawContent];
      summary = JSON.parse(jsonMatch[1].trim());
    } catch {
      return NextResponse.json({ error: 'Failed to parse summary JSON', raw: rawContent }, { status: 500 });
    }

    // Persist summary to call_sessions
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('call_sessions')
      .update({
        call_summary: summary,
        summary_generated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      console.warn('[summarize] Failed to persist summary:', updateError.message);
    }

    return NextResponse.json({ summary, sessionId });
  } catch (error) {
    console.error('[twilio/voice/summarize] error:', error);
    return NextResponse.json({ error: 'Failed to generate summary', details: String(error) }, { status: 500 });
  }
}
