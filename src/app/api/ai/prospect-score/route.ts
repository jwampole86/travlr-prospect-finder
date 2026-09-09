import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { calculateProspectScore, type ProspectScoringInput } from '@/lib/scoring/prospectScoring';

/**
 * POST /api/ai/prospect-score
 * Uses a deterministic TRAVLR scoring baseline, then optionally asks Claude to refine
 * reasoning and next action around the same factor model.
 */

export async function POST(req: NextRequest) {
  let body: {
    leadId?: string;
    propertyDetails?: {
      address?: string;
      city?: string;
      state?: string;
      bedrooms?: number;
      bathrooms?: number;
      sqft?: number;
      propertyType?: string;
      estimatedValue?: number;
      yearBuilt?: number;
    };
    regulatoryContext?: {
      state?: string;
      city?: string;
      strPermitRequired?: boolean;
      strBanned?: boolean;
      hoaRestrictions?: boolean;
      regulationComplexity?: 'low' | 'medium' | 'high' | 'unknown';
      notes?: string;
    };
    contactHistory?: {
      totalCalls?: number;
      lastCalledAt?: string;
      outcomes?: Record<string, number>;
      emailOpens?: number;
      emailClicks?: number;
      smsReplies?: number;
      cadenceStep?: number;
      totalSteps?: number;
      daysSinceFirstContact?: number;
    };
    currentScore?: number;
    stage?: string;
    batchLeads?: Array<{
      leadId: string;
      address?: string;
      state?: string;
      currentScore?: number;
      stage?: string;
      totalCalls?: number;
      outcomes?: Record<string, number>;
      regulationComplexity?: string;
      emailOpens?: number;
      smsReplies?: number;
    }>;
  } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ─── Batch mode: score multiple leads at once ─────────────────────────────
  if (body.batchLeads && body.batchLeads.length > 0) {
    const baselineResults = body.batchLeads.map((lead) => {
      const baseline = calculateProspectScore(mapBatchLeadToScoringInput(lead));
      return {
        leadId: lead.leadId,
        aiScore: baseline.score,
        confidence: baseline.blockers.length > 0 ? 0.9 : 0.72,
        reasoning: baseline.blockers[0] || `Baseline ${baseline.band} priority from TRAVLR scoring factors.`,
        prioritySignal: baseline.band === 'nurture' ? 'warm' : baseline.band === 'blocked' ? 'dead' : baseline.band,
      };
    });

    if (!apiKey) {
      return NextResponse.json({ batch: true, results: baselineResults, model: 'deterministic-baseline' });
    }

    try {
      const batchPrompt = buildBatchScoringPrompt(body.batchLeads);
      const response = await completion({
        model: 'claude-sonnet-4-6',
        messages: [
          {
            role: 'system',
            content: `You are a real estate outreach scoring expert for TRAVLR, a short-term rental management company. 
You analyze leads and produce refined prospect scores (0-100) that account for property potential, regulatory environment, and engagement signals.
Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
          },
          { role: 'user', content: batchPrompt },
        ],
        stream: false,
        api_key: apiKey,
        temperature: 0.2,
        max_tokens: 2000,
      } as any);

      const content = (response as any)?.choices?.[0]?.message?.content || '';
      let parsed: { scores: Array<{ leadId: string; aiScore: number; confidence: number; reasoning: string; prioritySignal: string }> };

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        return NextResponse.json({ error: 'Failed to parse AI batch response', raw: content }, { status: 500 });
      }

      return NextResponse.json({ batch: true, results: parsed.scores || [] });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Batch scoring failed' }, { status: 500 });
    }
  }

  // ─── Single lead scoring ──────────────────────────────────────────────────
  const { propertyDetails, regulatoryContext, contactHistory, currentScore, stage } = body;

  if (!propertyDetails && !contactHistory) {
    return NextResponse.json({ error: 'propertyDetails or contactHistory required' }, { status: 400 });
  }

  const baseline = calculateProspectScore(mapSingleLeadToScoringInput({ propertyDetails, regulatoryContext, contactHistory, stage }));

  if (!apiKey) {
    return NextResponse.json({
      leadId: body.leadId,
      aiScore: baseline.score,
      confidence: baseline.blockers.length > 0 ? 0.9 : 0.72,
      reasoning: baseline.blockers[0] || `Deterministic ${baseline.band} score from TRAVLR scoring factors.`,
      scoreBreakdown: Object.fromEntries(baseline.factors.map((factor) => [factor.key, factor.weightedPoints])),
      prioritySignal: baseline.band === 'nurture' ? 'warm' : baseline.band === 'blocked' ? 'dead' : baseline.band,
      recommendedAction: baseline.blockers.length > 0 ? 'Resolve compliance or DNC blockers before outreach.' : 'Prioritize according to the highest weighted factor gaps.',
      riskFlags: baseline.blockers,
      model: 'deterministic-baseline',
      scoredAt: new Date().toISOString(),
    });
  }

  const prompt = buildSingleScoringPrompt({
    propertyDetails,
    regulatoryContext,
    contactHistory,
    currentScore: currentScore ?? baseline.score,
    stage,
  });

  try {
    const response = await completion({
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'system',
          content: `You are a real estate outreach scoring expert for TRAVLR, a short-term rental management company.
You analyze individual leads and produce a refined prospect score (0-100) calibrated against real STR market conversion data.

TRAVLR SCORING MODEL:
- Revenue Potential (25): estimated net/gross monthly opportunity, ADR, and luxury opportunity
- Property Fit (25): 3-5 bedroom private homes with 2+ baths fit best for luxury STR demand
- Regulatory Feasibility (25): Allowed > Restricted > Pending/Unknown; Banned/Prohibited is a blocker
- Lead Quality (15): verified owner, verified address, callable phone, and email completeness
- Engagement & Freshness (10): SMS replies, callbacks, clicks, answered calls, pipeline progress, and recent listing/activity

SCORE BANDS:
- 80–100: Hot — high-revenue, strong home fit, feasible STR rules, verified contact path, or active owner engagement
- 60–79: Warm — viable lead with one meaningful friction point
- 40–59: Nurture — possible lead that needs enrichment, compliance review, or more signals
- 0–39: Cold/blocked — prohibited/DNC/terminal stage or weak data across multiple factors
- NOTE: AI may refine within the band but should not override hard blockers above 35

Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      api_key: apiKey,
      temperature: 0.2,
      max_tokens: 800,
    } as any);

    const content = (response as any)?.choices?.[0]?.message?.content || '';
    let parsed: {
      aiScore: number;
      confidence: number;
      reasoning: string;
      scoreBreakdown: {
        revenuePotential: number;
        propertyFit: number;
        regulatoryFeasibility: number;
        leadQuality: number;
        engagement: number;
      };
      prioritySignal: 'hot' | 'warm' | 'cold' | 'dead';
      recommendedAction: string;
      riskFlags: string[];
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: content }, { status: 500 });
    }

    return NextResponse.json({
      leadId: body.leadId,
      aiScore: Math.min(100, Math.max(0, Math.round(parsed.aiScore ?? baseline.score))),
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.72)),
      reasoning: parsed.reasoning,
      scoreBreakdown: parsed.scoreBreakdown || Object.fromEntries(baseline.factors.map((factor) => [factor.key, factor.weightedPoints])),
      prioritySignal: parsed.prioritySignal,
      recommendedAction: parsed.recommendedAction,
      riskFlags: [...baseline.blockers, ...(parsed.riskFlags || [])],
      baselineScore: baseline.score,
      model: 'claude-sonnet-4-6',
      scoredAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scoring failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Deterministic TRAVLR prospect score with optional Claude refinement',
    factors: ['revenuePotential', 'propertyFit', 'regulatoryFeasibility', 'leadQuality', 'engagement'],
    usage: 'POST /api/ai/prospect-score with propertyDetails, regulatoryContext, contactHistory',
    batchUsage: 'POST with batchLeads array for bulk scoring',
  });
}

