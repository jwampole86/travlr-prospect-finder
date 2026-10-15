import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { CALL_SCRIPTS } from '@/lib/callScripts';
import { matchObjection as matchObjPattern } from '@/lib/objectionLibrary';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildLeadBriefing } from '@/lib/services/teleprompterBriefing';
import { TRAVLR_KNOWLEDGE } from '@/lib/teleprompterKnowledge';

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
  - Steers back toward the call's goal - Matches TRAVLR's tone: warm, professional, premium, never pushy or scripted-sounding
- Keep every suggestion short and spoken-word friendly — natural phrasing, contractions, no jargon unless the homeowner used it first.
- NEVER invent numbers, guarantees, or promises not already present in TRAVLR's approved script and data. If the homeowner asks for a specific number the agent doesn't have, generate a bridging line that offers to follow up with exact figures rather than fabricating one.
- If there's a pause or silence, offer a short natural bridging line rather than dead air.
- For the Proposal script: never generate specific rent guarantees, exact revenue figures, or contract terms — if asked, always bridge to "let me follow up with exact figures in writing."
- For the Closing/Contract script: focus on next steps (DocuSign, walkthrough, start date) — never invent contract terms.

LIVE FRAGMENT MODE
When receiving a live transcript fragment (partial sentence or recent utterance), prioritize:
1. Responding to the most recent homeowner statement
2. Keeping the suggestion ultra-short for real-time display: one sentence, or two short ones when the homeowner asked a direct question that needs a real answer
3. Matching the conversational momentum — don't restart the script mid-flow

OUTPUT FORMAT (strict)
Show only the text the agent should say next, formatted cleanly:

Suggested next line: "[the line]"

If two options are genuinely useful, label them:
Option A: "[line A]"
Option B: "[line B]"

Optionally add one line of context underneath, only when it helps the agent understand why:
[Note: one short line, 15 words max, using only facts from the lead profile or TRAVLR knowledge]

TONE & STYLE
- Warm, professional, confident — matches TRAVLR's brand voice.
- Natural spoken English: contractions, short sentences, no corporate jargon.
- Never robotic, never overly formal.

USING THE LEAD PROFILE AND TRAVLR KNOWLEDGE
- You are given TRAVLR KNOWLEDGE (approved facts about the company and its services) and, when available, a LEAD PROFILE for the homeowner on this call. Use them to answer the homeowner's questions directly and specifically.
- Questions about TRAVLR or what we do: answer from TRAVLR KNOWLEDGE in plain spoken words.
- Questions about their home, their market, the estimate, what we sent them or earlier conversations: answer from the LEAD PROFILE. Use their real details (address, bedrooms, local rules, the estimate range we texted) so it is clear we did our homework.
- If the answer is in neither source, do not guess. Give a short, honest bridge such as "That's a great question and I want to give you the right answer, so let me confirm it and follow up today."
- Quote only the estimate range the profile marks as quotable, and always call it an estimate, never a promise. Never read out anything the profile marks internal only.
- Never say or imply the homeowner opened, replied to or asked for anything unless the profile says so. Respect any opt-out note.

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
  candidate_next_steps: 'Follow up with a candidate after their AI interview to discuss the outcome, offer letter, compensation, and next steps.',
};

// Confidence threshold below which we suppress LLM generation
const CONFIDENCE_THRESHOLD = 0.6;

// LLM call timeout in ms — fall back to static script if exceeded
const LLM_TIMEOUT_MS = 6000;

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

const BRIEFING_TTL_MS = 5 * 60_000;
const BRIEFING_TIMEOUT_MS = 2500;
const briefingCache = new Map<string, { at: number; text: string }>();

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** The lead the call is about: the id the screen sent, or, for a call typed in by hand, the one lead the user can see at that exact address. */
async function resolveLeadId(supabase: ServerClient, leadId: unknown, address: unknown, state: unknown): Promise<string | null> {
  if (typeof leadId === 'string' && leadId) {
    const { data } = await supabase.from('leads').select('id').eq('id', leadId).maybeSingle();
    return data?.id ?? null;
  }
  const street = typeof address === 'string' ? address.trim() : '';
  if (street.length < 6) return null;
  let q = supabase.from('leads').select('id').ilike('address', street.replace(/[\\%_]/g, c => `\\${c}`)).limit(2);
  if (typeof state === 'string' && /^[A-Za-z]{2}$/.test(state.trim())) q = q.ilike('state', state.trim());
  const { data } = await q;
  return data?.length === 1 ? (data[0].id as string) : null;
}

