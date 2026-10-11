import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const VALID_STATUSES = [
  'ALLOWED', 'ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED', 'RESTRICTED',
  'PRIMARY_RESIDENCE_REQUIRED', 'PROHIBITED', 'UNKNOWN', 'REVIEW_REQUIRED',
] as const;
type RegStatus = (typeof VALID_STATUSES)[number];

interface Research {
  status: RegStatus;
  strAllowed: boolean | null;
  permitRequired: boolean | null;
  licenseRequired: boolean | null;
  primaryResidenceRequired: boolean | null;
  nightCap: number | null;
  summary: string;
  sourceUrl: string | null;
  sourceName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function parseResearch(text: string): Research {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No structured regulation research returned');
  const parsed = JSON.parse(match[0]);
  const confidences = ['HIGH', 'MEDIUM', 'LOW'];
  return {
    status: VALID_STATUSES.includes(parsed.status) ? parsed.status : 'UNKNOWN',
    strAllowed: typeof parsed.strAllowed === 'boolean' ? parsed.strAllowed : null,
    permitRequired: typeof parsed.permitRequired === 'boolean' ? parsed.permitRequired : null,
    licenseRequired: typeof parsed.licenseRequired === 'boolean' ? parsed.licenseRequired : null,
    primaryResidenceRequired: typeof parsed.primaryResidenceRequired === 'boolean' ? parsed.primaryResidenceRequired : null,
    nightCap: Number.isFinite(Number(parsed.nightCap)) && Number(parsed.nightCap) > 0 ? Math.round(Number(parsed.nightCap)) : null,
    summary: String(parsed.summary || '').slice(0, 2000),
    sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : null,
    sourceName: typeof parsed.sourceName === 'string' ? parsed.sourceName.slice(0, 200) : null,
    confidence: confidences.includes(parsed.confidence) ? parsed.confidence : 'LOW',
  };
}

/**
 * GET /api/cron/regulation-research
 * AI-assisted (Claude + live web search) short-term rental regulation research
 * for jurisdictions with no canonical city_regulations coverage yet — fills the
 * gap left by the blocked direct-fetch approach (government sites reliably
 * failed to extract via plain HTTP fetch). Claude's web_search tool handles
 * that far better since it isn't a simple static-HTML GET.
 *
 * Every result is inserted with source_type='AI_RESEARCHED' and
 * review_status='REVIEW_REQUIRED' — this is a research AID, not a replacement
 * for human verification, since regulation_status feeds compliance-sensitive
 * UI (STR-Eligible KPI, lead scoring). A human should spot-check before fully
 * trusting any individual jurisdiction long-term.
 *
 * Query params: ?limit=N (jurisdictions to research this call, default 3, max 10)
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || /your-|placeholder|changeme|example/i.test(apiKey)) {
    return NextResponse.json({ error: 'Anthropic is not configured' }, { status: 503 });
  }

  const limit = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 3));
  const db = getSupabaseAdmin();

  const { data: jurisdictions, error: jErr } = await db.rpc('get_top_unknown_jurisdictions', { p_limit: limit });
  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });
  if (!jurisdictions || jurisdictions.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No uncovered jurisdictions remain' });
  }

  const client = new Anthropic({ apiKey });
  const results: Array<{ city: string; state: string; leadCount: number; status: string; confidence: string; leadsUpdated: number; error?: string }> = [];

  for (const j of jurisdictions as Array<{ city: string; state: string; lead_count: number }>) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1200, temperature: 0,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
        messages: [{
          role: 'user',
          content: `Research short-term rental (Airbnb/VRBO) regulations for ${j.city}, ${j.state}, USA. Search official city/county government sites (.gov domains preferred) for the current ordinance. If the city itself has no STR ordinance, check whether county-level rules apply instead and say so in the summary. Return JSON only, no other text:
{"status":"ALLOWED|ALLOWED_WITH_REQUIREMENTS|PERMIT_REQUIRED|RESTRICTED|PRIMARY_RESIDENCE_REQUIRED|PROHIBITED|UNKNOWN","strAllowed":true|false|null,"permitRequired":true|false|null,"licenseRequired":true|false|null,"primaryResidenceRequired":true|false|null,"nightCap":number|null,"summary":"2-3 sentence plain-English summary of the rule","sourceUrl":"the exact official URL you found, or null if none","sourceName":"name of the issuing authority, e.g. City of X Planning Dept","confidence":"HIGH|MEDIUM|LOW"}
Use status=UNKNOWN with confidence=LOW if you cannot find a specific, citable official source — never guess at a status without one.`,
        }],
      } as any);

      const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      const searchResults = response.content
        .filter((b: any) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
        .flatMap((b: any) => b.content)
        .filter((item: any) => item.type === 'web_search_result');
      const research = parseResearch(text);

      // Same anti-hallucination guard as listing-verification: a claimed source
      // URL must actually appear in this call's real search results, or we
      // don't trust it as a verifiable citation.
      const citation = searchResults.find((item: any) => item.url === research.sourceUrl);
      if (!citation && research.sourceUrl) {
        research.sourceUrl = null;
        research.confidence = 'LOW';
      }
      if (!research.sourceUrl) {
        research.status = research.status === 'UNKNOWN' ? 'UNKNOWN' : 'REVIEW_REQUIRED';
        research.confidence = 'LOW';
      }

      const jurisdictionName = `${j.city}, ${j.state}`;
      const { data: cityRegId, error: upsertErr } = await db.rpc('upsert_ai_researched_regulation', {
        p_city: j.city,
        p_state: j.state,
        p_status: research.status,
        p_str_allowed: research.strAllowed,
        p_permit_required: research.permitRequired,
        p_license_required: research.licenseRequired,
        p_primary_residence_required: research.primaryResidenceRequired,
        p_night_cap: research.nightCap,
        p_summary: research.summary,
        p_source_name: research.sourceName,
        p_source_url: research.sourceUrl,
        p_confidence: research.confidence,
      });

      if (upsertErr || !cityRegId) {
        results.push({ city: j.city, state: j.state, leadCount: j.lead_count, status: research.status, confidence: research.confidence, leadsUpdated: 0, error: upsertErr?.message || 'Upsert returned no id' });
        continue;
      }

      const { data: leadsUpdated, error: applyErr } = await db.rpc('apply_city_regulation_to_leads', { p_city_regulation_id: cityRegId });
      results.push({
        city: j.city, state: j.state, leadCount: j.lead_count,
        status: research.status, confidence: research.confidence,
        leadsUpdated: applyErr ? 0 : Number(leadsUpdated || 0),
        error: applyErr?.message,
      });
    } catch (cause) {
      results.push({ city: j.city, state: j.state, leadCount: j.lead_count, status: 'ERROR', confidence: 'LOW', leadsUpdated: 0, error: cause instanceof Error ? cause.message : 'Research failed' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