function regulationFromContext(context?: Record<string, unknown>): string {
  if (context?.strBanned === true) return 'Prohibited';
  if (context?.hoaRestrictions === true) return 'Restricted';
  if (context?.strPermitRequired === true) return 'Restricted';
  const complexity = String(context?.regulationComplexity || '').toLowerCase();
  if (complexity === 'low') return 'Allowed';
  if (complexity === 'medium' || complexity === 'high') return 'Restricted';
  return 'Unknown';
}

function mapSingleLeadToScoringInput(data: {
  propertyDetails?: Record<string, unknown>;
  regulatoryContext?: Record<string, unknown>;
  contactHistory?: Record<string, unknown>;
  stage?: string;
}): ProspectScoringInput {
  const property = data.propertyDetails || {};
  const contact = data.contactHistory || {};
  const outcomes = (contact.outcomes || {}) as Record<string, number>;

  return {
    estimatedNetMonthly: Number(property.estimatedNetMonthly || property.estimatedGrossMonthly || 0) || null,
    price: Number(property.estimatedValue || 0) || null,
    beds: Number(property.bedrooms || property.beds || 0) || null,
    baths: Number(property.bathrooms || property.baths || 0) || null,
    propertyType: String(property.propertyType || ''),
    regulationStatus: regulationFromContext(data.regulatoryContext),
    hasPhone: Boolean(property.contactPhone || contact.totalCalls),
    contactPhone: typeof property.contactPhone === 'string' ? property.contactPhone : null,
    contactEmail: typeof property.contactEmail === 'string' ? property.contactEmail : null,
    emailOpens: Number(contact.emailOpens || 0),
    emailClicks: Number(contact.emailClicks || 0),
    smsReplies: Number(contact.smsReplies || outcomes.sms_reply || 0),
    callsAnswered: Number(outcomes.answered || outcomes.connected || 0),
    callbackRequests: Number(outcomes.callback_request || outcomes.callback || 0),
    stage: data.stage,
  };
}