/** The lead briefing for this call, or '' if the lead is missing, not visible to the signed-in user, or slow to load. Never blocks a suggestion for long. */
async function loadBriefing(supabase: ServerClient, userId: string, leadId: unknown, scriptId: unknown, address?: unknown, state?: unknown): Promise<string> {
  if (scriptId === 'candidate_next_steps') return '';
  try {
    const key = `${userId}:${typeof leadId === 'string' && leadId ? leadId : `addr:${String(address ?? '').trim().toLowerCase()}|${String(state ?? '').toLowerCase()}`}`;
    const hit = briefingCache.get(key);
    if (hit && Date.now() - hit.at < BRIEFING_TTL_MS) return hit.text;
    const resolved = await resolveLeadId(supabase, leadId, address, state);
    if (!resolved) return '';
    const text = await Promise.race([
      buildLeadBriefing(getSupabaseAdmin(), resolved),
      new Promise<null>(resolve => setTimeout(() => resolve(null), BRIEFING_TIMEOUT_MS)),
    ]);
    if (text === null) return '';
    briefingCache.set(key, { at: Date.now(), text });
    return text;
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const {
      transcript,
      baseScript,
      scriptId,
      leadContext,
      leadId,
      warm,
      liveFragment,
      sessionId,
      confidenceScore,
      isBargeIn,
    } = await request.json();

    // The screen asks for this as a call starts so the first real suggestion does not wait on the database.
    if (warm === true) {
      await loadBriefing(supabase, user.id, leadId, scriptId, leadContext?.address, leadContext?.portfolioState);
      return NextResponse.json({ warmed: true });
    }

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
    // A matched objection no longer replaces the AI. Its approved response is handed to the AI to adapt to this homeowner and their
    // lead profile, and it is used as is only if the AI is slow or fails.
    const latestText = liveFragment || (Array.isArray(transcript) ? transcript[transcript.length - 1]?.text : '');
    const latestSpeaker = Array.isArray(transcript) ? transcript[transcript.length - 1]?.speaker : null;

    let objectionHint: { id: string; category: string; note?: string; response: string } | null = null;
    if (latestSpeaker === 'Homeowner' || liveFragment) {
      const match = matchObjPattern(latestText || '');
      if (match) {
        const name = leadContext?.contactName && leadContext.contactName !== 'there' ? String(leadContext.contactName) : null;
        objectionHint = { id: match.id, category: match.category, note: match.note, response: name ? match.response.split('{contactName}').join(name) : match.response };
      }
    }
    const objectionMeta = objectionHint ? { objectionId: objectionHint.id, objectionCategory: objectionHint.category, note: objectionHint.note } : {};

    const scriptGoal = SCRIPT_GOALS[scriptId] || SCRIPT_GOALS['initial_outreach'];
    const briefing = await loadBriefing(supabase, user.id, leadId, scriptId, leadContext?.address, leadContext?.portfolioState);

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
${liveFragment ? 'MODE: Live fragment — provide ultra-short next-line suggestion only, with no [Note] line.\n' : ''}
BASE CALL SCRIPT (variables already resolved):
${baseScript}

LEAD CONTEXT:
- Contact Name: ${leadContext?.contactName || 'there'}
- Property Address: ${leadContext?.address || 'Unknown'}
- Portfolio/State: ${leadContext?.portfolioState || 'Unknown'}
- Local Blurb: ${leadContext?.localBlurb || ''}

${scriptId === 'candidate_next_steps' ? '' : `TRAVLR KNOWLEDGE (approved facts you may use):\n${TRAVLR_KNOWLEDGE}\n\n`}${briefing ? `${briefing}\n\n` : 'LEAD PROFILE: not available for this call. Use only the lead context above. You do not know what we have sent them or whether they opened or replied to anything, so never claim it and never deny it. If they ask, say you will pull up exactly what they received and confirm. Bridge to a follow-up for anything else you do not know.\n\n'}${objectionHint ? `APPROVED RESPONSE TO THIS KIND OF OBJECTION (${objectionHint.category}): adapt it to what the homeowner actually said and to their real details in the lead profile, keep the same intent, add no new claims, drop any statement about what most owners experience or any statistic that TRAVLR KNOWLEDGE does not support, and keep it short enough to say aloud.\n${objectionHint.response}\n\n` : ''}${transcriptSection}

Based on the transcript above and the current script stage, what should the agent say next? Provide the suggested line only — no raw variable tokens, no fabricated numbers.${liveFragment ? ' Keep it to one short sentence, or two if they asked a direct question.' : ''}`;

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
        max_tokens: liveFragment ? 220 : 320,
      } as any);

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
      );

      let response = await Promise.race([llmPromise, timeoutPromise]);
      suggestion = (response as any)?.choices?.[0]?.message?.content || '';
      
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      
      const reason = errMsg === 'LLM_TIMEOUT' ? 'llm_timeout' : 'llm_error';
      // Slow or failed: an approved objection response is better than a generic script line.
      if (objectionHint) {
        return NextResponse.json({ suggestion: objectionHint.response, sessionId: sessionId || null, source: 'objection_library', degraded: true, degradedReason: reason, ...objectionMeta });
      }
      const fallback = getStaticFallbackLine(scriptId || 'initial_outreach', Array.isArray(transcript) ? transcript : []);
      return NextResponse.json({
        suggestion: fallback,
        sessionId: sessionId || null,
        source: 'static_fallback',
        degraded: true,
        degradedReason: reason,
      });
    }

    return NextResponse.json({
      suggestion,
      sessionId: sessionId || null,
      source: objectionHint ? 'llm_objection' : source,
      ...objectionMeta,
    });

  } catch (error) {
    console.error('[teleprompter/suggest] error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestion', details: String(error) },
      { status: 500 }
    );
  }
}
