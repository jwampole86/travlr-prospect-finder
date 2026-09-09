import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';

/**
 * POST /api/ai/lead-qualification
 * Uses Claude to analyze homeowner signals and predict lead-to-qualified probability.
 *
 * Signals analyzed:
 * - Owner tenure (how long they've owned the property)
 * - Property profile (beds, baths, size, type, value, location)
 * - Response patterns (call pickups, SMS replies, email opens/clicks, cadence engagement)
 * - STR regulatory context (city/local rules)
 * - Pipeline stage and outreach history
 */

export interface LeadQualificationRequest {
  leadId: string;
  ownerProfile?: {
    tenureYears?: number | null;
    ownershipType?: string | null; // 'individual', 'llc', 'trust', 'corporate'
    isAbsenteeOwner?: boolean | null;
    portfolioSize?: number | null; // number of properties owned
    estimatedEquity?: number | null;
    ownerAge?: number | null;
  };
  propertyProfile?: {
    address?: string;
    city?: string;
    state?: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    propertyType?: string;
    estimatedValue?: number;
    estimatedRent?: number;
    yearBuilt?: number;
    daysOnMarket?: number;
    estimatedGrossMonthly?: number;
    estimatedNetMonthly?: number;
    estimatedADR?: number;
    estimatedOccupancy?: number;
  };
  responsePatterns?: {
    totalCalls?: number;
    callsAnswered?: number;
    callbackRequests?: number;
    emailOpens?: number;
    emailClicks?: number;
    smsReplies?: number;
    lastContactedAt?: string | null;
    daysSinceLastContact?: number | null;
    cadenceStep?: number;
    totalCadenceSteps?: number;
    outreachChannel?: string;
    responseRate?: number | null;
  };
  regulatoryContext?: {
    cityRegulationStatus?: string | null;
    jurisdictionName?: string | null;
    permitRequired?: boolean | null;
    primaryResidenceRequired?: boolean | null;
    nightCap?: number | null;
    minimumStay?: number | null;
    strAllowed?: boolean | null;
  };
  currentStage?: string;
  currentScore?: number;
}

export interface LeadQualificationResult {
  leadId: string;
  qualificationScore: number;         // 0–100: probability of converting to qualified
  qualificationProbability: number;   // 0.0–1.0
  confidence: number;                 // 0.0–1.0
  priorityTier: 'high' | 'medium' | 'low' | 'disqualified';
  reasoning: string;                  // 2–3 sentence explanation
  keySignals: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  scoreBreakdown: {
    ownerTenureSignal: number;        // 0–25
    propertyFitSignal: number;        // 0–25
    responseEngagementSignal: number; // 0–25
    regulatoryFeasibility: number;    // 0–25
  };
  recommendedAction: string;
  outreachPriority: 'immediate' | 'this_week' | 'next_cycle' | 'deprioritize';
  qualifiedAt: string;
  model: string;
}

