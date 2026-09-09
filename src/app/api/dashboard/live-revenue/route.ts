import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

/**
 * GET /api/dashboard/live-revenue?state=CA
 *
 * AUTH MODEL:
 *   Server-side Supabase client (anon key + user session cookie).
 *   Uses getSession() — reads JWT from cookie locally, ZERO network calls.
 *   getUser() was replaced because it makes a network round-trip to
 *   auth/v1/user, adding 200-4000ms latency that caused the 5000ms timeout.
 *   No service-role key required.
 *
 * LIVE REVENUE BUSINESS RULE (canonical TRAVLR definition):
 *   deal_closed = true AND is_synthetic IS DISTINCT FROM true
 *   Revenue priority: contract_monthly_revenue > deal_revenue > estimated_net_monthly
 *
 * DIAGNOSTIC MODE:
 *   ?_diag=constant  → returns { liveRevenue: 123 } immediately after auth.
 *   Use this to determine whether the DB query is the bottleneck.
 *
 * CHECKPOINT TIMINGS (logged server-side as [LIVE_REVENUE_TRACE]):
 *   routeStart → authStart → authComplete → dbRequestStart → dbRequestComplete → routeComplete
 *
 * ZERO vs ERROR:
 *   liveRevenue = 0  → legitimate result (no won deals) → show "$0" *   HTTP 4xx/5xx     → server error → show"—" / "Unable to load"
 */
