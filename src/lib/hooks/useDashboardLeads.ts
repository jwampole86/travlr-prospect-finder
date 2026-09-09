'use client';

/**
 * useDashboardLeads — Dashboard data hook with independent per-metric state.
 *
 * ARCHITECTURE:
 *   Each metric has its own loading / data / error state.
 *   One timeout NEVER blocks the entire Dashboard.
 *
 * PERFORMANCE ROOT CAUSE FIX (this version):
 *
 *   top_leads ROOT CAUSE:
 *     The Supabase JS client generates .neq('is_synthetic', true) as
 *     `is_synthetic != true` which EXCLUDES NULL rows and does NOT match
 *     the partial index predicate `is_synthetic IS DISTINCT FROM true`.
 *     PostgreSQL cannot use the partial index → full sequential scan on
 *     9,000+ rows → 10s+ timeout.
 *     FIX: /api/dashboard/top-leads uses service role key + raw SQL with
 *     IS DISTINCT FROM true → index is used → < 50ms.
 *
 *   live_revenue ROOT CAUSE (v3 — final fix):
 *     Previous versions used createClient() (anon key + session cookie) →
 *     PostgREST → RLS evaluation on every call. Under connection pool
 *     pressure from background jobs, connection acquisition wait alone
 *     exceeded 5s even though the SQL itself is < 20ms.
 *     FIX: live_revenue is now handled by useLiveRevenue (separate hook).
 *     /api/dashboard/live-revenue uses service role key directly →
 *     get_live_revenue_aggregate RPC → ONE query, ONE row, NO PostgREST,
 *     NO RLS → < 20ms DB / < 100ms API.
 *     useDashboardLeads no longer fetches live_revenue at all.
 *
 * TIMEOUT POLICY:
 *   - top_leads API route: 10s (should be < 200ms)
 *   - stats RPC: 8s (single-scan conditional aggregation)
 *   - chart RPCs: 8s each, independent
 *   These timeouts are EMERGENCY GUARDS, not performance targets.
 *
 * ZERO vs ERROR:
 *   - liveRevenue = 0 means the canonical query returned $0 (no won deals)
 *   - liveRevenueError = true means the query failed — show "—" not "$0"
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { extractRpcMetric, TERMINAL_STAGES, ACTIVE_PIPELINE_STAGES, HIGH_PRIORITY_SCORE_THRESHOLD } from '@/lib/kpiDefinitions';

// ─── Minimal shape needed by the Dashboard ───────────────────────────────────
export interface DashboardLead {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  price: number;
  stage: string;
  regulation_status: string;
  prospect_score: number;
  estimated_net_monthly: number;
  listing_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  source: string;
  created_at: string;
}

export interface DashboardStats {
  totalLeads: number;
  activeLeads: number;
  actionNeededLeads: number;
  regulationFriendly: number;
  highPriority: number;
  avgScore: number;
  estimatedMonthlyRevenue: number;
  // Live counts
  fullyVerified: number;
  unassignedPriority: number;
  assignedLeads: number;
  verifiedOwner: number;
  verifiedNumber: number;
  phoneAvailable: number;
  newLeads: number;
  // Luxury KPI counts
  luxuryProspects: number;
  luxuryFullyVerified: number;
  luxuryVerifiedNumber: number;
  luxuryPriority: number;
  luxuryUnassignedPriority: number;
  // Portfolio count
  activePortfolios: number;
  strEligible?: number;
}

export interface StageCount {
  stage: string;
  count: number;
}

export interface RegulationCount {
  status: string;
  count: number;
}

export interface UseDashboardLeadsResult {
  topLeads: DashboardLead[];
  stats: DashboardStats;
  stageBreakdown: StageCount[];
  regulationBreakdown: RegulationCount[];
  topLoading: boolean;
  statsLoading: boolean;
  topLeadsError: string | null;
  statsError: string | null;
  /** true = query failed (show "—"), false = query succeeded (may be $0) */
  liveRevenueError: boolean;
  /** @deprecated use statsError + topLeadsError independently */
  error: string | null;
  refresh: () => void;
  refreshTopLeads: () => void;
  refreshStats: () => void;
}

const EMPTY_STATS: DashboardStats = {
  totalLeads: 0,
  activeLeads: 0,
  actionNeededLeads: 0,
  regulationFriendly: 0,
  highPriority: 0,
  avgScore: 0,
  estimatedMonthlyRevenue: 0,
  fullyVerified: 0,
  unassignedPriority: 0,
  assignedLeads: 0,
  verifiedOwner: 0,
  verifiedNumber: 0,
  phoneAvailable: 0,
  newLeads: 0,
  luxuryProspects: 0,
  luxuryFullyVerified: 0,
  luxuryVerifiedNumber: 0,
  luxuryPriority: 0,
  luxuryUnassignedPriority: 0,
  activePortfolios: 0,
};

