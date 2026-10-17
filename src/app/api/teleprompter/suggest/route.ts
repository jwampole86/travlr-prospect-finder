import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { CALL_SCRIPTS } from '@/lib/callScripts';
import { matchObjection as matchObjPattern } from '@/lib/objectionLibrary';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildLeadBriefing } from '@/lib/services/teleprompterBriefing';
import { TRAVLR_KNOWLEDGE } from '@/lib/teleprompterKnowledge';
import { properName } from '@/lib/agentIdentity';
import { cleanSuggestion, stripFillerOpener } from '@/lib/suggestionText';
import { getApiActor } from '@/lib/auth/apiAuthorization';
import { tokenize } from '@/lib/teleprompterTracker';

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

SOUND LIKE A PERSON, NOT AN ASSISTANT
- Never open a line with a stock acknowledgement. Banned openers: Great, Absolutely, Certainly, Of course, Sure, Definitely, Totally, Perfect, Awesome, Wonderful, Excellent, Fantastic, Understood, Got it, No problem, "I completely understand", "I hear you", "That makes sense", "I appreciate that", "Thank you for sharing", "That's a great question", "Good point".
- Start with the substance: answer what they asked, or pick up the specific thing they said and respond to it.
- Acknowledge only when it helps, and make it specific to what they actually said ("A second mortgage on top of the first, that does change the math."), never generic. Most turns need no acknowledgement at all.
- Do not start two lines in a row the same way. Look at how the agent's earlier lines in the transcript began and open differently.
- Plain words a person would say on the phone. No exclamation marks, no sales adjectives (amazing, fantastic, exciting, incredible), no "I'd love to", no "I'm happy to".
- Do not repeat the homeowner's sentence back to them.

USING THE LEAD PROFILE AND TRAVLR KNOWLEDGE
- You are given TRAVLR KNOWLEDGE (approved facts about the company and its services) and, when available, a LEAD PROFILE for the homeowner on this call. Use them to answer the homeowner's questions directly and specifically.
- Questions about TRAVLR or what we do: answer from TRAVLR KNOWLEDGE in plain spoken words.
- Questions about their home, their market, the estimate, what we sent them or earlier conversations: answer from the LEAD PROFILE. Use their real details (address, bedrooms, local rules, the estimate range we texted) so it is clear we did our homework.
- If the answer is in neither source, do not guess. Give a short, honest bridge such as "That's a great question and I want to give you the right answer, so let me confirm it and follow up today."
- Quote only the estimate range the profile marks as quotable, and always call it an estimate, never a promise. Never read out anything the profile marks internal only.
- Never say or imply the homeowner opened, replied to or asked for anything unless the profile says so. Respect any opt-out note. Do not say when something was sent or seen unless the profile gives that date; otherwise say "recently" or leave the timing out.
- AGENT ON THIS CALL is the real person speaking. Use that exact name whenever the agent introduces themselves, is asked who is calling, or signs off. Never invent, shorten into a nickname, or swap in any other name, including names that appear in examples.

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
// Time allowed before the first word arrives; once words are flowing the answer is allowed to finish.
const LLM_TIMEOUT_MS = Number(process.env.TELEPROMPTER_LLM_TIMEOUT_MS) || 4500;
const LLM_TOTAL_MS = 12_000;
const HOLD_CHARS = 70;

// Bridging lines for low-confidence / pause situations
const BRIDGING_LINES = [
  'Suggested next line: "Mm-hm, go on."',
  'Suggested next line: "Okay. Tell me a bit more about that."',
  'Suggested next line: "Take your time."',
  'Suggested next line: "What are you thinking?"',
];

function getRandomBridgingLine(): string {
  return BRIDGING_LINES[Math.floor(Math.random() * BRIDGING_LINES.length)];
}

/** Sections that only make sense after a specific answer, so they are never picked blindly. */
const BRANCH_SECTION = /^(if_|close|not_interested|timing_not_right|still_interested)/;
const NEUTRAL_BRIDGE = 'Suggested next line: "Let me make sure I give you an accurate answer on that."';

