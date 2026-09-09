import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      transcript: Array<{ speaker: string; text: string }>;
      roleTitle: string;
      candidateName: string;
      currentQuestion?: string;
      currentSection?: string;
    };

    const { transcript, roleTitle, candidateName, currentQuestion, currentSection } = body;

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({
        strengths: [],
        probeTopics: [],
        biasTips: [],
        source: 'empty',
      });
    }

    const recentExchanges = transcript.slice(-6).map(e => `${e.speaker}: ${e.text}`).join('\n');

    const prompt = `You are an expert interview coach providing real-time guidance to an interviewer named Jen who is conducting a job interview for the role of "${roleTitle}" with candidate "${candidateName}".

Current interview section: ${currentSection || 'General'}
Current question being asked: ${currentQuestion || 'Not specified'}

Recent conversation (last 6 exchanges):
${recentExchanges}

Based on what the candidate just said, provide concise real-time coaching for Jen. Return a JSON object with exactly these three arrays:

1. "strengths" - 1-2 bullet points: specific strengths or positive signals the candidate just demonstrated that Jen should acknowledge or build on (e.g., "Showed initiative by mentioning proactive outreach")
2. "probeTopics" - 1-3 bullet points: specific topics or claims from the candidate's last response that Jen should probe deeper on (e.g., "Ask for a specific example of the 'difficult client' they mentioned")
3. "biasTips" - 1-2 bullet points: bias-mitigation reminders relevant to this specific exchange (e.g., "Avoid anchoring on their previous company's prestige — focus on demonstrated skills", "Don't let enthusiasm substitute for evidence — ask for concrete metrics")

Keep each bullet under 12 words. Be specific to what was actually said, not generic.

Return ONLY valid JSON like:
{"strengths":["..."],"probeTopics":["..."],"biasTips":["..."]}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

    // Parse JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      strengths: string[];
      probeTopics: string[];
      biasTips: string[];
    };

    return NextResponse.json({
      strengths: parsed.strengths || [],
      probeTopics: parsed.probeTopics || [],
      biasTips: parsed.biasTips || [],
      source: 'llm',
    });
  } catch (err) {
    console.error('[interview-guidance] error:', err);

    // Fallback static guidance
    return NextResponse.json({
      strengths: ['Listen for specific examples and quantifiable results'],
      probeTopics: ['Ask for a concrete example to validate their last claim'],
      biasTips: ['Focus on demonstrated behaviors, not personality or background'],
      source: 'fallback',
    });
  }
}