export async function GET(request: NextRequest) {
  const routeStart = performance.now();
  const requestId = randomUUID();
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');
  const diagMode = searchParams.get('_diag');
  const pState = state && state !== 'all' ? state : null;

  function ms(since = routeStart): number {
    return Math.round(performance.now() - since);
  }

  try {
    // ── AUTH ──────────────────────────────────────────────────────────────────
    // getSession() reads and decodes the JWT from the cookie LOCALLY — zero
    // network calls, zero latency. This is the correct pattern for server-side
    // API routes where the goal is to verify the user is authenticated, not to
    // re-validate the token against the Auth server on every request.
    // getUser() was causing a 200-4000ms network round-trip to auth/v1/user
    // on every call, which triggered the 5000ms timeout in useLiveRevenue.
    const authStart = performance.now();
    const supabase = await createClient();
    const clientInitMs = ms(authStart);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const authMs = ms(authStart);

    if (sessionError || !session) {
      console.warn(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} clientInitMs=${clientInitMs}ms authMs=${authMs}ms UNAUTHORIZED`
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── CONSTANT-RESPONSE DIAGNOSTIC ─────────────────────────────────────────
    if (diagMode === 'constant') {
      const totalMs = ms();
      console.log(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} DIAG=constant clientInitMs=${clientInitMs}ms authMs=${authMs}ms totalMs=${totalMs}ms`
      );
      return NextResponse.json(
        {
          liveRevenue: 123,
          _diag: 'constant',
          meta: { requestId, clientInitMs, authMs, totalMs },
        },
        {
          status: 200,
          headers: { 'X-Request-Id': requestId, 'X-Duration-Ms': String(totalMs) },
        }
      );
    }

    // ── DATABASE QUERY ────────────────────────────────────────────────────────
    // PRIMARY PATH: get_live_revenue_aggregate RPC
    // SECURITY DEFINER function — single SQL aggregate, one row returned.
    // TABLE: leads
    // FILTER: deal_closed = true AND is_synthetic IS DISTINCT FROM true
    // INDEX: idx_leads_live_revenue_v2 (partial index on qualifying rows)
    const dbStart = performance.now();

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_live_revenue_aggregate', {
      p_state: pState ?? null,
    });

    const dbMs = ms(dbStart);

    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      const liveRevenue = Number(
        (rpcData as { live_revenue?: number } | null)?.live_revenue ?? rpcData ?? 0
      );
      const totalMs = ms();

      console.log(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} path=rpc clientInitMs=${clientInitMs}ms authMs=${authMs}ms dbMs=${dbMs}ms totalMs=${totalMs}ms rows=1 success=true`
      );

      return NextResponse.json(
        {
          liveRevenue,
          meta: { requestId, clientInitMs, authMs, dbMs, totalMs, rows: 1, path: 'rpc' },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, max-age=30',
            'X-Request-Id': requestId,
            'X-Duration-Ms': String(totalMs),
          },
        }
      );
    }

    // FALLBACK PATH: get_live_revenue_fallback RPC
    if (rpcError) {
      console.warn(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} RPC primary error (using fallback): ${rpcError.message}`
      );
    }

    const fallbackStart = performance.now();

    const { data: fbData, error: fbError } = await supabase.rpc('get_live_revenue_fallback', {
      p_state: pState ?? null,
    });

    const fallbackDbMs = ms(fallbackStart);

    if (!fbError && fbData !== null && fbData !== undefined) {
      const liveRevenue = Number(
        (fbData as { live_revenue?: number } | null)?.live_revenue ?? fbData ?? 0
      );
      const totalMs = ms();

      console.log(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} path=fallback-rpc clientInitMs=${clientInitMs}ms authMs=${authMs}ms dbMs=${fallbackDbMs}ms totalMs=${totalMs}ms rows=1 success=true`
      );

      return NextResponse.json(
        {
          liveRevenue,
          meta: { requestId, clientInitMs, authMs, dbMs: fallbackDbMs, totalMs, rows: 1, path: 'fallback-rpc' },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, max-age=30',
            'X-Request-Id': requestId,
            'X-Duration-Ms': String(totalMs),
          },
        }
      );
    }

    // LAST RESORT: PostgREST aggregate syntax
    // Only reached if both RPCs fail.
    if (fbError) {
      console.warn(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} RPC fallback error (using PostgREST aggregate): ${fbError.message}`
      );
    }

    const pgStart = performance.now();

    // Build both queries upfront with all filters applied — no nested .then() re-execution.
    // q1: is_synthetic IS NULL (null check)
    // q2: is_synthetic = false (explicit false)
    // Together they cover: is_synthetic IS DISTINCT FROM true
    let q1 = supabase
      .from('leads')
      .select('contract_monthly_revenue.sum(),deal_revenue.sum(),estimated_net_monthly.sum()')
      .eq('deal_closed', true)
      .is('is_synthetic', null);

    let q2 = supabase
      .from('leads')
      .select('contract_monthly_revenue.sum(),deal_revenue.sum(),estimated_net_monthly.sum()')
      .eq('deal_closed', true)
      .eq('is_synthetic', false);

    if (pState) {
      q1 = q1.eq('state', pState);
      q2 = q2.eq('state', pState);
    }

    const [r1, r2] = await Promise.all([q1, q2]);

    const pgDbMs = ms(pgStart);

    if (r1.error && r2.error) {
      const totalMs = ms();
      console.error(
        `[LIVE_REVENUE_TRACE] requestId=${requestId} all paths failed authMs=${authMs}ms totalMs=${totalMs}ms error=${r1.error.message}`
      );
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const sumField = (data: unknown[] | null, field: string): number => {
      if (!data || data.length === 0) return 0;
      const row = data[0] as Record<string, unknown>;
      return Number(row[field] ?? 0);
    };

    const cmr = sumField(r1.data, 'contract_monthly_revenue') + sumField(r2.data, 'contract_monthly_revenue');
    const dr = sumField(r1.data, 'deal_revenue') + sumField(r2.data, 'deal_revenue');
    const enm = sumField(r1.data, 'estimated_net_monthly') + sumField(r2.data, 'estimated_net_monthly');

    const liveRevenue = cmr > 0 ? cmr : dr > 0 ? dr : enm;
    const totalMs = ms();

    console.log(
      `[LIVE_REVENUE_TRACE] requestId=${requestId} path=postgrest-aggregate clientInitMs=${clientInitMs}ms authMs=${authMs}ms dbMs=${pgDbMs}ms totalMs=${totalMs}ms rows=aggregate success=true`
    );

    return NextResponse.json(
      {
        liveRevenue,
        meta: { requestId, clientInitMs, authMs, dbMs: pgDbMs, totalMs, rows: 'aggregate', path: 'postgrest-aggregate' },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Request-Id': requestId,
          'X-Duration-Ms': String(totalMs),
        },
      }
    );
  } catch (e) {
    const totalMs = ms();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(
      `[LIVE_REVENUE_TRACE] requestId=${requestId} threw totalMs=${totalMs}ms error=${msg}`
    );
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