export async function POST(req: NextRequest) {
  let body: LeadQualificationRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const prompt = buildQualificationPrompt(body);

  try {
    const response = await completion({
      model: 'claude-sonnet-4-6',
      messages: [
        {
          role: 'system',
          content: `You are a senior real estate outreach qualification analyst for TRAVLR Vacation Homes, a short-term rental property management company.

Your job is to analyze homeowner signals and predict the probability that a lead will convert to a qualified prospect — meaning the homeowner is genuinely interested in professional STR management and is likely to sign a management agreement.

QUALIFICATION CRITERIA (what makes a lead "qualified"):
1. Owner is open to STR management (not just renting long-term)
2. Property is STR-feasible (right size, location, regulatory environment)
3. Owner is responsive and engaged with outreach
4. No major disqualifying factors (HOA ban, owner-occupancy requirement, prohibited jurisdiction)
5. Owner tenure suggests stability (not flipping, not in distress)

SCORING BANDS:
- 80–100: High priority — strong signals across all dimensions, likely to qualify quickly
- 60–79: Medium priority — good fit with some friction; worth continued outreach
- 40–59: Low priority — possible but needs nurturing; one or more weak signals
- 0–39: Disqualified or near-disqualified — major blockers present

OWNER TENURE SIGNALS:
- 5–15 years ownership: optimal (stable, not flipping, may be open to passive income)
- 15+ years: very stable, may be resistant to change but high equity
- 1–4 years: may still be settling in, lower conversion rate
- <1 year: recently acquired, unlikely to convert immediately
- Unknown: neutral, do not penalize

RESPONSE PATTERN SIGNALS:
- SMS reply: strongest positive signal (+20 pts equivalent)
- Callback request: very strong (+15)
- Email click: moderate (+10)
- Email open only: weak (+5)
- No response after 3+ touches: negative signal
- Call answered: positive (+8)

Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      api_key: apiKey,
      temperature: 0.15,
      max_tokens: 900,
    } as any);

    const content = (response as any)?.choices?.[0]?.message?.content || '';

    let parsed: {
      qualificationScore: number;
      qualificationProbability: number;
      confidence: number;
      priorityTier: 'high' | 'medium' | 'low' | 'disqualified';
      reasoning: string;
      keySignals: { positive: string[]; negative: string[]; neutral: string[] };
      scoreBreakdown: {
        ownerTenureSignal: number;
        propertyFitSignal: number;
        responseEngagementSignal: number;
        regulatoryFeasibility: number;
      };
      recommendedAction: string;
      outreachPriority: 'immediate' | 'this_week' | 'next_cycle' | 'deprioritize';
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI qualification response', raw: content },
        { status: 500 }
      );
    }

    const result: LeadQualificationResult = {
      leadId: body.leadId,
      qualificationScore: Math.min(100, Math.max(0, Math.round(parsed.qualificationScore))),
      qualificationProbability: Math.min(1, Math.max(0, parsed.qualificationProbability)),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      priorityTier: parsed.priorityTier || 'low',
      reasoning: parsed.reasoning || '',
      keySignals: {
        positive: parsed.keySignals?.positive || [],
        negative: parsed.keySignals?.negative || [],
        neutral: parsed.keySignals?.neutral || [],
      },
      scoreBreakdown: {
        ownerTenureSignal: Math.min(25, Math.max(0, parsed.scoreBreakdown?.ownerTenureSignal ?? 0)),
        propertyFitSignal: Math.min(25, Math.max(0, parsed.scoreBreakdown?.propertyFitSignal ?? 0)),
        responseEngagementSignal: Math.min(25, Math.max(0, parsed.scoreBreakdown?.responseEngagementSignal ?? 0)),
        regulatoryFeasibility: Math.min(25, Math.max(0, parsed.scoreBreakdown?.regulatoryFeasibility ?? 0)),
      },
      recommendedAction: parsed.recommendedAction || '',
      outreachPriority: parsed.outreachPriority || 'next_cycle',
      qualifiedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Qualification analysis failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Claude-powered lead qualification probability analysis',
    signals: ['owner tenure', 'property profile', 'response patterns', 'regulatory context'],
    usage: 'POST /api/ai/lead-qualification with leadId + signal data',
  });
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildQualificationPrompt(data: LeadQualificationRequest): string {
  const {
    ownerProfile,
    propertyProfile,
    responsePatterns,
    regulatoryContext,
    currentStage,
    currentScore,
  } = data;

  return `Analyze this homeowner lead and predict lead-to-qualified probability for TRAVLR STR management outreach.

CURRENT STAGE: ${currentStage || 'Unknown'}
CURRENT RULE-BASED SCORE: ${currentScore ?? 'Unknown'}

OWNER PROFILE:
${JSON.stringify(ownerProfile || {}, null, 2)}

PROPERTY PROFILE:
${JSON.stringify(propertyProfile || {}, null, 2)}

RESPONSE PATTERNS (engagement signals):
${JSON.stringify(responsePatterns || {}, null, 2)}

REGULATORY CONTEXT:
${JSON.stringify(regulatoryContext || {}, null, 2)}

Return a JSON object with this exact structure:
{
  "qualificationScore": <0-100 integer — probability of converting to qualified>,
  "qualificationProbability": <0.0-1.0 float>,
  "confidence": <0.0-1.0 float — how confident you are given available data>,
  "priorityTier": "<high|medium|low|disqualified>",
  "reasoning": "<2-3 sentences explaining the qualification prediction, referencing specific signals>",
  "keySignals": {
    "positive": ["<signal1>", "<signal2>"],
    "negative": ["<signal1>"],
    "neutral": ["<signal1>"]
  },
  "scoreBreakdown": {
    "ownerTenureSignal": <0-25>,
    "propertyFitSignal": <0-25>,
    "responseEngagementSignal": <0-25>,
    "regulatoryFeasibility": <0-25>
  },
  "recommendedAction": "<specific next action for agent before outreach>",
  "outreachPriority": "<immediate|this_week|next_cycle|deprioritize>"
}

Scoring guidance:
- priorityTier "high": qualificationScore 80–100
- priorityTier "medium": qualificationScore 60–79
- priorityTier "low": qualificationScore 40–59
- priorityTier "disqualified": qualificationScore 0–39 (major blockers: STR prohibited, owner-occupancy required, no engagement after 5+ touches)
- If data is sparse, set confidence lower (0.3–0.5) and score conservatively
- Never fabricate signals not present in the data`;
}
