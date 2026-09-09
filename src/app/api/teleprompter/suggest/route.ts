import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { CALL_SCRIPTS } from '@/lib/callScripts';
import { matchObjection as matchObjPattern } from '@/lib/objectionLibrary';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TELEPROMPTER_SYSTEM_PROMPT = `You are TRAVLR's real-time AI Teleprompter and Conversation Coach for live homeowner outreach calls. Your sole purpose is to help the agent stay on script while sounding natural, warm, and adaptive — never scripted-sounding or robotic.

CORE CAPABILITIES
1. Accept a base call script (Initial Outreach, Follow-Up, Questionnaire Handoff, Proposal, or Closing/Contract) provided by TRAVLR.
2. Continuously process the live call transcript as it streams in, both sides of the conversation.
3. Generate and display the next line the agent should say, in real time.
4. Act exactly like a teleprompter: clean, ready-to-read text the agent can speak naturally — never a block of instructions or meta-commentary mixed into the suggested line itself.

HOW YOU OPERATE
- Stay faithful to the base script's actual goals. Never invent a goal or promise the script doesn't support.
- When the call is following the expected path, show the next scripted line, lightly conversational rather than word-for-word robotic.
- When the homeowner goes off-script, raises an objection, or asks something unexpected, generate a natural on-brand response that:
  - Directly addresses what they just said (never ignore or deflect the actual question)
  - Steers back toward the call's goal - Matches TRAVLR's tone: warm, professional, boutique-luxury, never pushy or scripted-sounding
- Keep every suggestion short and spoken-word friendly — natural phrasing, contractions, no jargon unless the homeowner used it first.
- NEVER invent numbers, guarantees, or promises not already present in TRAVLR's approved script and data. If the homeowner asks for a specific number the agent doesn't have, generate a bridging line that offers to follow up with exact figures rather than fabricating one.
- If there's a pause or silence, offer a short natural bridging line rather than dead air.
- For the Proposal script: never generate specific rent guarantees, exact revenue figures, or contract terms — if asked, always bridge to "let me follow up with exact figures in writing."
- For the Closing/Contract script: focus on next steps (DocuSign, walkthrough, start date) — never invent contract terms.

LIVE FRAGMENT MODE
When receiving a live transcript fragment (partial sentence or recent utterance), prioritize:
1. Responding to the most recent homeowner statement
2. Keeping the suggestion ultra-short (1 sentence max) for real-time display
3. Matching the conversational momentum — don't restart the script mid-flow

OUTPUT FORMAT (strict)
Show only the text the agent should say next, formatted cleanly:

Suggested next line: "[the line]"

If two options are genuinely useful, label them:
Option A: "[line A]"
Option B: "[line B]"

Optionally add one line of context underneath, only when it helps the agent understand why:
[Note: brief context]

TONE & STYLE
- Warm, professional, confident — matches TRAVLR's brand voice.
- Natural spoken English: contractions, short sentences, no corporate jargon.
- Never robotic, never overly formal.

DE-ESCALATION
- If the homeowner sounds frustrated, skeptical, or the call stalls, prioritize a calm, gentle redirect over pushing the script forward.
- If the homeowner clearly wants to end the call or isn't interested, generate a polite, low-pressure close rather than a harder push.

BOUNDARIES
- Never generate legal, financial, or contractual commitments beyond what's in the approved script.
- Never suggest a line that pressures, guilt-trips, or uses false urgency.
- Never generate specific rent guarantees, exact revenue figures, or contract terms.`;

const SCRIPT_GOALS: Record<string, string> = {
  initial_outreach: 'Introduce TRAVLR, build trust, gather basic info, move toward questionnaire or scheduled follow-up.',
  follow_up: 'Re-engage a homeowner who hasn\'t responded to prior outreach, without sounding pushy.',
  questionnaire_handoff: 'Walk a warm/interested homeowner through starting the qualification questionnaire live, or send the link.',
  proposal: 'Walk a qualified homeowner through proposed partnership terms, building toward the Proposal Introduction email/agreement.',
  closing_contract: 'Confirm the homeowner is ready to sign and walk them through next steps before sending the DocuSign agreement.',
};

