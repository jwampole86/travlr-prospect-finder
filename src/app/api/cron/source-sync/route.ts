import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 300;

const DEFAULT_STATES_PER_RUN = 2;
const MAX_STATES_PER_RUN = 6;
const DEFAULT_TRULIA_PAGES = 2;
const DEFAULT_CITIES_PER_STATE = 3;
const MAX_CITIES_PER_STATE = 6;
// Cities are rotated through the state's busiest 12 so successive visits cover different markets.
const CITY_POOL = 12;
const TIME_BUDGET_MS = 200_000;
const CALL_TIMEOUT_MS = 150_000;

type ProviderBody = Record<string, unknown>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const RATE_LIMITED = /\b429\b|rate.?limit|too many requests/i;

type PullResult = {
  state: string;
  source: string;
  ok: boolean;
  newLeads: number;
  fetched: number;
  error?: string;
};

const PROVIDERS: Record<string, (state: string, truliaPages: number) => ProviderBody> = {
  trulia: (state, pages) => ({ provider: 'trulia', location: state, maxPages: pages }),
  padmapper: (state) => ({ provider: 'padmapper', state }),
  hotpads: (state) => ({ provider: 'hotpads', state }),
  'zillow-search': (state) => ({ provider: 'zillow-search', region: state.toLowerCase(), maxPages: 1 }),
};

/** Provider errors can be strings or objects ({code, message}); never show "[object Object]". */
function describeError(err: unknown, status: number): string {
  if (!err) return `HTTP ${status}`;
  if (typeof err === 'string') return err;
  const o = err as { message?: unknown; code?: unknown };
  return `HTTP ${status}: ${typeof o.message === 'string' ? o.message : JSON.stringify(err).slice(0, 300)}${o.code ? ` (${String(o.code)})` : ''}`;
}

type Db = ReturnType<typeof getSupabaseAdmin>;

/** The state's busiest rental cities by stored leads (a sample of the newest 1,000 is enough to rank them). */
async function topCities(db: Db, state: string): Promise<string[]> {
  const { data } = await db.from('leads').select('city').eq('state', state).eq('price_type', 'rent').not('city', 'is', null).order('created_at', { ascending: false }).limit(1000);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const city = String((row as { city?: string }).city ?? '').trim();
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, CITY_POOL).map(([city]) => city);
}

function summarizeFailureMessages(results: PullResult[]) {
  return results.filter((result) => !result.ok).map((result) => `${result.state} · ${result.source}: ${result.error || 'Unknown error'}`);
}