/**
 * Next static fallback line from the base script, used when the AI is slow or fails.
 * It fills in the homeowner's name and address, never shows a placeholder it cannot fill, does not replay the greeting once the
 * homeowner has spoken, and skips answer-dependent branches. When nothing fits it returns a neutral bridge.
 */
function getStaticFallbackLine(
  scriptId: string,
  transcript: Array<{ speaker: string; text: string }>,
  leadContext?: { contactName?: string; address?: string; localBlurb?: string },
  agentName?: string,
): string {
  try {
    const script = CALL_SCRIPTS[scriptId as keyof typeof CALL_SCRIPTS];
    if (!script) return NEUTRAL_BRIDGE;

    const contact = leadContext?.contactName && leadContext.contactName !== 'there' ? leadContext.contactName : 'there';
    const fill = (t: string) => t
      .replace(/\{contactName\}/g, contact)
      .replace(/\{address\}/g, leadContext?.address || 'your property')
      .replace(/\{localBlurb\}/g, leadContext?.localBlurb || '')
      .replace(/\{senderName\}/g, agentName || '');

    const agentLines = transcript.filter(e => e.speaker === 'Agent').map(e => e.text.toLowerCase());
    const homeownerSpoke = transcript.some(e => e.speaker === 'Homeowner');

    for (const section of script.sections) {
      if (BRANCH_SECTION.test(section.id) || (section.id === 'opening' && homeownerSpoke)) continue;
      for (const line of section.lines) {
        if (line.type !== 'spoken') continue;
        const text = fill(line.text).replace(/\s+/g, ' ').trim();
        if (!text || /\{[a-zA-Z]+\}/.test(text)) continue;
        // Skip a line the agent has roughly said already.
        const words = text.toLowerCase().split(' ').filter(w => w.length > 4);
        const alreadySaid = agentLines.some(al => words.filter(w => al.includes(w)).length > words.length * 0.4);
        if (!alreadySaid) return `Suggested next line: "${text}"`;
      }
    }
    return NEUTRAL_BRIDGE;
  } catch {
    return NEUTRAL_BRIDGE;
  }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const agentNameCache = new Map<string, { at: number; name: string }>();

/** Who is making the call: the name the screen sent (the agent can edit it before starting), else their profile name. */
async function loadAgentName(supabase: ServerClient, userId: string, userMeta: Record<string, any> | undefined, claimed: unknown): Promise<string> {
  const given = typeof claimed === 'string' ? claimed.replace(/[^\p{L}\p{M}'’.\- ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (given) return properName(given);
  const hit = agentNameCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.name;
  let name = '';
  try {
    const { data } = await supabase.from('user_profiles').select('full_name').eq('id', userId).maybeSingle();
    name = String(data?.full_name ?? '').trim();
  } catch { /* fall through to sign-in details */ }
  if (!name) name = String(userMeta?.full_name ?? userMeta?.name ?? '').trim();
  name = properName(name);
  if (name) agentNameCache.set(userId, { at: Date.now(), name });
  return name;
}

const POSITIVE_OUTCOMES = new Set(['questionnaire_sent', 'follow_up_scheduled', 'proposal_conversation']);
const LEARNED_TTL_MS = 2 * 60_000;
const learnedCache = new Map<string, { at: number; rows: Array<{ homeowner_said: string | null; agent_said: string; outcome: string | null }> }>();
const LEARN_STOP = new Set(['that', 'this', 'with', 'have', 'what', 'about', 'they', 'them', 'there', 'would', 'could', 'should', 'just', 'like', 'your', 'from', 'been', 'were', 'will', 'dont', 'thats', 'then', 'than']);

/**
 * Phrasing agents actually chose when they went off script on earlier calls, preferring calls that ended well and moments where the
 * homeowner said something similar. It is style guidance only: the model keeps the intent and never takes facts from it.
 */
async function loadLearnedPhrasing(organizationId: string | null, scriptId: unknown, homeownerText: string): Promise<string> {
  if (typeof scriptId !== 'string' || scriptId === 'candidate_next_steps') return '';
  try {
    const key = `${organizationId ?? 'none'}:${scriptId}`;
    let hit = learnedCache.get(key);
    if (!hit || Date.now() - hit.at > LEARNED_TTL_MS) {
      let q = getSupabaseAdmin().from('teleprompter_script_deviations').select('homeowner_said, agent_said, outcome')
        .eq('script_id', scriptId).in('kind', ['ad_lib', 'replaced']).order('created_at', { ascending: false }).limit(120);
      if (organizationId) q = q.eq('organization_id', organizationId);
      const { data } = await q;
      hit = { at: Date.now(), rows: (data ?? []) as Array<{ homeowner_said: string | null; agent_said: string; outcome: string | null }> };
      learnedCache.set(key, hit);
    }
    const said = new Set(tokenize(homeownerText).filter(t => t.length > 3 && !LEARN_STOP.has(t)));
    const scored = hit.rows
      .filter(r => r.agent_said && r.agent_said.split(/\s+/).length >= 5)
      .map((r, i) => {
        const overlap = tokenize(r.homeowner_said ?? '').filter(t => said.has(t)).length;
        return { r, score: Math.min(overlap, 3) * 2 + (r.outcome && POSITIVE_OUTCOMES.has(r.outcome) ? 2 : 0) - i * 0.01 };
      })
      .filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    if (scored.length === 0) return '';
    const clip = (t: string) => (t.length > 220 ? `${t.slice(0, 217)}...` : t);
    return `HOW OUR AGENTS ACTUALLY SAY IT (real wording from earlier calls where the agent chose to go off the script, so there was a reason. Use it only as a hint about tone and approach. Keep your own wording, never copy it word for word, never take facts from it, and never repeat a claim about what other owners do or earn):\n${scored.map(x => `- Homeowner: "${clip(x.r.homeowner_said ?? '(no reply)')}" -> Agent: "${clip(x.r.agent_said)}"`).join('\n')}\n\n`;
  } catch {
    return '';
  }
}

const orgCache = new Map<string, { at: number; id: string | null }>();
async function loadOrganizationId(request: NextRequest, userId: string): Promise<string | null> {
  const hit = orgCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const id = (await getApiActor(request))?.organizationId ?? null;
  orgCache.set(userId, { at: Date.now(), id });
  return id;
}

const polish = (t: string) => (/^(Suggested next line|Option [AB]):/m.test(t) ? cleanSuggestion(t) : stripFillerOpener(t));

const BRIEFING_TTL_MS = 5 * 60_000;
const BRIEFING_TIMEOUT_MS = 2500;
const briefingCache = new Map<string, { at: number; text: string }>();


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
      agentName: claimedAgentName,
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
    // Everything the model needs besides the transcript loads at the same time (all of it is cached after the first request of a call).
    const [briefing, agentName, organizationId] = await Promise.all([
      loadBriefing(supabase, user.id, leadId, scriptId, leadContext?.address, leadContext?.portfolioState),
      loadAgentName(supabase, user.id, user.user_metadata, claimedAgentName),
      loadOrganizationId(request, user.id),
    ]);
    const learned = latestSpeaker === 'Homeowner' || liveFragment ? await loadLearnedPhrasing(organizationId, scriptId, latestText || '') : '';

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

    // The first block is identical for the whole call, so the provider can cache it and answer sooner on every later request.
    const stableContext = `CURRENT SCRIPT: ${scriptId ? scriptId.replace(/_/g, ' ').toUpperCase() : 'INITIAL OUTREACH'}
SCRIPT GOAL: ${scriptGoal}

BASE CALL SCRIPT (variables already resolved):
${baseScript}

AGENT ON THIS CALL: ${agentName || 'unknown. Do not invent a name; if an introduction is needed, say "this is your TRAVLR representative".'}

LEAD CONTEXT:
- Contact Name: ${leadContext?.contactName || 'there'}
- Property Address: ${leadContext?.address || 'Unknown'}
- Portfolio/State: ${leadContext?.portfolioState || 'Unknown'}
- Local Blurb: ${leadContext?.localBlurb || ''}

${scriptId === 'candidate_next_steps' ? '' : `TRAVLR KNOWLEDGE (approved facts you may use):\n${TRAVLR_KNOWLEDGE}\n\n`}${briefing ? `${briefing}` : 'LEAD PROFILE: not available for this call. Use only the lead context above. You do not know what we have sent them or whether they opened or replied to anything, so never claim it and never deny it. If they ask, say you will pull up exactly what they received and confirm. Bridge to a follow-up for anything else you do not know.'}`;

    const liveContext = `${liveFragment ? 'MODE: Live fragment — provide ultra-short next-line suggestion only, with no [Note] line.\n\n' : ''}${learned}${objectionHint ? `APPROVED RESPONSE TO THIS KIND OF OBJECTION (${objectionHint.category}): adapt it to what the homeowner actually said and to their real details in the lead profile, keep the same intent, add no new claims, drop any statement about what most owners experience or any statistic that TRAVLR KNOWLEDGE does not support, and keep it short enough to say aloud.\n${objectionHint.response}\n\n` : ''}${transcriptSection}

Based on the transcript above and the current script stage, what should the agent say next? Provide the suggested line only — no raw variable tokens, no fabricated numbers.${liveFragment ? ' Keep it to one short sentence, or two if they asked a direct question.' : ''}`;

    const fallbackBody = (reason: string) => {
      // Slow or failed: an approved objection response is better than a generic script line.
      if (objectionHint) return { suggestion: polish(objectionHint.response), sessionId: sessionId || null, source: 'objection_library', degraded: true, degradedReason: reason, ...objectionMeta };
      const fallback = getStaticFallbackLine(scriptId || 'initial_outreach', Array.isArray(transcript) ? transcript : [], leadContext, agentName);
      return { suggestion: polish(fallback), sessionId: sessionId || null, source: 'static_fallback', degraded: true, degradedReason: reason };
    };

    // ── Streamed LLM call ─────────────────────────────────────────────────────
    // Lines are sent as they are written (newline-delimited JSON) so the first words reach the screen in a fraction of the time the
    // whole answer takes. {t:'text'} carries the text so far; {t:'done'} carries the final text and details.
    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`)); } catch { /* client went away */ } };
        const abort = new AbortController();
        const firstWordTimer = setTimeout(() => abort.abort(), LLM_TIMEOUT_MS);
        const overallTimer = setTimeout(() => abort.abort(), LLM_TOTAL_MS);
        let text = '';
        let timedOut = false;
        try {
          const events = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: liveFragment ? 200 : 260,
            temperature: liveFragment ? 0.3 : 0.4,
            stream: true,
            system: [{ type: 'text', text: TELEPROMPTER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: [
              { type: 'text', text: stableContext, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: liveContext },
            ] }],
          }, { signal: abort.signal });
          let began = false;
          for await (const ev of events) {
            if (ev.type !== 'content_block_delta' || ev.delta.type !== 'text_delta') continue;
            if (!began) { began = true; clearTimeout(firstWordTimer); }
            text += ev.delta.text;
            // Wait for enough text to tidy the opening words before anything is shown, so the line does not change under the reader.
            if (text.length >= HOLD_CHARS || text.includes('\n')) send({ t: 'text', text: polish(text) });
          }
        } catch (err) {
          timedOut = abort.signal.aborted || (err instanceof Error && /abort|timeout/i.test(err.message));
          if (!text.trim()) {
            send({ t: 'done', ...fallbackBody(timedOut ? 'llm_timeout' : 'llm_error') });
            clearTimeout(firstWordTimer); clearTimeout(overallTimer); controller.close();
            return;
          }
        }
        clearTimeout(firstWordTimer); clearTimeout(overallTimer);
        if (!text.trim()) send({ t: 'done', ...fallbackBody('llm_error') });
        else send({ t: 'done', suggestion: polish(text), sessionId: sessionId || null, source: objectionHint ? 'llm_objection' : 'llm', ...objectionMeta });
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });

  } catch (error) {
    console.error('[teleprompter/suggest] error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestion', details: String(error) },
      { status: 500 }
    );
  }
}
