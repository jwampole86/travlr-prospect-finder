import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * TRAVLR AI Chat Route — Role-Scoped with Human-Handoff
 *
 * This route wraps the underlying AI provider with:
 * 1. Human-handoff detection — sensitive queries return a support-redirect
 *    response instead of being forwarded to the AI model.
 * 2. Role-based system prompt injection — homeowner and agent roles are
 *    scoped to their own data only; admin has full access.
 * 3. PDL compliance guard — enrichment data is never surfaced to homeowners.
 *
 * Use this route for all chatbot UI calls (agent assistant + homeowner portal).
 * The lower-level /api/ai/chat-completion route remains available for
 * non-chatbot AI features (property report narrative, etc.).
 */

// ─── Human-handoff trigger patterns ──────────────────────────────────────────
const HANDOFF_PATTERNS: RegExp[] = [
  /payout|payment|wire transfer|bank account|ach|direct deposit/i,
  /dispute|chargeback|refund/i,
  /legal|lawsuit|attorney|contract breach/i,
  /cancel.*account|delete.*account|close.*account/i,
  /reset.*password|change.*password|forgot.*password/i,
  /social security|ssn|tax id|ein/i,
  /credit card|billing|invoice|charge me/i,
  /complaint|escalate|supervisor|manager|speak.*human/i,
  /personal information|update.*address|change.*email/i,
  /emergency|urgent.*help/i,
];

const HANDOFF_RESPONSE = {
  id: 'handoff',
  object: 'chat.completion',
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: "I\'m not able to help with that directly — this type of request needs to be handled by a member of the TRAVLR team.\n\nPlease reach out to your dedicated account manager or contact us at **support@travlr.com** and we\'ll get back to you within one business day.",
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
};

// ─── Role-scoped system prompts ───────────────────────────────────────────────
function buildSystemPrompt(role: string, scopeContext: string): string {
  const base = `You are TRAVLR Assistant, an AI helper for the TRAVLR short-term rental management platform.
You help users navigate the app, understand their data, and draft outreach.
You NEVER invent financial figures, regulatory facts, or property data.
You NEVER access or discuss data belonging to other users.
If a question requires account-specific action (payouts, billing, legal, account changes, passwords), you MUST say you cannot help and direct the user to the TRAVLR support team at support@travlr.com.`;

  if (role === 'homeowner') {
    return `${base}

ROLE: Homeowner Portal Assistant
SCOPE: You may ONLY discuss data for this homeowner's own properties.
${scopeContext ? `Context: ${scopeContext}` : ''}
You CANNOT discuss: other homeowners' properties, internal CRM data, agent commissions, lead pipeline, enrichment data, or any internal business metrics.
If asked about anything outside your scope, politely decline and offer to connect them with their account manager.
Keep responses friendly and non-technical — homeowners are not real estate professionals.`;
  }

  if (role === 'agent') {
    return `${base}

ROLE: Agent Assistant
SCOPE: You may ONLY discuss leads assigned to this agent and general app navigation.
${scopeContext ? `Context: ${scopeContext}` : ''}
You CANNOT discuss: other agents' leads, commission data for other agents, homeowner financial details beyond what is needed for outreach, or enrichment provider details.
If asked about data outside your assignment, decline and suggest they contact their admin.`;
  }

  // Admin / default
  return `${base}

ROLE: Admin / Internal Assistant
You have broad access to discuss app features, lead data, and operational metrics.
Always remind users that AI-generated financial projections are estimates only.
When discussing enrichment data, remind users to comply with PDL ToS and applicable state privacy laws.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, provider, parameters, userRole, userId } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    // ── 1. Human-handoff check ────────────────────────────────────────────────
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
    const lastContent: string = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    if (HANDOFF_PATTERNS.some(p => p.test(lastContent))) {
      return NextResponse.json(HANDOFF_RESPONSE);
    }

    // ── 2. Role-scoping ───────────────────────────────────────────────────────
    let scopeContext = '';
    const role: string = userRole ?? 'admin';

    if ((role === 'homeowner' || role === 'agent') && userId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        if (role === 'homeowner') {
          const { data: props } = await supabase
            .from('leads')
            .select('address, city, state')
            .eq('homeowner_user_id', userId)
            .limit(20);
          if (props && props.length > 0) {
            const addrs = props
              .map((p: { address: string; city: string; state: string }) => `${p.address}, ${p.city}, ${p.state}`)
              .join('; ');
            scopeContext = `This homeowner's properties: ${addrs}`;
          }
        } else if (role === 'agent') {
          const { data: agentLeads } = await supabase
            .from('leads').select('address, city, state, stage').eq('agent_id', userId)
            .limit(30);
          if (agentLeads && agentLeads.length > 0) {
            const summary = agentLeads
              .map((l: { address: string; city: string; state: string; stage: string }) => `${l.address} (${l.stage})`)
              .join('; ');
            scopeContext = `This agent's assigned leads: ${summary}`;
          }
        }
      } catch {
        // Non-fatal — proceed without scope context
      }
    }

    // ── 3. Inject role-scoped system prompt ───────────────────────────────────
    const systemPrompt = buildSystemPrompt(role, scopeContext);
    const scopedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m: { role: string }) => m.role !== 'system'),
    ];

    // ── 4. Forward to OpenAI ──────────────────────────────────────────────────
    const selectedModel = model ?? 'gpt-4o-mini';
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    if (!apiKey || apiKey.startsWith('your-')) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Please add OPENAI_API_KEY to your .env file.' },
        { status: 503 }
      );
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: scopedMessages,
        max_tokens: parameters?.max_completion_tokens ?? parameters?.max_tokens ?? 1024,
        temperature: parameters?.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[AI Chat] OpenAI error ${aiResponse.status}:`, errText);
      return NextResponse.json(
        { error: `AI provider returned ${aiResponse.status}` },
        { status: aiResponse.status }
      );
    }

    const aiData = await aiResponse.json();
    return NextResponse.json(aiData);
  } catch (err) {
    console.error('[AI Chat Route]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