/**
 * GET /api/cron/source-sync
 * Pulls fresh listings from the RapidAPI sources for the states that have gone longest without a pull,
 * so every portfolio is refreshed on rotation without anyone clicking Sync.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.reason || 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const params = req.nextUrl.searchParams;
  const statesPerRun = Math.min(MAX_STATES_PER_RUN, Math.max(1, Number(params.get('states')) || DEFAULT_STATES_PER_RUN));
  const truliaPages = Math.min(5, Math.max(1, Number(params.get('trulia_pages')) || DEFAULT_TRULIA_PAGES));
  const citiesParam = params.get('cities');
  const citiesPerState = Math.min(MAX_CITIES_PER_STATE, Math.max(0, citiesParam === null || citiesParam === '' ? DEFAULT_CITIES_PER_STATE : Number(citiesParam) || 0));
  const sources = (params.get('sources') || Object.keys(PROVIDERS).join(','))
    .split(',')
    .map((source) => source.trim())
    .filter((source): source is keyof typeof PROVIDERS => source in PROVIDERS);
  const only = new Set((params.get('only') || '').split(',').map((state) => state.trim().toUpperCase()).filter(Boolean));

  const run = await startCronRun('source-sync', {
    requestedPath: req.nextUrl.pathname,
    schedulePath: req.nextUrl.pathname + req.nextUrl.search,
    statesPerRun,
    truliaPages,
    requestedSources: sources,
    only: [...only],
  });

  if (sources.length === 0) {
    await finishCronRun(run, {
      status: 'failed',
      errorCount: 1,
      errors: ['No valid sources requested'],
      metadata: { requestedSources: params.get('sources') || null },
    });
    return NextResponse.json({ error: 'No valid sources requested' }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: registry, error: registryError } = await db
      .from('portfolio_registry')
      .select('state_code')
      .eq('is_active', true);

    if (registryError) {
      await finishCronRun(run, {
        status: 'failed',
        errorCount: 1,
        errors: [registryError.message],
        metadata: { stage: 'portfolio_registry' },
      });
      return NextResponse.json({ error: registryError.message }, { status: 500 });
    }

    const { data: events, error: eventsError } = await db
      .from('sync_events')
      .select('payload, created_at')
      .eq('operation_type', 'source_sync')
      .order('created_at', { ascending: false })
      .limit(3000);

    if (eventsError) {
      await finishCronRun(run, {
        status: 'failed',
        errorCount: 1,
        errors: [eventsError.message],
        metadata: { stage: 'sync_events' },
      });
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    const lastPull = new Map<string, string>();
    for (const event of events || []) {
      const code = (event.payload as { state_code?: string } | null)?.state_code;
      if (code && !lastPull.has(code)) {
        lastPull.set(code, String(event.created_at));
      }
    }

    const states = (registry || [])
      .map((row) => String(row.state_code || ''))
      .filter((code) => code && (only.size === 0 || only.has(code)))
      .sort((a, b) => (lastPull.get(a) || '').localeCompare(lastPull.get(b) || '') || a.localeCompare(b))
      .slice(0, statesPerRun);

    // Scheduled runs can arrive on a deployment-specific hostname; the public production domain is the stable place to call back.
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const origin = process.env.VERCEL_ENV === 'production' && prodHost ? `https://${prodHost}` : req.nextUrl.origin;
    const results: PullResult[] = [];
    const cityResults: PullResult[] = [];
    const skipped: string[] = [];

    for (const state of states) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        skipped.push(state);
        continue;
      }

      // A provider that answers 429 (rate limited) is retried after a pause instead of recording a failed pull.
      const pullOnce = async (source: string, state: string, body: ProviderBody = PROVIDERS[source](state, truliaPages)): Promise<PullResult> => {
          try {
            const response = await fetch(`${origin}/api/leads/rapidapi-import`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            });
            const data = await response.json().catch(() => ({}));

            if (response.status === 400 || response.status === 404) {
              return { state, source, ok: true, newLeads: 0, fetched: 0 };
            }

            const ok = response.ok && !data?.error;
            return {
              state,
              source,
              ok,
              newLeads: Number(data?.totals?.rowsNew) || 0,
              fetched: Number(data?.fetched) || 0,
              ...(ok ? {} : { error: describeError(data?.error, response.status) }),
            };
          } catch (error) {
            return {
              state,
              source,
              ok: false,
              newLeads: 0,
              fetched: 0,
              error: error instanceof Error ? error.message : String(error),
            };
          }
      };
      const pulls = await Promise.all(
        sources.map(async (source, i): Promise<PullResult> => {
          // Zillow's scraper is the most rate-limited, so it starts a moment after the other providers.
          if (source === 'zillow-search') await sleep(1500);
          let result = await pullOnce(source, state);
          for (let retry = 1; retry <= 3 && !result.ok && RATE_LIMITED.test(result.error ?? '') && Date.now() - startedAt < TIME_BUDGET_MS - 40_000; retry++) {
            await sleep(3000 * retry + Math.floor(Math.random() * 1000) + i * 250);
            result = await pullOnce(source, state);
          }
          return result;
        })
      );

      results.push(...pulls);

      // The state-wide search only ever shows one fixed window of listings, so also search the state's busiest cities.
      if (citiesPerState > 0 && sources.includes('trulia') && Date.now() - startedAt < TIME_BUDGET_MS - 60_000) {
        const pool = await topCities(db, state);
        const start = (Math.floor(Date.now() / 1_800_000) * citiesPerState) % Math.max(pool.length, 1);
        const picked = Array.from({ length: Math.min(citiesPerState, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
        const cityPulls = await Promise.all(picked.map(async (city, i) => {
          await sleep(i * 900);
          const body = { provider: 'trulia', location: `${city}, ${state}`, maxPages: truliaPages, quietFailures: true };
          let r = await pullOnce('trulia', state, body);
          if (!r.ok && RATE_LIMITED.test(r.error ?? '')) { await sleep(3000); r = await pullOnce('trulia', state, body); }
          return { ...r, source: `trulia:${city}` };
        }));
        cityResults.push(...cityPulls);
      }
    }

    const failures = results.filter((result) => !result.ok);
    const successfulPulls = results.length - failures.length;
    const totalFetched = [...results, ...cityResults].reduce((sum, result) => sum + result.fetched, 0);
    const totalNewLeads = [...results, ...cityResults].reduce((sum, result) => sum + result.newLeads, 0);
    const durationMs = Date.now() - startedAt;
    const status = failures.length === 0 ? 'success' : successfulPulls === 0 ? 'failed' : 'partial';

    await finishCronRun(run, {
      status,
      leadsScanned: totalFetched,
      propertyDataRefreshed: successfulPulls,
      errorCount: failures.length,
      errors: summarizeFailureMessages(results),
      metadata: {
        states,
        skipped,
        sources,
        truliaPages,
        statesPerRun,
        newLeads: totalNewLeads,
        cities: cityResults.map((r) => `${r.source.slice(7)}, ${r.state}: ${r.ok ? `${r.newLeads} new of ${r.fetched}` : 'failed'}`),
        durationMs,
        failureCount: failures.length,
      },
    });

    return NextResponse.json({
      ok: failures.length === 0,
      states,
      skipped,
      newLeads: totalNewLeads,
      failures,
      results,
      cityResults,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source sync failed';
    await finishCronRun(run, {
      status: 'failed',
      errorCount: 1,
      errors: [message],
      metadata: {
        statesPerRun,
        truliaPages,
        sources,
        only: [...only],
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
