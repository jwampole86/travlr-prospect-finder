import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId, currentQuestion, interviewerNote, previousAnswerSummary } = await req.json() as {
      candidateId: string;
      currentQuestion: string;
      interviewerNote?: string;
      previousAnswerSummary?: string;
    };

    if (!candidateId || !currentQuestion) {
      return NextResponse.json({ error: 'candidateId and currentQuestion required' }, { status: 400 });
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name, seed_fit_notes, seed_concerns, resume_raw_text, work_experience, skills')
      .eq('id', candidateId)
      .single();

    const prompt = `You are an expert interview coach for TRAVLR Vacation Homes.
Generate ONE concise, targeted follow-up question for a live interview.

CANDIDATE: ${candidate?.full_name || 'Unknown'}
CANDIDATE CONTEXT: ${candidate?.seed_fit_notes || 'Not specified'}
CONCERNS: ${candidate?.seed_concerns || 'Not specified'}

CURRENT QUESTION BEING ASKED:
"${currentQuestion}"

${previousAnswerSummary ? `CANDIDATE'S ANSWER SUMMARY:\n"${previousAnswerSummary}"` : ''}

${interviewerNote ? `INTERVIEWER NOTE:\n"${interviewerNote}"` : ''}

Generate ONE follow-up question that:
1. Probes deeper into what the candidate just said
2. Asks for specific evidence, numbers, or examples
3. Validates a claim or explores a potential concern
4. Is concise (1-2 sentences max)
5. Is natural and conversational

Return ONLY the follow-up question text, no explanation.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const followUp = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

    return NextResponse.json({ followUp });
  } catch (err) {
    console.error('[ask-deeper] error:', err);
    return NextResponse.json({ error: 'Failed to generate follow-up' }, { status: 500 });
  }
}
