import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 300;

const MODEL = process.env.REGULATION_RESEARCH_MODEL || 'claude-sonnet-4-6';

interface SafetyItem { item: string; detail: string }
interface PermitDetails {
  permitName: string | null;
  costSummary: string | null;
  costLow: number | null;
  costHigh: number | null;
  renewal: string | null;
  processingTime: string | null;
  applicationUrl: string | null;
  steps: string[];
  safety: SafetyItem[];
  sourceUrl: string | null;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== null && v !== '' ? Math.round(Number(v)) : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function parseDetails(raw: string): PermitDetails {
  const start = raw.indexOf('{"permitName"') >= 0 ? raw.indexOf('{"permitName"') : raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No structured permit details returned');
  const p = JSON.parse(raw.slice(start, end + 1));
  return {
    permitName: str(p.permitName, 160),
    costSummary: str(p.costSummary, 600),
    costLow: num(p.costLow),
    costHigh: num(p.costHigh),
    renewal: str(p.renewal, 240),
    processingTime: str(p.processingTime, 160),
    applicationUrl: str(p.applicationUrl, 600),
    steps: Array.isArray(p.steps) ? p.steps.map((s: unknown) => str(s, 260)).filter((s: string | null): s is string => !!s).slice(0, 10) : [],
    safety: Array.isArray(p.safety)
      ? p.safety.map((s: { item?: unknown; detail?: unknown }) => ({ item: str(s?.item, 80), detail: str(s?.detail, 260) }))
        .filter((s: { item: string | null; detail: string | null }): s is SafetyItem => !!s.item && !!s.detail).slice(0, 10)
      : [],
    sourceUrl: str(p.sourceUrl, 600),
  };
}

function prompt(city: string, state: string): string {
  return `A property management company needs to tell a homeowner in ${city}, ${state} exactly what it takes to legally operate a short-term rental (under 30 nights) there. Find the CURRENT official requirements. Prefer the city's own permit / licensing pages and municipal code; use county or state pages when they govern; use Airbnb or Vrbo local-rules pages only to fill small gaps.

Collect, with real numbers where the official pages give them:
- the official name of the permit / license / registration
- every fee a new operator pays up front (application, license, inspection, neighbor notification) and the renewal fee and cycle
- how long approval typically takes
- the official application URL
- the application steps in the order the owner must do them (short imperative sentences, 4 to 8 steps)
- the safety and equipment requirements the city or fire code expects for a rental (smoke alarms, carbon monoxide alarms, fire extinguisher, egress, posted emergency info, address numbers, parking, occupancy signs, local contact, and so on)

Rules for honesty: only state fees and requirements you actually read on a page you found. If a number is not published, leave it null and say so in costSummary. Never estimate a fee. If you cannot find an official source, return empty steps and safety arrays and null for the rest.

Return ONE JSON object and nothing else:
{"permitName":"...|null","costSummary":"plain-English summary of up-front and renewal costs with the numbers","costLow":number|null,"costHigh":number|null,"renewal":"cycle and fee|null","processingTime":"e.g. 2 to 6 weeks|null","applicationUrl":"exact official URL|null","steps":["..."],"safety":[{"item":"Smoke alarms","detail":"what is required"}],"sourceUrl":"exact URL of the main page you relied on|null"}
costLow and costHigh are the total up-front cost in whole US dollars (low and high if it varies by property type or size), or null.`;
}

/**
 * GET /api/cron/regulation-permit-details
 * Researches permit costs, application steps, processing time and safety-equipment requirements for the rules homeowners
 * ask about most (largest markets first). Cited URLs must appear in that call's real search results or they are dropped.
 *
 * Query: limit (1-15, default 4), concurrency (1-4, default 3), dryRun=true.
 * Respects REGULATION_RESEARCH_MAX_CITIES indirectly: this job only touches rules that already exist.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || /your-|placeholder|changeme|example/i.test(apiKey)) return NextResponse.json({ error: 'Anthropic is not configured' }, { status: 503 });

  const q = request.nextUrl.searchParams;
  const limit = Math.min(15, Math.max(1, Number(q.get('limit')) || 4));
  const concurrency = Math.min(4, Math.max(1, Number(q.get('concurrency')) || 3));
  const db = getSupabaseAdmin();

  const { data: queue, error: qErr } = await db.rpc('get_permit_details_queue', { p_limit: limit });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  const items = (queue ?? []) as Array<{ rule_id: string; city: string; state: string; lead_count: number }>;
  if (q.get('dryRun') === 'true') return NextResponse.json({ ok: true, dryRun: true, queue: items });
  if (items.length === 0) return NextResponse.json({ ok: true, processed: 0, message: 'No permit details left to research' });

  const client = new Anthropic({ apiKey, maxRetries: 4 });
  const started = Date.now();
  const results: Array<{ city: string; state: string; steps: number; safety: number; cost: string | null; sourced: boolean; error?: string }> = [];
  const totals = { inputTokens: 0, outputTokens: 0, searches: 0 };
  let next = 0;
  let billingError: string | null = null;

  async function worker() {
    while (next < items.length && !billingError && Date.now() - started < 200_000) {
      const j = items[next++];
      const row: (typeof results)[number] = { city: j.city, state: j.state, steps: 0, safety: 0, cost: null, sourced: false };
      try {
        const response = await client.messages.create({
          model: MODEL, max_tokens: 2200, temperature: 0,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
          messages: [{ role: 'user', content: prompt(j.city, j.state) }],
        } as never) as unknown as {
          content: Array<{ type: string; text?: string; content?: unknown }>;
          usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
        };
        totals.inputTokens += response.usage?.input_tokens ?? 0;
        totals.outputTokens += response.usage?.output_tokens ?? 0;
        totals.searches += response.usage?.server_tool_use?.web_search_requests ?? 0;

        const raw = response.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
        const seen = new Set(response.content
          .filter(b => b.type === 'web_search_tool_result' && Array.isArray(b.content))
          .flatMap(b => b.content as Array<{ type?: string; url?: string }>)
          .filter(i => i.type === 'web_search_result').map(i => i.url));
        const d = parseDetails(raw);

        // Citations must be real search results; without a citable source nothing is stored beyond the attempt time.
        if (d.sourceUrl && !seen.has(d.sourceUrl)) d.sourceUrl = null;
        if (d.applicationUrl && !seen.has(d.applicationUrl)) d.applicationUrl = null;
        const sourced = Boolean(d.sourceUrl || d.applicationUrl);
        row.sourced = sourced;

        const update: Record<string, unknown> = { permit_details_updated_at: new Date().toISOString() };
        if (sourced) {
          Object.assign(update, {
            permit_name: d.permitName, permit_cost_summary: d.costSummary, permit_cost_low: d.costLow, permit_cost_high: d.costHigh,
            permit_renewal: d.renewal, permit_processing_time: d.processingTime, permit_application_url: d.applicationUrl,
            permit_steps: d.steps.length ? d.steps : null, safety_requirements: d.safety.length ? d.safety : null,
          });
          row.steps = d.steps.length; row.safety = d.safety.length; row.cost = d.costSummary;
        }
        const { error } = await db.from('city_regulations').update(update).eq('id', j.rule_id);
        if (error) throw new Error(error.message);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Research failed';
        if (/credit balance|billing|authentication_error|invalid x-api-key/i.test(message)) { billingError = message.slice(0, 160); return; }
        row.error = message.slice(0, 200);
      }
      results.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  const rate = MODEL.includes('haiku') ? { i: 1, o: 5 } : { i: 3, o: 15 };
  const estCostUsd = +(totals.inputTokens / 1e6 * rate.i + totals.outputTokens / 1e6 * rate.o + totals.searches * 0.01).toFixed(3);
  if (billingError && results.length === 0) return NextResponse.json({ ok: false, error: billingError }, { status: 402 });
  return NextResponse.json({ ok: true, model: MODEL, warning: billingError, processed: results.length, usage: { ...totals, estCostUsd }, results });
}
