import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';

const INTERVIEW_SYSTEM_PROMPT = `You are TRAVLR's real-time AI Interview Coach, helping Jen Wampole (the interviewer) conduct structured job interviews on Zoom.

YOUR ROLE:
- Jen is interviewing candidates for roles at TRAVLR, a short-term rental property management company.
- You listen to the live conversation transcript and generate smart follow-up questions, talking points, or probing questions for Jen.
- You help Jen stay on track with the interview script while also responding intelligently to what the candidate is actually saying.

HOW YOU OPERATE:
- When the candidate finishes answering, suggest the next best question or a follow-up probe based on what they said.
- If the candidate said something interesting, vague, or worth exploring, suggest a follow-up that digs deeper.
- If the candidate gave a strong answer, suggest moving to the next section question.
- If the candidate gave a weak or evasive answer, suggest a probing follow-up.
- Keep suggestions short, natural, and conversational — Jen should be able to read them directly.
- Never fabricate information about TRAVLR or the role that isn't in the script.

OUTPUT FORMAT (strict):
Show only what Jen should say or ask next:

Suggested: "[the question or talking point]"

Optionally add one brief coaching note:
[Note: brief context for Jen only]

If two options are useful:
Option A: "[question A]"
Option B: "[question B]"

TONE:
- Professional, warm, curious
- Natural spoken English — contractions are fine
- Never robotic or overly formal

BOUNDARIES:
- Never suggest making hiring decisions or commitments
- Never suggest questions that could be legally problematic (age, family status, religion, etc.)
- Focus on skills, experience, and culture fit only`;

const LLM_TIMEOUT_MS = 5000;

export async function POST(request: NextRequest) {
  try {
    const {
      transcript,
      interviewScript,
      roleTitle,
      currentSection,
      currentQuestion,
      candidateName,
      sessionId,
      liveFragment,
    } = await request.json();

    if (!interviewScript) {
      return NextResponse.json({ error: 'Missing interviewScript' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
    }

    // Build transcript context
    let transcriptSection = '';
    if (liveFragment) {
      const recentContext = Array.isArray(transcript) && transcript.length > 0
        ? transcript.slice(-4).map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`).join('\n') + '\n'
        : '';
      transcriptSection = `RECENT CONVERSATION:\n${recentContext}\nLIVE (just said): ${liveFragment}`;
    } else if (Array.isArray(transcript) && transcript.length > 0) {
      transcriptSection = `CONVERSATION SO FAR:\n${transcript.slice(-8).map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`).join('\n')}`;
    }

    const userMessage = `ROLE BEING INTERVIEWED FOR: ${roleTitle}
CANDIDATE NAME: ${candidateName || 'the candidate'}
CURRENT SECTION: ${currentSection || 'General'}
CURRENT QUESTION JEN JUST ASKED: ${currentQuestion || 'N/A'}

INTERVIEW SCRIPT REFERENCE:
${interviewScript}

${transcriptSection}

Based on what the candidate just said, what should Jen ask or say next? Provide a natural follow-up question or talking point. Keep it to 1–2 sentences max.${liveFragment ? ' Ultra-short response only.' : ''}`;

    let suggestion = '';

    try {
      const llmPromise = completion({
        model: 'claude-haiku-4-5-20251001',
        messages: [
          { role: 'system', content: INTERVIEW_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        api_key: apiKey,
        temperature: 0.4,
        max_tokens: liveFragment ? 120 : 250,
      } as any);

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
      );

      const response = await Promise.race([llmPromise, timeoutPromise]);
      suggestion = (response as any)?.choices?.[0]?.message?.content || '';
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === 'LLM_TIMEOUT') {
        return NextResponse.json({
          suggestion: `Suggested: "Tell me more about that — can you give me a specific example?"`,
          source: 'static_fallback',
          degraded: true,
        });
      }
      return NextResponse.json({
        suggestion: `Suggested: "That's helpful — what was the outcome of that situation?"`,
        source: 'static_fallback',
        degraded: true,
      });
    }

    return NextResponse.json({ suggestion, sessionId: sessionId || null, source: 'llm' });
  } catch (error) {
    console.error('[teleprompter/interview-suggest] error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestion', details: String(error) }, { status: 500 });
  }
}
