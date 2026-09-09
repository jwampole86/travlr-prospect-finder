import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('candidate_scorecards')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ scorecard: data || null });
  } catch (err) {
    console.error('[scorecard GET]', err);
    return NextResponse.json({ error: 'Failed to fetch scorecard' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { candidateId, generateSummary, ...scoreData } = body;

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    // Upsert scorecard
    const { data: existing } = await supabase
      .from('candidate_scorecards')
      .select('id')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let scorecard;
    if (existing) {
      const { data, error } = await supabase
        .from('candidate_scorecards')
        .update({ ...scoreData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      scorecard = data;
    } else {
      const { data, error } = await supabase
        .from('candidate_scorecards')
        .insert({ candidate_id: candidateId, ...scoreData })
        .select()
        .single();
      if (error) throw error;
      scorecard = data;
    }

    // Update candidate status
    await supabase
      .from('candidates')
      .update({ candidate_status: 'INTERVIEWED', updated_at: new Date().toISOString() })
      .eq('id', candidateId);

    await supabase.from('candidate_audit_events').insert({
      candidate_id: candidateId,
      event_type: 'INTERVIEW_COMPLETED',
      event_data: { overall_fit: scoreData.overall_fit, hire_recommendation: scoreData.hire_recommendation },
    });

    // Auto-trigger consistency report generation (non-blocking)
    // Only if scorecard has enough data (at least overall_fit scored)
    if (scoreData.overall_fit && !generateSummary) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        fetch(`${baseUrl}/api/candidates/consistency-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId, scorecardId: scorecard.id }),
        }).catch(e => console.error('[scorecard] Auto consistency report error:', e));
      } catch {
        // Non-fatal — scorecard save is not blocked
      }
    }

    // Generate AI summary if requested
    if (generateSummary) {
      try {
        const { data: candidate } = await supabase
          .from('candidates')
          .select('full_name, seed_fit_notes, seed_concerns, strengths, concerns, interview_script')
          .eq('id', candidateId)
          .single();

        const { data: notes } = await supabase
          .from('candidate_interview_notes')
          .select('question_text, note_text')
          .eq('candidate_id', candidateId);

        const notesText = (notes || []).map((n: Record<string, string>) => `Q: ${n.question_text || 'General'}\nNote: ${n.note_text}`).join('\n\n');

        const summaryPrompt = `You are an expert interview evaluator for TRAVLR Vacation Homes.
Generate a post-interview summary for candidate ${candidate?.full_name || 'Unknown'}.

SCORECARD:
${JSON.stringify(scoreData, null, 2)}

INTERVIEW NOTES:
${notesText || 'No notes recorded'}

SEED CONTEXT:
Strengths: ${candidate?.seed_fit_notes || 'Not specified'}
Concerns: ${candidate?.seed_concerns || 'Not specified'}

Return a JSON object:
{
  "keyStrengths": string[],
  "concerns": string[],
  "evidenceFromInterview": string[],
  "resumeVsInterviewConsistency": string,
  "questionsStillUnanswered": string[],
  "suggestedNextTopics": string[],
  "resumeClaimsValidated": string[],
  "resumeClaimsNeedingValidation": string[],
  "newInformationLearned": string[],
  "potentialInconsistencies": string[],
  "overallAssessment": string
}

IMPORTANT: Do NOT make a hire/reject recommendation. Final decision is human-only.
Use neutral language for inconsistencies: "Needs clarification", "Not yet validated", "Interview answer differed from resume wording".`;

        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: summaryPrompt }],
        });

        const rawText = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const aiSummary = JSON.parse(jsonMatch[0]);
          await supabase
            .from('candidate_scorecards')
            .update({ ai_summary: aiSummary, ai_summary_generated_at: new Date().toISOString() })
            .eq('id', scorecard.id);
          scorecard.ai_summary = aiSummary;
        }
      } catch (summaryErr) {
        console.error('[scorecard] AI summary error:', summaryErr);
        // Non-fatal - return scorecard without summary
      }
    }

    return NextResponse.json({ scorecard });
  } catch (err) {
    console.error('[scorecard POST]', err);
    return NextResponse.json({ error: 'Failed to save scorecard' }, { status: 500 });
  }
}
