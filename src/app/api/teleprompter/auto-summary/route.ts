import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { createClient } from '@supabase/supabase-js';
import { activityService } from '@/lib/services/activityService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SUMMARY_SYSTEM_PROMPT = `You are a call summarizer for TRAVLR, a vacation rental property management company. 
Given a call transcript between a TRAVLR agent and a homeowner prospect, produce a concise, structured summary.

Output format (strict JSON):
{
  "summary": "2-3 sentence overview of what was discussed",
  "objections": ["list of objections raised by homeowner, if any"],
  "objectionHandling": "brief note on how objections were handled, or 'No objections raised'",
  "nextStep": "the agreed or implied next step from the call",
  "homeownerSentiment": "positive | neutral | negative | mixed",
  "keyTopicsCovered": ["list of key topics covered"]
}

Be factual and concise. Do not invent details not present in the transcript.`;

export async function POST(request: NextRequest) {
  try {
    const {
      sessionId,
      transcript,
      leadId,
      leadAddress,
      leadState,
      contactName,
      scriptId,
      outcome,
      durationSeconds,
      agentName,
    } = await request.json();

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json({ error: 'transcript required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
    }

    // Build transcript text for summarization
    const transcriptText = transcript
      .map((e: { speaker: string; text: string; timestamp?: string }) =>
        `[${e.timestamp || ''}] ${e.speaker}: ${e.text}`
      )
      .join('\n');

    const mins = Math.floor((durationSeconds || 0) / 60);
    const secs = (durationSeconds || 0) % 60;

    const userMessage = `Call Details:
- Contact: ${contactName || 'Unknown'}
- Property: ${leadAddress || 'Unknown'}
- Script Used: ${scriptId || 'initial_outreach'}
- Duration: ${mins}m ${secs}s
- Outcome: ${outcome || 'not recorded'}
- Agent: ${agentName || 'Unknown'}

Transcript:
${transcriptText}

Summarize this call.`;

    let summaryData: {
      summary: string;
      objections: string[];
      objectionHandling: string;
      nextStep: string;
      homeownerSentiment: string;
      keyTopicsCovered: string[];
    } = {
      summary: 'Call completed.',
      objections: [],
      objectionHandling: 'No objections raised',
      nextStep: 'Follow up as discussed',
      homeownerSentiment: 'neutral',
      keyTopicsCovered: [],
    };

    try {
      const response = await completion({
        model: 'claude-haiku-4-5-20251001',
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        api_key: apiKey,
        temperature: 0.2,
        max_tokens: 500,
      } as any);

      const raw = (response as any)?.choices?.[0]?.message?.content || '';
      
      // Parse JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Non-blocking — use default summary
    }

    // Store summary in DB
    if (sessionId) {
      try {
        await supabase.from('teleprompter_call_summaries').insert({
          session_id: sessionId,
          lead_id: leadId || null,
          lead_address: leadAddress || null,
          contact_name: contactName || null,
          script_id: scriptId || null,
          outcome: outcome || null,
          duration_seconds: durationSeconds || 0,
          agent_name: agentName || null,
          summary: summaryData.summary,
          objections: summaryData.objections,
          objection_handling: summaryData.objectionHandling,
          next_step: summaryData.nextStep,
          homeowner_sentiment: summaryData.homeownerSentiment,
          key_topics_covered: summaryData.keyTopicsCovered,
          transcript_length: transcript.length,
          generated_at: new Date().toISOString(),
        });
      } catch { /* non-blocking */ }
    }

    // Log to activity timeline
    if (leadId || leadAddress) {
      try {
        const objectionText = summaryData.objections.length > 0
          ? ` Objections: ${summaryData.objections.join(', ')}.`
          : '';
        
        await activityService.record({
          leadId,
          leadAddress: leadAddress || '',
          leadState: leadState || '',
          eventType: 'outreach_sent',
          description: `Post-call summary — ${contactName || 'Homeowner'} · ${mins}m ${secs}s`,
          detail: `${summaryData.summary}${objectionText} Next step: ${summaryData.nextStep}`,
          source: 'teleprompter',
          metadata: {
            session_id: sessionId,
            script_id: scriptId,
            outcome,
            duration_seconds: durationSeconds,
            objections: summaryData.objections,
            next_step: summaryData.nextStep,
            sentiment: summaryData.homeownerSentiment,
            key_topics: summaryData.keyTopicsCovered,
            summary_type: 'auto_generated',
          },
        });
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      success: true,
      summary: summaryData,
      sessionId: sessionId || null,
    });

  } catch (error) {
    console.error('[teleprompter/auto-summary] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
