import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';

/**
 * POST /api/ai/prospect-score
 * Uses Claude to analyze property details, regulatory complexity, and contact history
 * to refine prospect scores beyond static rule-based scoring.
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
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 400 });
  }

  // ─── Batch mode: score multiple leads at once ─────────────────────────────
  if (body.batchLeads && body.batchLeads.length > 0) {
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
        parameters: {
          temperature: 0.2,
          max_tokens: 2000,
        },
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

  const prompt = buildSingleScoringPrompt({
    propertyDetails,
    regulatoryContext,
    contactHistory,
    currentScore,
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

REAL-MARKET CALIBRATION (post-synthetic-filter baselines):
- 2-3 BR properties convert at 2.4× the rate of studios in STR markets
- Optimal rent price band: $1,800–$3,800/mo (actual median in CO/TX/FL/TN target markets)
- Days-on-market (DOM) is the strongest single predictor of owner responsiveness
- ≥2 bathrooms correlates with group-travel demand and higher ADR
- STR-banned or HOA-restricted properties rarely convert regardless of other signals

SCORE BANDS (real-market calibrated):
- 80–92: Hot — 2-3 BR, $1,800–$3,800 rent, ≤7 DOM, ≥2 baths, low regulatory risk, active engagement
- 60–79: Warm — good potential but one friction factor (price, freshness, or mild regulation)
- 40–59: Lukewarm — needs nurturing; stale listing, edge-case size, or moderate regulatory risk
- 15–39: Cold — low conversion likelihood; STR banned, HOA restricted, >60 DOM, or poor engagement
- NOTE: Scores above 92 are reserved for exceptional leads with confirmed owner interest

Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      api_key: apiKey,
      parameters: {
        temperature: 0.2,
        max_tokens: 800,
        reasoning_effort: 'medium',
      },
    } as any);

    const content = (response as any)?.choices?.[0]?.message?.content || '';
    let parsed: {
      aiScore: number;
      confidence: number;
      reasoning: string;
      scoreBreakdown: {
        propertyPotential: number;
        regulatoryRisk: number;
        engagementSignal: number;
        contactRecency: number;
        conversionLikelihood: number;
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
      aiScore: parsed.aiScore,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      scoreBreakdown: parsed.scoreBreakdown,
      prioritySignal: parsed.prioritySignal,
      recommendedAction: parsed.recommendedAction,
      riskFlags: parsed.riskFlags || [],
      model: 'claude-sonnet-4-6',
      scoredAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scoring failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Claude-powered prospect score refinement beyond static rules',
    usage: 'POST /api/ai/prospect-score with propertyDetails, regulatoryContext, contactHistory',
    batchUsage: 'POST with batchLeads array for bulk scoring',
  });
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSingleScoringPrompt(data: {
  propertyDetails?: Record<string, unknown>;
  regulatoryContext?: Record<string, unknown>;
  contactHistory?: Record<string, unknown>;
  currentScore?: number;
  stage?: string;
}): string {
  return `Score this real estate prospect for short-term rental outreach.
Rule-based score (re-calibrated against real-market data): ${data.currentScore ?? 'unknown'}, Stage: ${data.stage ?? 'unknown'}.

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
    "propertyPotential": <0-28, based on bedroom/bath profile for STR demand>,
    "regulatoryRisk": <0-24, higher = lower risk = better score>,
    "engagementSignal": <0-26, based on contact history and responsiveness>,
    "contactRecency": <0-22, based on DOM and last contact date>
  },
  "prioritySignal": "<hot|warm|cold|dead>",
  "recommendedAction": "<specific next action for agent>",
  "riskFlags": ["<flag1>", "<flag2>"]
}

Real-market scoring guidance (calibrated on actual STR conversion outcomes):
- 80-92: Hot — 2-3 BR, $1,800–$3,800/mo, ≤7 DOM, ≥2 baths, low regulatory risk, active engagement
- 60-79: Warm — good potential, minor friction
- 40-59: Lukewarm — needs nurturing
- 15-39: Cold — low conversion likelihood
- Scores above 92 only for confirmed owner interest with signed intent or active negotiation

Regulatory factors that LOWER score: STR banned (-30 pts), HOA restrictions (-20 pts), complex permit requirements (-10 pts)
Engagement factors that RAISE score: SMS reply (+15), callback request (+12), email click (+8), multiple calls answered (+10)
Freshness factors: ≤7 DOM (+26), 8-14 DOM (+20), 15-30 DOM (+12), 31-60 DOM (+6), >60 DOM (+2)`;
}

function buildBatchScoringPrompt(leads: Array<Record<string, unknown>>): string {
  return `Score these ${leads.length} real estate prospects for short-term rental outreach priority.
Use real-market STR conversion data as calibration baseline.

REAL-MARKET BASELINES:
- 2-3 BR properties: highest STR conversion rate (2.4× vs studios)
- Optimal rent: $1,800–$3,800/mo in CO/TX/FL/TN target markets
- DOM ≤7 days: strongest owner responsiveness signal
- STR banned or HOA restricted: near-zero conversion regardless of other factors

LEADS:
${JSON.stringify(leads, null, 2)}

Return a JSON object with this exact structure:
{
  "scores": [
    {
      "leadId": "<id>",
      "aiScore": <0-100 integer, calibrated to real-market conversion patterns>,
      "confidence": <0.0-1.0>,
      "reasoning": "<1 sentence referencing key conversion factors>",
      "prioritySignal": "<hot|warm|cold|dead>"
    }
  ]
}

Score bands (real-market calibrated):
- 80-92: Hot — optimal STR profile, motivated owner, low regulatory risk
- 60-79: Warm — good potential, minor friction
- 40-59: Lukewarm — needs nurturing
- 15-39: Cold — low conversion likelihood
Higher scores = higher priority for agent outreach.`;
}
