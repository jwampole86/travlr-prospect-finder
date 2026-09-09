import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';

// ─── Anthropic Enrichment Validation API ─────────────────────────────────────
// Validates ownership records and market comparables for field-level authenticity.
// Returns per-field confidence scores and an overall authenticity verdict.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

export interface OwnershipValidationInput {
  leadId: string;
  address: string;
  city: string;
  state: string;
  ownerName?: string;
  ownershipType?: string;
  ownerMailingAddress?: string;
  ownerMailingCity?: string;
  ownerMailingState?: string;
}

export interface MarketCompValidationInput {
  leadId: string;
  address: string;
  city: string;
  state: string;
  listingPrice?: number;
  estimatedValue?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  daysOnMarket?: number;
  source?: string;
  enrichedAt?: string;
}

export interface FieldConfidence {
  field: string;
  value: string | number | null;
  confidence: number; // 0-100
  flags: string[];
}

export interface ValidationResult {
  leadId: string;
  validationType: 'ownership' | 'market_comp';
  overallConfidence: number;
  authentic: boolean;
  fieldScores: FieldConfidence[];
  anomalies: string[];
  recommendation: 'accept' | 'review' | 'reject';
  validatedAt: string;
}

function buildOwnershipPrompt(input: OwnershipValidationInput): string {
  return `You are a real estate data quality analyst. Validate the authenticity of this ownership record.

Property: ${input.address}, ${input.city}, ${input.state}
Owner Name: ${input.ownerName || 'Unknown'}
Ownership Type: ${input.ownershipType || 'Unknown'}
Owner Mailing Address: ${input.ownerMailingAddress || 'Unknown'}, ${input.ownerMailingCity || ''}, ${input.ownerMailingState || ''}

Analyze each field for authenticity. Check for:
- Name patterns consistent with real ownership (not placeholder/test data)
- Ownership type matching name format (LLC names should end in LLC/Inc, trusts in Trust/Estate)
- Mailing address plausibility (real city/state combinations)
- Internal consistency between fields

Return ONLY valid JSON in this exact format:
{
  "overallConfidence": <0-100>,
  "authentic": <true|false>,
  "fieldScores": [
    {"field": "ownerName", "value": "<value>", "confidence": <0-100>, "flags": []},
    {"field": "ownershipType", "value": "<value>", "confidence": <0-100>, "flags": []},
    {"field": "ownerMailingAddress", "value": "<value>", "confidence": <0-100>, "flags": []}
  ],
  "anomalies": [],
  "recommendation": "<accept|review|reject>"
}`;
}

function buildMarketCompPrompt(input: MarketCompValidationInput): string {
  const now = new Date();
  const enrichedDate = input.enrichedAt ? new Date(input.enrichedAt) : null;
  const daysSinceEnrichment = enrichedDate
    ? Math.floor((now.getTime() - enrichedDate.getTime()) / 86400000)
    : null;

  return `You are a real estate market data analyst. Validate the authenticity and freshness of these market comparables.

Property: ${input.address}, ${input.city}, ${input.state}
Listing Price: ${input.listingPrice ? '$' + input.listingPrice.toLocaleString() : 'Unknown'}
Estimated Value: ${input.estimatedValue ? '$' + input.estimatedValue.toLocaleString() : 'Unknown'}
Last Sale Price: ${input.lastSalePrice ? '$' + input.lastSalePrice.toLocaleString() : 'Unknown'}
Last Sale Date: ${input.lastSaleDate || 'Unknown'}
Days on Market: ${input.daysOnMarket ?? 'Unknown'}
Data Source: ${input.source || 'Unknown'}
Data Age: ${daysSinceEnrichment !== null ? daysSinceEnrichment + ' days old' : 'Unknown'}

Analyze for:
- Price anomalies (listing vs estimated value deviation > 30% is suspicious)
- Data freshness (comps older than 90 days are stale for fast markets)
- Last sale date plausibility
- Days on market consistency with price tier
- Source credibility

Return ONLY valid JSON in this exact format:
{
  "overallConfidence": <0-100>,
  "authentic": <true|false>,
  "fieldScores": [
    {"field": "listingPrice", "value": <number|null>, "confidence": <0-100>, "flags": []},
    {"field": "estimatedValue", "value": <number|null>, "confidence": <0-100>, "flags": []},
    {"field": "lastSalePrice", "value": <number|null>, "confidence": <0-100>, "flags": []},
    {"field": "lastSaleDate", "value": "<value>", "confidence": <0-100>, "flags": []},
    {"field": "daysOnMarket", "value": <number|null>, "confidence": <0-100>, "flags": []},
    {"field": "dataFreshness", "value": "${daysSinceEnrichment !== null ? daysSinceEnrichment + ' days' : 'unknown'}", "confidence": <0-100>, "flags": []}
  ],
  "anomalies": [],
  "recommendation": "<accept|review|reject>"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body as {
      type: 'ownership' | 'market_comp';
      data: OwnershipValidationInput | MarketCompValidationInput;
    };

    if (!type || !data?.leadId) {
      return NextResponse.json({ error: 'type and data.leadId are required' }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const prompt =
      type === 'ownership'
        ? buildOwnershipPrompt(data as OwnershipValidationInput)
        : buildMarketCompPrompt(data as MarketCompValidationInput);

    const response = await completion({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      api_key: ANTHROPIC_API_KEY,
      temperature: 0.1,
      max_tokens: 800,
    } as any);

    const rawContent = (response as any)?.choices?.[0]?.message?.content ?? '';

    // Extract JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Anthropic response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: ValidationResult = {
      leadId: data.leadId,
      validationType: type,
      overallConfidence: Math.min(100, Math.max(0, parsed.overallConfidence ?? 50)),
      authentic: parsed.authentic ?? true,
      fieldScores: parsed.fieldScores ?? [],
      anomalies: parsed.anomalies ?? [],
      recommendation: parsed.recommendation ?? 'review',
      validatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('[validate-enrichment]', err);
    return NextResponse.json(
      { error: 'Validation failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
