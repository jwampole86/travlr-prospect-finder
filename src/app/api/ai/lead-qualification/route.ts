import { NextRequest, NextResponse } from 'next/server';
import { completion } from '@rocketnew/llm-sdk';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateProspectScore, leadRowToScoringInput, SCORING_LEAD_COLUMNS } from '@/lib/scoring/prospectScoring';
import { loadScoreSignals } from '@/lib/services/leadScoreSignals';

/**
 * POST /api/ai/lead-qualification
 * Estimates how likely a lead is to become a qualified prospect. The facts are read from the database for the lead id (never trusted from the
 * browser), scored with the same rules as the main prospect score, then refined by Claude inside guardrails: an owner who replied is never
 * scored low because of the listing, and an owner who declined or opted out is never scored high.
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

type Row = Record<string, any>;
const NEGATIVE_INTENTS = ['no', 'stop', 'wrong_contact', 'opt_out', 'not_interested'];
const tierOf = (n: number): LeadQualificationResult['priorityTier'] => (n >= 80 ? 'high' : n >= 60 ? 'medium' : n >= 40 ? 'low' : 'disqualified');
const priorityOf = (n: number): LeadQualificationResult['outreachPriority'] => (n >= 80 ? 'immediate' : n >= 60 ? 'this_week' : n >= 40 ? 'next_cycle' : 'deprioritize');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hidePhones = (t: string) => t.replace(/\+?\d[\d\s().-]{8,}\d/g, '[number]');

export async function POST(req: NextRequest) {
  let body: Partial<LeadQualificationRequest>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });

  const auth = await requireLeadAccess(req, body.leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: row } = await db.from('leads').select(`${SCORING_LEAD_COLUMNS},id,address,city,state,owner_name,sms_opt_in`).eq('id', body.leadId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const [{ data: engRows }, signalMap] = await Promise.all([
    db.from('sms_lead_engagement').select('reply_intent,reply_text,reply_at,temperature,opted_in,opted_out,phone_quality,human_clicks,estimate_viewed,time_on_page_s,contact_requested_at,estimate_submitted_at,updated_at').eq('lead_id', body.leadId).order('updated_at', { ascending: false }).limit(5),
    loadScoreSignals(db, [body.leadId]),
  ]);
  const eng = (engRows ?? []) as Row[];
  const signals = signalMap.get(body.leadId) ?? null;

  const tags: string[] = Array.isArray(row.tags) ? row.tags.map(String) : [];
  const declined = !!row.sms_opted_out_at || row.pipeline_status === 'rejected' || tags.some((t) => ['sms:status:opted_out', 'sms:status:declined', 'sms:status:wrong_contact'].includes(t))
    || eng.some((e) => e.opted_out || NEGATIVE_INTENTS.includes(String(e.reply_intent)) || e.phone_quality === 'wrong_person');
  const replyRow = eng.find((e) => e.reply_at || e.reply_text);
  const saidYes = !declined && eng.some((e) => e.reply_intent === 'yes' || e.opted_in === true);
  const asked = !declined && eng.some((e) => e.contact_requested_at || e.estimate_submitted_at);
  const replied = !declined && (saidYes || !!replyRow || (signals?.replies ?? 0) > 0 || !!row.outreach_responded_at || !!row.escalated_at);
  const hot = !declined && (eng.some((e) => e.temperature === 'hot') || tags.includes('sms:status:hot'));
  const engaged = replied || asked || hot;
  const lastEngagementAt = replyRow?.reply_at ?? signals?.lastEngagementAt ?? row.outreach_responded_at ?? row.escalated_at ?? null;

  const input = leadRowToScoringInput(row, signals);
  if (engaged) {
    input.campaignEngagement = 'replied';
    input.smsReplies = Math.max(input.smsReplies ?? 0, 1);
    input.lastEngagementAt = lastEngagementAt;
    input.declined = false;
  }
  const baseline = calculateProspectScore(input);
  const forSale = row.price_type === 'sale';
  const regulation = String(row.regulation_status ?? 'Unknown');
  const blocked = baseline.blockers.length > 0;

  const facts = {
    listing: {
      type: forSale ? 'For sale (the price below is the purchase price, not rent or income)' : row.price_type === 'rent' ? 'For rent' : 'Unknown',
      price: row.price || null, daysOnMarket: input.daysOnMarket ?? null, ownerListed: row.is_fsbo ?? null,
      beds: row.beds || null, baths: row.baths || null, propertyType: row.property_type ?? null,
    },
    shortTermRentalEstimates: { netMonthly: row.estimated_net_monthly || null, grossMonthly: row.estimated_gross_monthly || null, nightlyRate: row.estimated_adr || null, marketRentEstimate: row.estimated_monthly_rent_ai || null },
    place: { city: row.city, state: row.state, regulation },
    contact: { ownerVerified: !!row.verified_owner, phoneVerified: !!row.verified_number, hasPhone: !!(row.has_phone || row.contact_phone) },
    response: {
      repliedToText: replied, replySaidYes: saidYes, replyText: replyRow?.reply_text ? hidePhones(String(replyRow.reply_text)).slice(0, 200) : null,
      askedToBeContacted: asked, estimateLinkOpens: signals?.clicks ?? 0, viewedEstimate: eng.some((e) => e.estimate_viewed), secondsOnEstimate: eng.map((e) => e.time_on_page_s).find((n) => n) ?? null,
      answeredCalls: signals?.callsAnswered ?? 0, declinedOrOptedOut: declined,
    },
    stage: row.stage ?? null,
    ruleBasedScore: baseline.score,
  };

  let llm: Partial<LeadQualificationResult> & { qualificationScore?: number } | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const response = await Promise.race([
        completion({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildQualificationPrompt(facts) }],
          stream: false, api_key: apiKey, temperature: 0.15, max_tokens: 900,
        } as any),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 25_000)),
      ]);
      const content = (response as any)?.choices?.[0]?.message?.content || '';
      const m = content.match(/\{[\s\S]*\}/);
      llm = JSON.parse(m ? m[0] : content);
    } catch { llm = null; }
  }

  const aiScore = Number.isFinite(llm?.qualificationScore) ? clamp(Math.round(llm!.qualificationScore as number), 0, 100) : baseline.score;
  const adjustments: string[] = [];
  let score: number;
  if (blocked) { score = Math.min(aiScore, baseline.score, 35); adjustments.push(`Capped: ${baseline.blockers[0]}`); }
  else if (declined) { score = Math.min(aiScore, 30); adjustments.push('The owner declined, opted out, or was the wrong person, so this is not a prospect.'); }
  else if (engaged) {
    const floor = saidYes || asked ? 85 : 80;
    score = Math.max(aiScore, baseline.score, floor);
    if (score > aiScore) adjustments.push(saidYes ? 'Raised: the owner replied YES to our text, which outweighs the listing and property details.' : replied ? 'Raised: the owner replied to our text, which outweighs the listing and property details.' : 'Raised: the owner showed strong interest in their estimate.');
  } else score = Math.round((aiScore + baseline.score) / 2);

  // The model sometimes counts the listing itself against the lead; strip those lines so the screen never says it.
  const listingComplaint = /for[- ]sale|listed for sale|sale listing|purchase price|sale price|not (a )?rental|listing type/i;
  const clean = (a?: string[]) => (a ?? []).filter((x) => typeof x === 'string' && !(forSale && listingComplaint.test(x)));
  const positive = [
    ...(saidYes ? ['Replied YES to our text'] : replied ? ['Replied to our text'] : []),
    ...(asked ? ['Asked to be contacted'] : []),
    ...(forSale && !declined ? ['Listed for sale: a motivated owner who may prefer short-term rental income'] : []),
    ...clean(llm?.keySignals?.positive),
  ];
  const b = llm?.scoreBreakdown;
  const result: LeadQualificationResult = {
    leadId: body.leadId,
    qualificationScore: score,
    qualificationProbability: Math.round(score) / 100,
    confidence: clamp(Number(llm?.confidence ?? (engaged ? 0.8 : 0.5)), 0, 1),
    priorityTier: tierOf(score),
    reasoning: [...adjustments, llm?.reasoning || `Scored ${score}/100 from the TRAVLR rules: ${baseline.factors.slice().sort((x, y) => y.weightedPoints - x.weightedPoints).slice(0, 2).map((f) => f.label).join(' and ')} are the strongest factors.`].filter(Boolean).join(' '),
    keySignals: { positive, negative: [...clean(llm?.keySignals?.negative), ...(blocked ? [baseline.blockers[0]] : [])], neutral: clean(llm?.keySignals?.neutral) },
    scoreBreakdown: {
      ownerTenureSignal: clamp(Number(b?.ownerTenureSignal ?? 12), 0, 25),
      propertyFitSignal: clamp(Number(b?.propertyFitSignal ?? Math.round(score / 4)), 0, 25),
      responseEngagementSignal: engaged ? Math.max(22, clamp(Number(b?.responseEngagementSignal ?? 0), 0, 25)) : clamp(Number(b?.responseEngagementSignal ?? 5), 0, 25),
      regulatoryFeasibility: blocked ? Math.min(5, clamp(Number(b?.regulatoryFeasibility ?? 0), 0, 25)) : clamp(Number(b?.regulatoryFeasibility ?? (regulation === 'Allowed' ? 22 : regulation === 'Restricted' ? 14 : 12)), 0, 25),
    },
    recommendedAction: saidYes || asked ? `Call now: they said yes${replyRow?.reply_text ? ` (“${hidePhones(String(replyRow.reply_text)).slice(0, 40)}”)` : ''}. Open with their estimate and agree a time.`
      : replied ? 'Reply or call to turn their response into a conversation about the estimate.'
      : declined ? 'Do not contact. Leave them alone unless they reach out.'
      : llm?.recommendedAction || 'Continue the text campaign and call when they respond.',
    outreachPriority: declined || blocked ? 'deprioritize' : engaged ? 'immediate' : priorityOf(score),
    qualifiedAt: new Date().toISOString(),
    model: llm ? 'claude-sonnet-4-6 + TRAVLR rules' : 'TRAVLR rules',
  };
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ description: 'Lead qualification: TRAVLR rules refined by Claude', usage: 'POST /api/ai/lead-qualification with { leadId }' });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior outreach qualification analyst for TRAVLR Vacation Homes, a short-term rental (STR) management company.

HOW TRAVLR FINDS LEADS: we text and call owners whose homes are listed on Zillow, Trulia and similar sites, either FOR SALE or FOR RENT, and offer to manage the home as a vacation rental. A listing, sale or rent, is why the owner is a lead. It is NEVER a negative.
- For-sale listings are normal prospects. An owner whose home is not selling, or who is open to income while waiting, is often a strong fit. The listing price is a purchase price, not rent or income: never compare it to rent and never treat a high price as a weakness. Judge revenue from the short-term-rental estimates only.
- Owner tenure is usually unknown. Unknown is neutral and must not lower the score.

WHAT MAKES A LEAD QUALIFIED, in order of importance:
1. The owner responded. A reply of YES, a request to be contacted, or a reply giving a time for a call is the strongest possible signal and should score 85 or higher. Any reply that is not a refusal should score 80 or higher.
2. The owner has not refused (no STOP, no, wrong person, opt-out).
3. STR is allowed or restricted but workable where the home is. Only a prohibited jurisdiction is a hard blocker.
4. Contact information is verified and reachable.
5. The home has usable revenue potential.

Without any response, use the rule-based score as your anchor and move it by at most 15 points based on the facts.

Respond with valid JSON only, no markdown.`;

function buildQualificationPrompt(facts: Record<string, unknown>): string {
  return `Assess this lead for TRAVLR STR management.

FACTS (from our database, accurate):
${JSON.stringify(facts, null, 2)}

Return exactly:
{
  "qualificationScore": <0-100 integer>,
  "confidence": <0.0-1.0>,
  "reasoning": "<2-3 sentences citing specific facts, including any reply from the owner>",
  "keySignals": { "positive": ["..."], "negative": ["..."], "neutral": ["..."] },
  "scoreBreakdown": { "ownerTenureSignal": <0-25>, "propertyFitSignal": <0-25>, "responseEngagementSignal": <0-25>, "regulatoryFeasibility": <0-25> },
  "recommendedAction": "<specific next step for the agent>"
}

Rules: never mention the listing being for sale as a weakness; if the owner replied YES or asked for contact, the score is at least 85; if the data is thin say so in confidence rather than lowering the score; do not invent facts.`;
}
