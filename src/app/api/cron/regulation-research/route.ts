import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';

export const maxDuration = 300;

const VALID_STATUSES = [
  'ALLOWED', 'ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED', 'RESTRICTED',
  'PRIMARY_RESIDENCE_REQUIRED', 'PROHIBITED', 'UNKNOWN', 'REVIEW_REQUIRED',
] as const;
type RegStatus = (typeof VALID_STATUSES)[number];

const MODEL = process.env.REGULATION_RESEARCH_MODEL || 'claude-sonnet-4-6';
const DEFAULT_CAP = 300;
const RESCORE_LEAD_LIMIT = 3000;

interface Research {
  status: RegStatus;
  strAllowed: boolean | null;
  permitRequired: boolean | null;
  licenseRequired: boolean | null;
  registrationRequired: boolean | null;
  primaryResidenceRequired: boolean | null;
  nightCap: number | null;
  minimumStay: number | null;
  taxRequirements: string | null;
  additionalRestrictions: string | null;
  summary: string;
  agentSummary: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string;
}

const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const posInt = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function parseResearch(raw: string): Research {
  const start = raw.indexOf('{"status"') >= 0 ? raw.indexOf('{"status"') : raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No structured regulation research returned');
  const p = JSON.parse(raw.slice(start, end + 1));
  return {
    status: VALID_STATUSES.includes(p.status) ? p.status : 'UNKNOWN',
    strAllowed: bool(p.strAllowed),
    permitRequired: bool(p.permitRequired),
    licenseRequired: bool(p.licenseRequired),
    registrationRequired: bool(p.registrationRequired),
    primaryResidenceRequired: bool(p.primaryResidenceRequired),
    nightCap: posInt(p.nightCap),
    minimumStay: posInt(p.minimumStay),
    taxRequirements: text(p.taxRequirements, 500),
    additionalRestrictions: text(p.additionalRestrictions, 800),
    summary: String(p.summary || '').slice(0, 2000),
    agentSummary: text(p.agentSummary, 400),
    sourceUrl: text(p.sourceUrl, 600),
    sourceName: text(p.sourceName, 200),
    confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(p.confidence) ? p.confidence : 'LOW',
    evidence: String(p.evidence || 'NONE'),
  };
}

function buildPrompt(city: string, state: string): string {
  return `Research the current short-term rental (Airbnb / Vrbo style, under 30 nights) rules for ${city}, ${state}, USA, so a property-management company knows whether it can manage STRs there.

Search in this order and stop once you have a solid answer:
1. The city's official ordinance or municipal code page (.gov, municode.com, library.municode.com, American Legal) and the city planning / finance / licensing pages.
2. If the city has no STR rule of its own, the county and then the state rules that apply there (say which level applies).
3. The Airbnb local-laws page for ${city} (airbnb.com/help "responsible hosting" city pages) and Vrbo / Expedia Group local-rules pages for ${city}. Use these to confirm or fill gaps, not to override an official ordinance.

Classify with these exact meanings:
- PROHIBITED: STRs banned citywide or only legal in very narrow cases.
- PRIMARY_RESIDENCE_REQUIRED: only the host's primary residence may be rented.
- RESTRICTED: night caps, quotas, zoning-only areas, moratorium, or similar real limits on investor-owned homes.
- PERMIT_REQUIRED or ALLOWED_WITH_REQUIREMENTS: legal for investor-owned homes but needs a permit, license, registration or taxes.
- ALLOWED: sources show no STR-specific restriction beyond ordinary lodging tax or business license.
- UNKNOWN: you cannot determine it from sources.

Rules for honesty: only use ALLOWED for "no restriction" when an official page or an Airbnb/Vrbo local-rules page supports it, and then confidence must not exceed MEDIUM. Never guess. If you cannot cite a specific page you actually found, use UNKNOWN with LOW confidence.

Return ONE JSON object and nothing else:
{"status":"...","strAllowed":true|false|null,"permitRequired":true|false|null,"licenseRequired":true|false|null,"registrationRequired":true|false|null,"primaryResidenceRequired":true|false|null,"nightCap":number|null,"minimumStay":number|null,"taxRequirements":"short text or null","additionalRestrictions":"short text or null (zoning, HOA, occupancy, caps)","summary":"2-3 plain-English sentences naming which level (city/county/state) governs","agentSummary":"one sentence an agent can say on a call","sourceUrl":"exact URL you found and relied on, or null","sourceName":"issuing authority or site","confidence":"HIGH|MEDIUM|LOW","evidence":"OFFICIAL_ORDINANCE|PLATFORM_LOCAL_RULES|NO_RESTRICTION_FOUND|NONE"}`;
}