// Confidence threshold below which we suppress LLM generation
const CONFIDENCE_THRESHOLD = 0.6;

// LLM call timeout in ms — fall back to static script if exceeded
const LLM_TIMEOUT_MS = 5000;

// Bridging lines for low-confidence / pause situations
const BRIDGING_LINES = [
  'Suggested next line: "Mm-hm, go on…"',
  'Suggested next line: "I hear you — tell me more."',
  'Suggested next line: "Sure, absolutely."',
  'Suggested next line: "Of course — go ahead."',
];

function getRandomBridgingLine(): string {
  return BRIDGING_LINES[Math.floor(Math.random() * BRIDGING_LINES.length)];
}

/**
 * Get the next static fallback line from the base script.
 * Used when LLM call times out or fails.
 */
function getStaticFallbackLine(scriptId: string, transcript: Array<{ speaker: string; text: string }>): string {
  try {
    const script = CALL_SCRIPTS[scriptId as keyof typeof CALL_SCRIPTS];
    if (!script) return '';
    
    // Find the first spoken line we haven't likely covered yet
    const agentLines = transcript.filter(e => e.speaker === 'Agent').map(e => e.text.toLowerCase());
    
    for (const section of script.sections) {
      for (const line of section.lines) {
        if (line.type !== 'spoken') continue;
        const lineText = line.text.toLowerCase();
        // Check if this line has been roughly said already
        const alreadySaid = agentLines.some(al => {
          const words = lineText.split(' ').filter(w => w.length > 4);
          const matchCount = words.filter(w => al.includes(w)).length;
          return matchCount > words.length * 0.4;
        });
        if (!alreadySaid) {
          return `Suggested next line: "${line.text}"`;
        }
      }
    }
    
    // All lines covered — return a close
    return 'Suggested next line: "Thanks so much for your time — I\'ll follow up with everything we discussed."';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      transcript,
      baseScript,
      scriptId,
      leadContext,
      liveFragment,
      sessionId,
      confidenceScore,
      isBargeIn,
    } = await request.json();

    if (!baseScript) {
      return NextResponse.json({ error: 'Missing required field: baseScript' }, { status: 400 });
    }

    if (!transcript && !liveFragment) {
      return NextResponse.json({ error: 'Missing required fields: transcript or liveFragment' }, { status: 400 });
    }

    // ── Confidence-Based Suppression ──────────────────────────────────────────
    // If confidence score is provided and below threshold, suppress LLM generation
    if (typeof confidenceScore === 'number' && confidenceScore < CONFIDENCE_THRESHOLD) {
      // Log low-confidence segment for review
      if (sessionId) {
        try {
          await supabase.from('teleprompter_low_confidence_log').insert({
            session_id: sessionId,
            segment_text: liveFragment || (Array.isArray(transcript) ? transcript[transcript.length - 1]?.text : ''),
            confidence_score: confidenceScore,
            logged_at: new Date().toISOString(),
          });
        } catch { /* non-blocking */ }
      }
      
      // Return bridging line instead of generating from bad input
      return NextResponse.json({
        suggestion: getRandomBridgingLine(),
        sessionId: sessionId || null,
        suppressedReason: 'low_confidence',
        confidenceScore,
      });
    }

    // ── Barge-In / Interrupt Handling ─────────────────────────────────────────
    // isBargeIn signals the homeowner started speaking mid-generation
    // We still process but mark it so the client can clear the pending suggestion
    if (isBargeIn) {
      // Process the new input immediately — don't return stale suggestion
      // The client should have already cleared the pending suggestion on barge-in detection
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 });
    }

    // ── Objection Library Matching ────────────────────────────────────────────
    // Check if the latest homeowner utterance matches a known objection pattern
    // Prefer pre-built response over LLM generation
    const latestText = liveFragment || (Array.isArray(transcript) ? transcript[transcript.length - 1]?.text : '');
    const latestSpeaker = Array.isArray(transcript) ? transcript[transcript.length - 1]?.speaker : null;
    
    if (latestSpeaker === 'Homeowner' || liveFragment) {
      const objectionMatch = matchObjPattern(latestText || '');
      if (objectionMatch) {
        // Apply contact name variable if present
        let response = objectionMatch.response;
        if (leadContext?.contactName && leadContext.contactName !== 'there') {
          response = response.replace('{contactName}', leadContext.contactName);
        }
        
        return NextResponse.json({
          suggestion: response,
          sessionId: sessionId || null,
          source: 'objection_library',
          objectionId: objectionMatch.id,
          objectionCategory: objectionMatch.category,
          note: objectionMatch.note,
        });
      }
    }

    const scriptGoal = SCRIPT_GOALS[scriptId] || SCRIPT_GOALS['initial_outreach'];

    // Build transcript section
    let transcriptSection: string;
    if (liveFragment) {
      const recentContext = Array.isArray(transcript) && transcript.length > 0
        ? transcript.slice(-3).map((t: { speaker: string; text: string }) => `${t.speaker}: ${t.text}`).join('\n') + '\n'
        : '';
      transcriptSection = `RECENT TRANSCRIPT:\n${recentContext}\nLIVE FRAGMENT (just spoken): ${liveFragment}`;
    } else {
      transcriptSection = `LIVE CALL TRANSCRIPT SO FAR:\n${(transcript as Array<{ speaker: string; text: string }>).map(t => `${t.speaker}: ${t.text}`).join('\n')}`;
    }

    const userMessage = `CURRENT SCRIPT: ${scriptId ? scriptId.replace(/_/g, ' ').toUpperCase() : 'INITIAL OUTREACH'}
SCRIPT GOAL: ${scriptGoal}
${liveFragment ? 'MODE: Live fragment — provide ultra-short next-line suggestion only.\n' : ''}
BASE CALL SCRIPT (variables already resolved):
${baseScript}

LEAD CONTEXT:
- Contact Name: ${leadContext?.contactName || 'there'}
- Property Address: ${leadContext?.address || 'Unknown'}
- Portfolio/State: ${leadContext?.portfolioState || 'Unknown'}
- Local Blurb: ${leadContext?.localBlurb || ''}

${transcriptSection}

Based on the transcript above and the current script stage, what should the agent say next? Provide the suggested line only — no raw variable tokens, no fabricated numbers.${liveFragment ? ' Keep it to one short sentence.' : ''}`;

    // ── LLM Call with Timeout + Graceful Degradation ──────────────────────────
    let suggestion = '';
    let source = 'llm';
    
    try {
      const llmPromise = completion({
        model: 'claude-haiku-4-5-20251001',
        messages: [
          { role: 'system', content: TELEPROMPTER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        api_key: apiKey,
        temperature: liveFragment ? 0.3 : 0.4,
        max_tokens: liveFragment ? 150 : 300,
      } as any);

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
      );

      let response = await Promise.race([llmPromise, timeoutPromise]);
      suggestion = (response as any)?.choices?.[0]?.message?.content || '';
      
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      
      if (errMsg === 'LLM_TIMEOUT') {
        // Graceful degradation: fall back to static script line
        const fallback = getStaticFallbackLine(scriptId || 'initial_outreach', Array.isArray(transcript) ? transcript : []);
        return NextResponse.json({
          suggestion: fallback,
          sessionId: sessionId || null,
          source: 'static_fallback',
          degraded: true,
          degradedReason: 'llm_timeout',
        });
      }
      
      // LLM call failed outright — fall back to static script
      const fallback = getStaticFallbackLine(scriptId || 'initial_outreach', Array.isArray(transcript) ? transcript : []);
      return NextResponse.json({
        suggestion: fallback,
        sessionId: sessionId || null,
        source: 'static_fallback',
        degraded: true,
        degradedReason: 'llm_error',
      });
    }

    return NextResponse.json({
      suggestion,
      sessionId: sessionId || null,
      source,
    });

  } catch (error) {
    console.error('[teleprompter/suggest] error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestion', details: String(error) },
      { status: 500 }
    );
  }
}
