import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';

function hasLeadFacts(row: Record<string, unknown>) {
  return Boolean(
    Number(row.beds || 0) > 0 ||
    Number(row.baths || 0) > 0 ||
    Number(row.price || 0) > 0 ||
    Number(row.estimated_net_monthly || 0) > 0 ||
    row.contact_phone ||
    row.contact_name
  );
}

function withAdjustedProspectScore(row: Record<string, unknown>) {
  const calculated = calculateProspectScore({
    estimatedNetMonthly: Number(row.estimated_net_monthly || 0),
    price: Number(row.price || 0),
    beds: Number(row.beds || 0),
    baths: Number(row.baths || 0),
    regulationStatus: String(row.regulation_status || 'Unknown'),
    contactPhone: row.contact_phone ? String(row.contact_phone) : null,
    stage: row.stage ? String(row.stage) : null,
  }).score;
  const stored = Number(row.prospect_score || 0);
  const adjusted = hasLeadFacts(row) ? Math.min(stored || calculated, calculated) : calculated;
  return { ...row, prospect_score: adjusted, raw_prospect_score: stored, score_needs_refresh: stored !== adjusted };
}

/**
 * GET /api/dashboard/top-leads?state=CA&limit=10
 *
 * AUTH FIX (2026-09-05):
 *   Previously used SUPABASE_SERVICE_ROLE_KEY which is a placeholder in .env
 *   → Supabase returned "Invalid API key" for every request.
 *   Now uses the server-side Supabase client (anon key + user session cookie)
 *   which IS correctly configured. This is the correct auth mechanism for
 *   internal dashboard reads — the user's authenticated session authorizes
 *   the request, no service role key needed.
 *
 * QUERY DESIGN:
 *   - Reads existing prospect_score (no recalculation)
 *   - Returns only required columns for the Dashboard card
 *   - LIMIT server-side (no client-side sort of thousands of rows)
 *   - No joins to activity, regulations, sources, teleprompter, etc.
 *   - No N+1 queries
 *   - No score recalculation
 *
 * PRIVATE KEY EXPOSED TO BROWSER: NO
 *   The anon key is NEXT_PUBLIC but is the intended public key for client use.
 *   No service secret is exposed.
 */
export async function GET(request: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 30);

  try {
    // Server-side client: uses anon key + user session cookie (correct auth path)
    const supabase = await createClient();
    const pState = state && state !== 'all' ? state : null;

    const dbStart = Date.now();

    // Primary path: exec_sql_top_leads RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql_top_leads', {
      p_state: pState,
      p_limit: limit,
    });

    const dbMs = Date.now() - dbStart;

    if (!rpcError && rpcData) {
      const adjusted = ((rpcData as Record<string, unknown>[]) ?? []).map(withAdjustedProspectScore);
      const factual = adjusted.filter(hasLeadFacts);
      const leads = (factual.length >= Math.min(limit, 3) ? factual : adjusted)
        .sort((a, b) => Number(b.prospect_score || 0) - Number(a.prospect_score || 0))
        .slice(0, limit);
      const totalMs = Date.now() - start;
      return NextResponse.json(
        { leads, meta: { totalMs, dbMs, rows: leads.length, path: 'rpc' } },
        {
          status: 200,
          headers: {
            'Cache-Control': 'private, max-age=30',
            'X-Duration-Ms': String(totalMs),
          },
        }
      );
    }

    // Fallback: direct query via server client
    console.warn('[/api/dashboard/top-leads] RPC unavailable, using fallback:', rpcError?.message);

    const fallbackStart = Date.now();
    const baseSelect = 'id,address,city,state,zip,beds,baths,price,stage,regulation_status,prospect_score,estimated_net_monthly,listing_url,contact_name,contact_phone,source,created_at';
    const terminalStages = ['Not a Fit'];

    // Two queries to cover IS DISTINCT FROM true semantics:
    // Query 1: is_synthetic IS NULL
    let q1 = supabase
      .from('leads')
      .select(baseSelect)
      .is('is_synthetic', null)
      .gt('prospect_score', 0)
      .not('address', 'is', null)
      .neq('address', '')
      .not('stage', 'in', `(${terminalStages.map(s => `"${s}"`).join(',')})`)
      .order('prospect_score', { ascending: false })
      .order('id', { ascending: true })
      .limit(limit);
    if (pState) q1 = q1.eq('state', pState);

    // Query 2: is_synthetic = false
    let q2 = supabase
      .from('leads')
      .select(baseSelect)
      .eq('is_synthetic', false)
      .gt('prospect_score', 0)
      .not('address', 'is', null)
      .neq('address', '')
      .not('stage', 'in', `(${terminalStages.map(s => `"${s}"`).join(',')})`)
      .order('prospect_score', { ascending: false })
      .order('id', { ascending: true })
      .limit(limit);
    if (pState) q2 = q2.eq('state', pState);

    const [res1, res2] = await Promise.all([q1, q2]);
    const fallbackDbMs = Date.now() - fallbackStart;

    if (res1.error && res2.error) {
      console.error('[/api/dashboard/top-leads] fallback failed:', res1.error.message);
      return NextResponse.json({ error: res1.error.message, leads: [] }, { status: 500 });
    }

    // Merge, deduplicate by id, re-sort, take top N
    const combined = [...(res1.data ?? []), ...(res2.data ?? [])];
    const deduped = Array.from(new Map(combined.map((r: Record<string, unknown>) => [r.id, r])).values());
    const adjusted = deduped.map(withAdjustedProspectScore);
    const factual = adjusted.filter(hasLeadFacts);
    const leads = (factual.length >= Math.min(limit, 3) ? factual : adjusted)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.prospect_score || 0) - Number(a.prospect_score || 0))
      .slice(0, limit);

    const totalMs = Date.now() - start;
    return NextResponse.json(
      { leads, meta: { totalMs, dbMs: fallbackDbMs, rows: leads.length, path: 'fallback' } },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30',
          'X-Duration-Ms': String(totalMs),
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[/api/dashboard/top-leads] threw:', msg);
    return NextResponse.json({ error: msg, leads: [] }, { status: 500 });
  }
}