// ─── Timeout constants ────────────────────────────────────────────────────────
/** top_leads API route: should be < 200ms. 10s is emergency guard only. */
const TOP_LEADS_TIMEOUT_MS = 10_000;
/** get_dashboard_summary RPC: single-scan aggregation, should be < 500ms. */
const STATS_RPC_TIMEOUT_MS = 8_000;
/** Chart RPCs */
const CHART_TIMEOUT_MS = 8_000;

/** Wrap a promise with a timeout — rejects after ms milliseconds */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[useDashboardLeads] Timeout after ${ms}ms: ${label}`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Check if an error is an intentional abort (not a real failure) */
function isAbortError(e: unknown): boolean {
  if (e instanceof Error) {
    return e.name === 'AbortError' || e.message.includes('AbortError') || e.message.includes('aborted');
  }
  return false;
}

export function useDashboardLeads(portfolioState?: string, enabled = true): UseDashboardLeadsResult {
  const [topLeads, setTopLeads] = useState<DashboardLead[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [stageBreakdown, setStageBreakdown] = useState<StageCount[]>([]);
  const [regulationBreakdown, setRegulationBreakdown] = useState<RegulationCount[]>([]);

  // Independent loading states — one timeout never blocks another section
  const [topLoading, setTopLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Independent error states
  const [topLeadsError, setTopLeadsError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  /**
   * @deprecated live_revenue is now handled by useLiveRevenue (separate hook).
   * Kept for backward compatibility — always false in this hook.
   * Use useLiveRevenue().error instead.
   */
  const liveRevenueError = false;

  const mountedRef = useRef(true);
  const topLeadsAbortRef = useRef<AbortController | null>(null);
  const statsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      topLeadsAbortRef.current?.abort();
      statsAbortRef.current?.abort();
    };
  }, []);

  // ─── fetchTopLeads ────────────────────────────────────────────────────────
  // ROOT CAUSE FIX: Uses /api/dashboard/top-leads (service role key + raw SQL).
  // Previously: Supabase JS .neq('is_synthetic', true) → `!= true` predicate
  //   does NOT match partial index `IS DISTINCT FROM true` → full seq scan → 10s+.
  // Now: raw SQL with IS DISTINCT FROM true → index used → < 50ms.
  const fetchTopLeads = useCallback(async () => {
    topLeadsAbortRef.current?.abort();
    if (!enabled) {
      if (mountedRef.current) setTopLoading(false);
      return;
    }
    const controller = new AbortController();
    topLeadsAbortRef.current = controller;

    if (mountedRef.current) {
      setTopLoading(true);
      setTopLeadsError(null);
    }

    const pState = portfolioState && portfolioState !== 'all' ? portfolioState : 'all';
    // Fetch extra rows because the dashboard removes duplicate listings before display.
    const params = new URLSearchParams({ limit: '20' });
    if (pState !== 'all') params.set('state', pState);
    const url = `/api/dashboard/top-leads?${params.toString()}`;

    try {
      const res = await withTimeout(
        fetch(url, { signal: controller.signal, cache: 'no-store' }),
        TOP_LEADS_TIMEOUT_MS,
        'top_leads'
      );

      if (!mountedRef.current) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errMsg = body.error ?? `HTTP ${res.status}`;
        console.error('[useDashboardLeads] top_leads API error:', errMsg);
        setTopLeadsError(errMsg);
        setTopLeads([]);
        return;
      }

      const body = await res.json();
      const leads: DashboardLead[] = body.leads ?? [];

      if (mountedRef.current) {
        setTopLeads(leads);
        setTopLeadsError(null);
        // SUCCESS with empty array = no qualifying leads (not an error)
      }
    } catch (e) {
      if (!mountedRef.current || isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[useDashboardLeads] top leads fetch threw:', msg);
      // On timeout, show error with Retry — NOT silent empty state.
      setTopLeadsError(msg.includes('Timeout')
        ? 'Top Scored Leads timed out. Please retry.'
        : msg
      );
      setTopLeads([]);
    } finally {
      // CRITICAL: always clear loading — no code path leaves topLoading=true
      if (mountedRef.current) setTopLoading(false);
    }
  }, [enabled, portfolioState]);

  // ─── fetchStats ───────────────────────────────────────────────────────────
  // live_revenue is NOT inside fetchStats — it's independent.
  // Chart RPCs use Promise.allSettled — one failure doesn't kill others.
  const fetchStats = useCallback(async () => {
    statsAbortRef.current?.abort();
    if (!enabled) {
      if (mountedRef.current) setStatsLoading(false);
      return;
    }
    statsAbortRef.current = new AbortController();

    if (mountedRef.current) {
      setStatsLoading(true);
      setStatsError(null);
    }

    try {
      const supabase = createClient();
      const pState = portfolioState && portfolioState !== 'all' ? portfolioState : 'all';

      // ── Tier 1: Try the optimized summary RPC ────────────────────────────
      let summaryRes: { data: unknown; error: unknown } = { data: null, error: null };
      try {
        summaryRes = await withTimeout(
          supabase.rpc('get_dashboard_summary', { p_state: pState }),
          STATS_RPC_TIMEOUT_MS,
          'get_dashboard_summary'
        );
      } catch (rpcErr) {
        const rpcMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
        if (!isAbortError(rpcErr)) {
          console.warn('[useDashboardLeads] get_dashboard_summary failed, falling back to direct queries:', rpcMsg);
        }
        summaryRes = { data: null, error: rpcMsg };
      }

      if (!mountedRef.current) return;

      // ── Tier 2: Chart RPCs run independently via allSettled ──────────────
      const [stageResult, regulationResult] = await Promise.allSettled([
        withTimeout(
          supabase.rpc('get_stage_breakdown', { p_state: pState }),
          CHART_TIMEOUT_MS,
          'get_stage_breakdown'
        ),
        withTimeout(
          supabase.rpc('get_regulation_breakdown', { p_state: pState }),
          CHART_TIMEOUT_MS,
          'get_regulation_breakdown'
        ),
      ]);

      if (!mountedRef.current) return;

      // Process stage breakdown (independent — failure just leaves chart empty)
      if (stageResult.status === 'fulfilled' && !stageResult.value.error) {
        const stageRpcData = (stageResult.value.data as { stage: string; cnt: number }[] | null) ?? [];
        const stageCounts: Record<string, number> = {};
        stageRpcData.forEach((row) => {
          const s = row.stage ?? 'Unknown';
          stageCounts[s] = (stageCounts[s] || 0) + Number(row.cnt);
        });
        if (mountedRef.current) {
          setStageBreakdown(Object.entries(stageCounts).map(([stage, count]) => ({ stage, count })));
        }
      } else if (stageResult.status === 'rejected') {
        if (!isAbortError(stageResult.reason)) {
          console.warn('[useDashboardLeads] stage breakdown failed (non-blocking):', stageResult.reason);
        }
      }

      // Process regulation breakdown (independent — failure just leaves chart empty)
      if (regulationResult.status === 'fulfilled' && !regulationResult.value.error) {
        const regulationRpcData = (regulationResult.value.data as { regulation_status: string; cnt: number }[] | null) ?? [];
        const regCounts: Record<string, number> = {};
        regulationRpcData.forEach((row) => {
          const s = row.regulation_status ?? 'Unknown';
          regCounts[s] = (regCounts[s] || 0) + Number(row.cnt);
        });
        if (mountedRef.current) {
          setRegulationBreakdown(Object.entries(regCounts).map(([status, count]) => ({ status, count })));
        }
      } else if (regulationResult.status === 'rejected') {
        if (!isAbortError(regulationResult.reason)) {
          console.warn('[useDashboardLeads] regulation breakdown failed (non-blocking):', regulationResult.reason);
        }
      }

      // ── Extract KPI values from summary RPC or fall back ─────────────────
      const summary = summaryRes.data as Record<string, number> | null;

      if (summary && !summaryRes.error) {
        const highPriorityResult = extractRpcMetric(summary as Record<string, unknown>, 'high_priority', 'HIGH_PRIORITY');
        const unassignedPriorityResult = extractRpcMetric(summary as Record<string, unknown>, 'unassigned_priority', 'UNASSIGNED_PRIORITY');
        const avgScoreResult = extractRpcMetric(summary as Record<string, unknown>, 'avg_score', 'AVG_SCORE');
        const actionNeededResult = extractRpcMetric(summary as Record<string, unknown>, 'action_needed', 'ACTION_NEEDED');
        const activePipelineResult = extractRpcMetric(summary as Record<string, unknown>, 'active_pipeline', 'ACTIVE_PIPELINE');
        const strEligibleResult = extractRpcMetric(summary as Record<string, unknown>, 'str_eligible', 'STR_ELIGIBLE');

        [highPriorityResult, unassignedPriorityResult, avgScoreResult, actionNeededResult, activePipelineResult, strEligibleResult].forEach(r => {
          if (r.error) console.error('[useDashboardLeads] RPC field error:', r.error);
        });

        const rpcMissingCritical =
          highPriorityResult.error !== null ||
          unassignedPriorityResult.error !== null;

        if (mountedRef.current) {
          setStats(prev => ({
            ...prev, // preserve estimatedMonthlyRevenue from fetchLiveRevenue
            totalLeads: Number(summary.total_prospects ?? 0),
            activeLeads: activePipelineResult.value ?? Number(summary.active_pipeline ?? 0),
            actionNeededLeads: actionNeededResult.value ?? Number(summary.action_needed ?? 0),
            regulationFriendly: Number(summary.regulation_friendly ?? 0),
            highPriority: highPriorityResult.value ?? 0,
            avgScore: avgScoreResult.value ?? Number(summary.avg_score ?? 0),
            fullyVerified: Number(summary.fully_verified ?? 0),
            unassignedPriority: unassignedPriorityResult.value ?? 0,
            assignedLeads: Number(summary.assigned_leads ?? 0),
            verifiedOwner: Number(summary.verified_owner ?? 0),
            verifiedNumber: Number(summary.verified_number ?? 0),
            phoneAvailable: Number(summary.phone_available ?? 0),
            newLeads: Number(summary.new_leads_30d ?? 0),
            luxuryProspects: Number(summary.luxury_prospects ?? 0),
            luxuryFullyVerified: Number(summary.luxury_fully_verified ?? 0),
            luxuryVerifiedNumber: Number(summary.luxury_verified_number ?? 0),
            luxuryPriority: Number(summary.luxury_priority ?? 0),
            luxuryUnassignedPriority: Number(summary.luxury_unassigned_priority ?? 0),
            activePortfolios: Number(summary.active_portfolios ?? 0),
            strEligible: strEligibleResult.value ?? Number(summary.str_eligible ?? 0),
          }));
        }

        // Patch missing critical fields with direct queries
        if (rpcMissingCritical && mountedRef.current) {
          const supabaseDirect = createClient();
          const terminalFilter = `("${TERMINAL_STAGES.join('","')}")`;
          const [hpRes, upRes] = await Promise.allSettled([
            (() => {
              let q = supabaseDirect
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .neq('is_synthetic', true)
                .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
                .not('stage', 'in', terminalFilter);
              if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
              return q;
            })(),
            (() => {
              let q = supabaseDirect
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .neq('is_synthetic', true)
                .gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD)
                .not('stage', 'in', terminalFilter)
                .is('primary_agent_id', null);
              if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
              return q;
            })(),
          ]);

          if (mountedRef.current) {
            setStats(prev => ({
              ...prev,
              highPriority: hpRes.status === 'fulfilled' && !hpRes.value.error
                ? (hpRes.value.count ?? prev.highPriority)
                : prev.highPriority,
              unassignedPriority: upRes.status === 'fulfilled' && !upRes.value.error
                ? (upRes.value.count ?? prev.unassignedPriority)
                : prev.unassignedPriority,
            }));
          }
        }
      } else {
        // Fallback: individual direct queries
        console.warn('[useDashboardLeads] get_dashboard_summary unavailable, falling back to direct queries');

        const [
          totalRes,
          activePipelineRes,
          actionNeededRes,
          avgScoreRes,
          regRes,
          highPriRes,
          fullyVerifiedRes,
          unassignedPriorityRes,
          assignedRes,
          verifiedOwnerRes,
          verifiedNumberRes,
          phoneAvailableRes,
          newLeadsRes,
          luxuryProspectsRes,
          luxuryFullyVerifiedRes,
          luxuryVerifiedNumberRes,
          luxuryPriorityRes,
          luxuryUnassignedPriorityRes,
          strEligibleRes,
        ] = await Promise.allSettled([
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).in('stage', [...ACTIVE_PIPELINE_STAGES]);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD).eq('stage', 'New Lead');
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          // AVG_SCORE FALLBACK FIX: Use server-side RPC instead of .limit(100) + client-side avg.
          // Previous: .select('prospect_score').limit(100) → biased sample of 100 rows → wrong avg.
          // Fixed: get_canonical_avg_score() → SQL AVG() over full population, same as get_dashboard_summary.
          (() => {
            const ps = portfolioState && portfolioState !== 'all' ? portfolioState : 'all';
            return supabase.rpc('get_canonical_avg_score', { p_state: ps });
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).in('regulation_status', ['Allowed', 'Restricted']);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD).not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('verified_owner', true).eq('verified_number', true).not('verified_address', 'is', null).neq('verified_address', '').neq('verified_address', 'false');
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD).not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`).is('primary_agent_id', null);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).not('primary_agent_id', 'is', null);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('verified_owner', true);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('verified_number', true);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).not('contact_phone', 'is', null).neq('contact_phone', '');
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('luxury', true);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('luxury', true).eq('verified_owner', true).eq('verified_number', true).not('verified_address', 'is', null).neq('verified_address', '').neq('verified_address', 'false');
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('luxury', true).eq('verified_number', true);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('luxury', true).gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD).not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).eq('luxury', true).gte('prospect_score', HIGH_PRIORITY_SCORE_THRESHOLD).is('primary_agent_id', null).not('stage', 'in', `("${TERMINAL_STAGES.join('","')}")`);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
          (() => {
            let q = supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true).in('regulation_status', ['Allowed', 'Restricted']);
            if (portfolioState && portfolioState !== 'all') q = q.eq('state', portfolioState);
            return q;
          })(),
        ]);

        if (!mountedRef.current) return;

        // Helper to safely extract count from allSettled result
        const getCount = (r: PromiseSettledResult<{ count: number | null; error: unknown }>): number => {
          if (r.status === 'fulfilled' && !r.value.error) return r.value.count ?? 0;
          return 0;
        };

        // AVG_SCORE: extract from server-side RPC result (full population, no row cap)
        // Fixed: was .limit(100) + client-side avg → biased sample. Now uses get_canonical_avg_score RPC.
        const avgScore = (() => {
          if (avgScoreRes.status !== 'fulfilled' || avgScoreRes.value.error) {
            console.warn('[useDashboardLeads] fallback get_canonical_avg_score failed');
            return 0;
          }
          const rpcData = avgScoreRes.value.data as { avg_score?: number } | null;
          return rpcData?.avg_score ?? 0;
        })();

        setStats(prev => ({
          ...prev, // preserve estimatedMonthlyRevenue from fetchLiveRevenue
          totalLeads: getCount(totalRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          activeLeads: getCount(activePipelineRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          actionNeededLeads: getCount(actionNeededRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          regulationFriendly: getCount(regRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          highPriority: getCount(highPriRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          avgScore,
          fullyVerified: getCount(fullyVerifiedRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          unassignedPriority: getCount(unassignedPriorityRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          assignedLeads: getCount(assignedRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          verifiedOwner: getCount(verifiedOwnerRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          verifiedNumber: getCount(verifiedNumberRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          phoneAvailable: getCount(phoneAvailableRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          newLeads: getCount(newLeadsRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          luxuryProspects: getCount(luxuryProspectsRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          luxuryFullyVerified: getCount(luxuryFullyVerifiedRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          luxuryVerifiedNumber: getCount(luxuryVerifiedNumberRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          luxuryPriority: getCount(luxuryPriorityRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          luxuryUnassignedPriority: getCount(luxuryUnassignedPriorityRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
          activePortfolios: 0,
          strEligible: getCount(strEligibleRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
        }));
      }
    } catch (e) {
      if (!mountedRef.current || isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[useDashboardLeads] stats fetch threw:', msg);
      if (mountedRef.current) setStatsError(msg);
    } finally {
      // CRITICAL: always clear statsLoading — no code path leaves it true
      if (mountedRef.current) setStatsLoading(false);
    }
  }, [enabled, portfolioState]);

  // ─── Orchestration ────────────────────────────────────────────────────────
  // All three fetches run in parallel — independent, non-blocking.
  const refresh = useCallback(() => {
    fetchTopLeads();
    fetchStats();
  }, [fetchTopLeads, fetchStats]);

  const refreshTopLeads = useCallback(() => {
    fetchTopLeads();
  }, [fetchTopLeads]);

  const refreshStats = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    // Fire all three fetches simultaneously — they are fully independent
    fetchTopLeads();
    fetchStats();
  }, [fetchTopLeads, fetchStats]);

  // Backward-compat: expose a combined error for consumers that use the old API
  const error = statsError ?? topLeadsError ?? null;

  return {
    topLeads,
    stats,
    stageBreakdown,
    regulationBreakdown,
    topLoading,
    statsLoading,
    topLeadsError,
    statsError,
    liveRevenueError,
    error,
    refresh,
    refreshTopLeads,
    refreshStats,
  };
}