type QueueItem = { city: string; state: string; lead_count: number; reason: string };
interface ResultRow {
  city: string; state: string; leads: number; reason: string; status: string;
  confidence: string; evidence?: string; leadsUpdated: number; rescored: number;
  sourceUrl?: string | null; error?: string;
}

async function researchOne(client: Anthropic, j: QueueItem) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1800,
    temperature: 0,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: buildPrompt(j.city, j.state) }],
  } as never) as unknown as {
    content: Array<{ type: string; text?: string; content?: unknown; url?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
  };

  const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  const found = response.content
    .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap((b) => b.content as Array<{ type?: string; url?: string }>)
    .filter((item) => item.type === 'web_search_result');
  const research = parseResearch(raw);

  // A cited URL must have appeared in this call's real search results.
  if (research.sourceUrl && !found.some((item) => item.url === research.sourceUrl)) {
    research.sourceUrl = null;
    research.confidence = 'LOW';
  }
  if (!research.sourceUrl) {
    research.status = research.status === 'UNKNOWN' ? 'UNKNOWN' : 'REVIEW_REQUIRED';
    research.confidence = 'LOW';
  }
  // The model sometimes writes an "allowed" finding but labels it UNKNOWN; trust the cited structured fields instead.
  if (research.status === 'UNKNOWN' && research.sourceUrl && research.confidence !== 'LOW' && research.strAllowed === true
    && research.primaryResidenceRequired !== true && !research.nightCap) {
    research.status = research.permitRequired || research.licenseRequired || research.registrationRequired
      ? 'ALLOWED_WITH_REQUIREMENTS' : 'ALLOWED';
  }
  if (research.status === 'ALLOWED' && research.confidence === 'HIGH' && research.evidence === 'NO_RESTRICTION_FOUND') {
    research.confidence = 'MEDIUM';
  }
  return { research, usage: response.usage };
}