function mapBatchLeadToScoringInput(lead: Record<string, unknown>): ProspectScoringInput {
  const outcomes = (lead.outcomes || {}) as Record<string, number>;
  const regulationComplexity = String(lead.regulationComplexity || '').toLowerCase();
  return {
    estimatedNetMonthly: Number(lead.estimatedNetMonthly || lead.estimatedGrossMonthly || 0) || null,
    beds: Number(lead.bedrooms || lead.beds || 0) || null,
    baths: Number(lead.bathrooms || lead.baths || 0) || null,
    propertyType: typeof lead.propertyType === 'string' ? lead.propertyType : null,
    regulationStatus: regulationComplexity === 'low' ? 'Allowed' : regulationComplexity === 'medium' || regulationComplexity === 'high' ? 'Restricted' : 'Unknown',
    contactPhone: typeof lead.contactPhone === 'string' ? lead.contactPhone : null,
    contactEmail: typeof lead.contactEmail === 'string' ? lead.contactEmail : null,
    emailOpens: Number(lead.emailOpens || 0),
    emailClicks: Number(lead.emailClicks || 0),
    smsReplies: Number(lead.smsReplies || outcomes.sms_reply || 0),
    callsAnswered: Number(outcomes.answered || outcomes.connected || 0),
    callbackRequests: Number(outcomes.callback_request || outcomes.callback || 0),
    stage: typeof lead.stage === 'string' ? lead.stage : null,
  };
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSingleScoringPrompt(data: {
  propertyDetails?: Record<string, unknown>;
  regulatoryContext?: Record<string, unknown>;
  contactHistory?: Record<string, unknown>;
  currentScore?: number;
  stage?: string;
}): string {
  return `Score this TRAVLR short-term rental management prospect.
Deterministic TRAVLR baseline score: ${data.currentScore ?? 'unknown'}, Stage: ${data.stage ?? 'unknown'}.
Use the baseline as the anchor. Refine only when the supplied details clearly support a higher or lower score.

PROPERTY DETAILS:
${JSON.stringify(data.propertyDetails || {}, null, 2)}

REGULATORY CONTEXT:
${JSON.stringify(data.regulatoryContext || {}, null, 2)}

CONTACT HISTORY:
${JSON.stringify(data.contactHistory || {}, null, 2)}

Return a JSON object with this exact structure:
{
  "aiScore": <0-100 integer>,
  "confidence": <0.0-1.0 float>,
  "reasoning": "<2-3 sentence explanation referencing real-market conversion factors>",
  "scoreBreakdown": {
    "revenuePotential": <0-25, based on estimated net/gross monthly opportunity>,
    "propertyFit": <0-25, based on bedroom/bath/private-home fit for luxury STR demand>,
    "regulatoryFeasibility": <0-25, higher = lower risk and better STR feasibility>,
    "leadQuality": <0-15, based on owner/address/phone/email verification>,
    "engagement": <0-10, based on replies, callbacks, clicks, answered calls, stage, and freshness>
  },
  "prioritySignal": "<hot|warm|cold|dead>",
  "recommendedAction": "<specific next action for agent>",
  "riskFlags": ["<flag1>", "<flag2>"]
}

Scoring guidance:
- 80-100: Hot — high-revenue, strong home fit, legal/feasible STR path, verified contact route, or active owner engagement
- 60-79: Warm — viable lead with one meaningful friction point
- 40-59: Nurture — possible but needs enrichment, compliance review, or stronger response signals
- 0-39: Cold/blocked — DNC/prohibited/terminal stage or weak signals across multiple factors

Hard blockers: DNC/do-not-contact, STR prohibited/banned, and terminal stages should cap scores even when revenue looks strong.
Engagement factors that raise urgency: SMS reply, callback request, email click, answered calls, interested/proposal/contract stage.
Freshness: recent listings/activity are better; very stale listings should not automatically score higher without engagement.`;
}

function buildBatchScoringPrompt(leads: Array<Record<string, unknown>>): string {
  return `Score these ${leads.length} TRAVLR short-term rental management prospects for outreach priority.
Use the same factor model as the deterministic baseline: revenue potential, property fit, regulatory feasibility, lead quality, and engagement/freshness.

LEADS:
${JSON.stringify(leads, null, 2)}

Return a JSON object with this exact structure:
{
  "scores": [
    {
      "leadId": "<id>",
      "aiScore": <0-100 integer>,
      "confidence": <0.0-1.0>,
      "reasoning": "<1 sentence referencing the strongest factor and biggest friction>",
      "prioritySignal": "<hot|warm|cold|dead>"
    }
  ]
}

Score bands:
- 80-100: Hot — high-revenue, strong home fit, feasible STR rules, verified contact path, or active owner engagement
- 60-79: Warm — viable lead with one meaningful friction point
- 40-59: Nurture — possible but needs enrichment, compliance review, or stronger response signals
- 0-39: Cold/blocked — DNC/prohibited/terminal stage or weak signals across multiple factors
Hard blockers should cap scores even when revenue looks strong.`;
}
