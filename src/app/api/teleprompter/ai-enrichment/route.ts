import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';

const ENRICHMENT_SYSTEM_PROMPT = `You are TRAVLR's AI Call Preparation Engine. Given a prospect's profile, generate highly personalized call preparation content for a luxury short-term rental outreach agent.

Your output must be a JSON object with these exact keys:
{
  "openingLines": [string, string, string],
  "objectionHandlers": [
    { "objection": string, "handler": string },
    { "objection": string, "handler": string },
    { "objection": string, "handler": string }
  ],
  "callPath": [
    { "step": string, "guidance": string }
  ],
  "talkingPoints": [string, string, string],
  "confidenceBooster": string
}

Rules:
- openingLines: 3 warm, natural opening lines personalized to the prospect's luxury status, location, and property profile. Never robotic or generic.
- objectionHandlers: 3 likely objections for this prospect type with natural, confident responses. Base on regulation state and luxury classification.
- callPath: 4-5 step call flow tailored to this prospect's profile (luxury vs standard, regulated vs permissive state).
- talkingPoints: 3 specific talking points based on their property profile and revenue potential.
- confidenceBooster: One short motivational insight about why this prospect is worth calling.

Tone: Warm, professional, boutique-luxury. Never pushy. Never fabricate specific revenue numbers.`;

export async function POST(req: NextRequest) {
  try {
    const { leadContext } = await req.json();

    if (!leadContext) {
      return NextResponse.json({ error: 'leadContext required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

    const userMessage = `Generate personalized call preparation for this prospect:

Contact: ${leadContext.contactName || 'Unknown Owner'}
Property Address: ${leadContext.address || 'Unknown'}
City: ${leadContext.city || 'Unknown'}
State: ${leadContext.state || 'Unknown'}
Luxury Classification: ${leadContext.luxuryClassification || 'Standard'}
Regulation State: ${leadContext.regulationState || 'Unknown — assume permissive'}
Estimated Monthly Revenue: ${leadContext.estimatedNetMonthly ? `$${leadContext.estimatedNetMonthly.toLocaleString()}/mo` : 'Unknown'}
Prospect Score: ${leadContext.prospectScore || 'N/A'}
Property Type: ${leadContext.propertyType || 'Single Family Home'}
Bedrooms: ${leadContext.bedrooms || 'Unknown'}
Call Script: ${leadContext.scriptId || 'initial_outreach'}
Previous Calls: ${leadContext.callCount || 0}

Generate the JSON response now.`;

    const response = await completion({
      model: 'claude-haiku-4-5-20251001',
      messages: [
        { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      api_key: apiKey,
      max_tokens: 1200,
      temperature: 0.7,
    });

    const content = response?.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: content }, { status: 500 });
    }

    return NextResponse.json({ success: true, enrichment: parsed });
  } catch (err) {
    console.error('[teleprompter/ai-enrichment]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