/**
 * GET /api/cron/regulation-research
 * Claude + live web search researches STR rules for every market that has real leads
 * and no rule yet (largest markets first), then writes the rule, pushes the status onto
 * the market's leads and rescores them.
 *
 * Results are stored as source_type=AI_RESEARCHED, review_status=REVIEW_REQUIRED and never
 * overwrite officially sourced or human-entered rules. Unresolved results (UNKNOWN/LOW) are
 * stored but not pushed onto leads, so they cannot downgrade a status a lead already has.
 *
 * Query: limit (1-25, default 4), minLeads (default 2), state (e.g. CO), concurrency (1-4, default 3),
 *        dryRun=true (list the queue only), rescore=false.
 * Env:   REGULATION_RESEARCH_MAX_CITIES (default 300) caps total AI-researched rules,
 *        REGULATION_RESEARCH_MODEL overrides the model.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || /your-|placeholder|changeme|example/i.test(apiKey)) {
    return NextResponse.json({ error: 'Anthropic is not configured' }, { status: 503 });
  }

  const q = request.nextUrl.searchParams;
  const limit = Math.min(25, Math.max(1, Number(q.get('limit')) || 4));
  const minLeads = Math.max(1, Number(q.get('minLeads')) || 2);
  const concurrency = Math.min(4, Math.max(1, Number(q.get('concurrency')) || 3));
  const state = (q.get('state') || '').toUpperCase() || null;
  const dryRun = q.get('dryRun') === 'true';
  const doRescore = q.get('rescore') !== 'false';
  const cap = Number.isFinite(Number(process.env.REGULATION_RESEARCH_MAX_CITIES))
    ? Number(process.env.REGULATION_RESEARCH_MAX_CITIES) : DEFAULT_CAP;

  const db = getSupabaseAdmin();

  const { count: researched } = await db.from('city_regulations')
    .select('id', { count: 'exact', head: true }).eq('source_type', 'AI_RESEARCHED');
  const remainingBudget = Math.max(0, cap - (researched ?? 0));

  const { data: queue, error: qErr } = await db.rpc('get_regulation_research_queue', {
    p_limit: dryRun ? limit : Math.min(limit, remainingBudget), p_min_leads: minLeads, p_state: state,
  });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  const items = ((queue ?? []) as QueueItem[]).filter((j) => /^[A-Z]{2}$/.test(String(j.state)));

  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, researched, cap, queue: items });
  if (items.length === 0) {
    return NextResponse.json({
      ok: true, processed: 0, researched, cap,
      message: remainingBudget === 0 ? 'Research cap reached (raise REGULATION_RESEARCH_MAX_CITIES)' : 'No markets left to research',
    });
  }

  const client = new Anthropic({ apiKey, maxRetries: 4 });
  const started = Date.now();
  const results: ResultRow[] = [];
  const totals = { inputTokens: 0, outputTokens: 0, searches: 0 };
  let next = 0;
  let billingError: string | null = null;

  async function worker() {
    while (next < items.length && !billingError && Date.now() - started < 200_000) {
      const j = items[next++];
      const row: ResultRow = {
        city: j.city, state: j.state, leads: Number(j.lead_count), reason: j.reason,
        status: 'ERROR', confidence: 'LOW', leadsUpdated: 0, rescored: 0,
      };
      try {
        const { research, usage } = await researchOne(client, j);
        totals.inputTokens += usage?.input_tokens ?? 0;
        totals.outputTokens += usage?.output_tokens ?? 0;
        totals.searches += usage?.server_tool_use?.web_search_requests ?? 0;
        Object.assign(row, { status: research.status, confidence: research.confidence, evidence: research.evidence, sourceUrl: research.sourceUrl });

        const { data: ruleId, error: upErr } = await db.rpc('upsert_ai_regulation_v2', {
          p_city: j.city, p_state: j.state, p_status: research.status, p_str_allowed: research.strAllowed,
          p_permit_required: research.permitRequired, p_license_required: research.licenseRequired,
          p_registration_required: research.registrationRequired,
          p_primary_residence_required: research.primaryResidenceRequired,
          p_night_cap: research.nightCap, p_minimum_stay: research.minimumStay,
          p_tax_requirements: research.taxRequirements, p_additional_restrictions: research.additionalRestrictions,
          p_summary: research.summary, p_agent_summary: research.agentSummary,
          p_source_name: research.sourceName, p_source_url: research.sourceUrl, p_confidence: research.confidence,
        });
        if (upErr) throw new Error(upErr.message);
        if (!ruleId) { row.error = 'Existing rule is not AI-researched; left untouched'; results.push(row); continue; }

        const resolved = !['UNKNOWN', 'REVIEW_REQUIRED'].includes(research.status) && research.confidence !== 'LOW';
        if (resolved) {
          const { data: n, error: applyErr } = await db.rpc('apply_city_regulation_to_leads', { p_city_regulation_id: ruleId });
          if (applyErr) throw new Error(applyErr.message);
          row.leadsUpdated = Number(n || 0);

          if (doRescore && row.leadsUpdated > 0) {
            const safeCity = j.city.replace(/[%_\\]/g, '\\$&');
            const { data: ids } = await db.from('leads').select('id')
              .eq('state', j.state).ilike('city', safeCity).or('is_synthetic.is.null,is_synthetic.eq.false')
              .limit(RESCORE_LEAD_LIMIT);
            row.rescored = await rescoreLeadsByIds(db, (ids ?? []).map((r) => String(r.id)));
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Research failed';
        if (/credit balance|billing|insufficient_quota|authentication_error|invalid x-api-key/i.test(message)) {
          billingError = /credit balance/i.test(message)
            ? 'Anthropic credit balance is too low; add credits and the cron resumes automatically'
            : 'Anthropic rejected the API key or billing; check ANTHROPIC_API_KEY';
          return;
        }
        row.error = message;
      }
      results.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  const rate = MODEL.includes('haiku') ? { i: 1, o: 5 } : MODEL.includes('opus') ? { i: 15, o: 75 } : { i: 3, o: 15 };
  const estCostUsd = +(totals.inputTokens / 1e6 * rate.i + totals.outputTokens / 1e6 * rate.o + totals.searches * 0.01).toFixed(3);
  const byStatus: Record<string, number> = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  if (billingError && results.length === 0) {
    return NextResponse.json({ ok: false, error: billingError, researched, cap }, { status: 402 });
  }

  return NextResponse.json({
    ok: true, model: MODEL, warning: billingError, processed: results.length, requested: items.length,
    researchedTotal: (researched ?? 0) + results.filter((r) => !r.error).length, cap,
    byStatus, leadsUpdated: results.reduce((s, r) => s + r.leadsUpdated, 0),
    rescored: results.reduce((s, r) => s + r.rescored, 0),
    usage: { ...totals, estCostUsd }, results,
  });
}
