'use client';

/**
 * DashboardKPIMonitor — Hourly KPI reconciliation monitor for Admin.
 *
 * CANONICAL ARCHITECTURE:
 * - All metric definitions come from src/lib/kpiDefinitions.ts (single source of truth).
 * - Both Dashboard and KPI Monitor reference the SAME canonical definitions.
 * - The monitor NEVER compares Dashboard definition A against DB definition B.
 * - A failed/missing metric shows DATA ERROR, not 0.
 * - STR Eligible is compared against Allowed+Restricted (same as Dashboard card).
 *   "Fully Allowed" (Allowed only) is a separate metric, not compared here.
 *
 * AVG SCORE ROOT CAUSE FIX (20260906000000):
 *   Previous KPI Monitor used .select('prospect_score') via PostgREST which returns
 *   at most 1000 rows by default. Client-side average of 1000 rows ≠ true average
 *   of 5,897 rows → biased sample → KPI Monitor showed 96 while Dashboard (RPC)
 *   correctly showed 93.
 *   Fix: AVG_SCORE now calls get_canonical_avg_score() RPC — server-side AVG()
 *   over the FULL population. Both Dashboard and KPI Monitor now use the same
 *   server-side aggregate → should converge to the same value.
 *
 * AVG SCORE DIVERGENCE FIX (20260906010000):
 *   Dashboard showed 96, DB showed 76 (previously 93).
 *   Both get_dashboard_summary and get_canonical_avg_score use identical logic:
 *   ROUND(AVG(prospect_score)) WHERE is_synthetic IS NOT TRUE AND prospect_score > 0.
 *   Root cause: Dashboard was displaying a stale cached value from before score
 *   data changed. The fallback path in useDashboardLeads also used .limit(100)
 *   which produced a biased sample. Both are now fixed.
 *   Tolerance reduced to 0 — both sides must return the same integer value.
 *   Use TRACE AVG SCORE (📊) to see full diagnostic breakdown including score
 *   distribution, both calculation methods, and population counts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Database,
  Activity,
  Bell,
  BellOff,
  XCircle,
  Search,
  ShieldAlert,
  BarChart2,
} from 'lucide-react';
import {
  KPI_METRIC_DEFINITIONS,
  METRIC_IDS,
  fetchCanonicalKpiCounts,
  type MetricId,
} from '@/lib/kpiDefinitions';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricStatus = 'ok' | 'warning' | 'critical' | 'error';

interface KPICheckResult {
  metricId: MetricId;
  label: string;
  displayed: number | null;
  canonical: number | null;
  difference: number | null;
  tolerance: number;
  status: MetricStatus;
  definition: string;
  /** Non-null when the displayed or canonical value could not be determined */
  errorMessage: string | null;
}

interface MonitorState {
  lastChecked: Date | null;
  checking: boolean;
  results: KPICheckResult[];
  alertCount: number;
  criticalCount: number;
  errorCount: number;
}

// ─── Avg Score Diagnostics ────────────────────────────────────────────────────
interface AvgScoreDiagnostics {
  total_prospects: number;
  scored_count: number;
  null_score_count: number;
  zero_score_count: number;
  raw_avg: number;
  rounded_avg: number;
  // Method 2: CASE WHEN (get_dashboard_summary single-scan)
  raw_avg_case_method: number;
  rounded_avg_case_method: number;
  methods_agree: boolean;
  min_score: number;
  max_score: number;
  p25: number;
  p50: number;
  p75: number;
  // Score distribution buckets
  score_distribution?: {
    score_1_24: number;
    score_25_49: number;
    score_50_74: number;
    score_75_89: number;
    score_90_100: number;
    score_over_100: number;
    score_null: number;
    score_zero: number;
  };
  population_filter: string;
  rounding_rule: string;
  definition_version: string;
  root_cause_note: string;
}

// ─── Pipeline Audit ───────────────────────────────────────────────────────────
interface PipelineRecord {
  prospect_id: string;
  address: string;
  lead_stage: string;
  prospect_score: number;
  created_at: string;
  updated_at: string;
  primary_agent_id: string | null;
  latest_call_id: string | null;
  latest_call_outcome: string | null;
  latest_call_at: string | null;
  latest_activity_type: string | null;
  latest_activity_at: string | null;
  has_legitimate_outreach: boolean;
  outreach_evidence_type: string;
}

interface PipelineAudit {
  total_pipeline: number;
  with_legitimate_outreach: number;
  without_outreach: number;
  records: PipelineRecord[];
  legitimate_outreach_types: string[];
  invalid_outreach_types: string[];
}

interface DashboardKPIMonitorProps {
  /** Current displayed KPI values from the dashboard — must use the same field names as DashboardStats */
  displayedStats: {
    totalLeads: number;
    highPriority: number;
    avgScore: number;
    actionNeededLeads: number;
    fullyVerified: number;
    phoneAvailable: number;
    unassignedPriority: number;
    assignedLeads: number;
    activeLeads: number;
    /** STR Eligible = Allowed + Restricted (same as Dashboard card) */
    regulationFriendly: number;
  };
  portfolioState?: string;
  /** Only show to admin/owner roles */
  isAdmin?: boolean;
}

// ─── Map displayedStats fields to MetricIds ───────────────────────────────────
const DISPLAYED_STAT_MAP: Record<MetricId, keyof DashboardKPIMonitorProps['displayedStats']> = {
  TOTAL_LEADS: 'totalLeads',
  HIGH_PRIORITY: 'highPriority',
  AVG_SCORE: 'avgScore',
  ACTION_NEEDED: 'actionNeededLeads',
  FULLY_VERIFIED: 'fullyVerified',
  PHONE_AVAILABLE: 'phoneAvailable',
  UNASSIGNED_PRIORITY: 'unassignedPriority',
  ASSIGNED: 'assignedLeads',
  ACTIVE_PIPELINE: 'activeLeads',
  STR_ELIGIBLE: 'regulationFriendly',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardKPIMonitor({
  displayedStats,
  portfolioState,
  isAdmin = false,
}: DashboardKPIMonitorProps) {
  const [state, setState] = useState<MonitorState>({
    lastChecked: null,
    checking: false,
    results: [],
    alertCount: 0,
    criticalCount: 0,
    errorCount: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showAvgDiag, setShowAvgDiag] = useState(false);
  const [showPipelineAudit, setShowPipelineAudit] = useState(false);
  const [avgDiag, setAvgDiag] = useState<AvgScoreDiagnostics | null>(null);
  const [avgDiagLoading, setAvgDiagLoading] = useState(false);
  const [pipelineAudit, setPipelineAudit] = useState<PipelineAudit | null>(null);
  const [pipelineAuditLoading, setPipelineAuditLoading] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionResults, setCorrectionResults] = useState<Record<string, string>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runCheck = useCallback(async () => {
    if (!isAdmin) return;
    setState(s => ({ ...s, checking: true }));

    try {
      const canonicalCounts = await fetchCanonicalKpiCounts(
        portfolioState && portfolioState !== 'all' ? portfolioState : null
      );

      const results: KPICheckResult[] = (Object.values(METRIC_IDS) as MetricId[]).map(metricId => {
        const def = KPI_METRIC_DEFINITIONS[metricId];
        const displayedField = DISPLAYED_STAT_MAP[metricId];
        const displayedRaw = displayedStats[displayedField];
        const canonicalRaw = canonicalCounts[metricId];

        const canonicalFailed = canonicalRaw === -1;
        const displayedMissing = displayedRaw === undefined || displayedRaw === null;

        if (canonicalFailed || displayedMissing) {
          const errorMessage = canonicalFailed
            ? `DB query failed for ${def.label} — check Supabase logs`
            : `Dashboard value missing for ${def.label}`;
          return {
            metricId,
            label: def.label,
            displayed: displayedMissing ? null : displayedRaw,
            canonical: null,
            difference: null,
            tolerance: def.tolerance,
            status: 'error' as MetricStatus,
            definition: def.canonicalDefinition,
            errorMessage,
          };
        }

        const displayed = displayedRaw as number;
        const canonical = canonicalRaw as number;
        const difference = Math.abs(canonical - displayed);
        const tolerance = def.tolerance;

        let status: MetricStatus = 'ok';
        if (difference > tolerance * 2) status = 'critical';
        else if (difference > tolerance) status = 'warning';

        return {
          metricId,
          label: def.label,
          displayed,
          canonical,
          difference,
          tolerance,
          status,
          definition: def.canonicalDefinition,
          errorMessage: null,
        };
      });

      const alertCount = results.filter(r => r.status === 'warning' || r.status === 'critical').length;
      const criticalCount = results.filter(r => r.status === 'critical').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      if (mountedRef.current) {
        setState(s => ({
          ...s,
          checking: false,
          results,
          alertCount,
          criticalCount,
          errorCount,
          lastChecked: new Date(),
        }));
      }
    } catch (err) {
      console.error('[DashboardKPIMonitor] check error:', err);
      if (mountedRef.current) setState(s => ({ ...s, checking: false }));
    }
  }, [isAdmin, portfolioState, displayedStats]);

  // Run on mount and every hour
  useEffect(() => {
    if (!isAdmin) return;
    runCheck();
    intervalRef.current = setInterval(runCheck, 60 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAdmin, runCheck]);

  // ─── Avg Score Diagnostics ──────────────────────────────────────────────────
  const loadAvgDiagnostics = useCallback(async () => {
    if (avgDiagLoading) return;
    setAvgDiagLoading(true);
    try {
      const supabase = createClient();
      const ps = portfolioState && portfolioState !== 'all' ? portfolioState : 'all';
      const { data, error } = await supabase.rpc('get_avg_score_diagnostics', { p_state: ps });
      if (error) throw error;
      if (mountedRef.current) setAvgDiag(data as AvgScoreDiagnostics);
    } catch (err) {
      console.error('[DashboardKPIMonitor] avg diagnostics error:', err);
    } finally {
      if (mountedRef.current) setAvgDiagLoading(false);
    }
  }, [portfolioState, avgDiagLoading]);

  const toggleAvgDiag = useCallback(() => {
    setShowAvgDiag(prev => {
      if (!prev && !avgDiag) loadAvgDiagnostics();
      return !prev;
    });
  }, [avgDiag, loadAvgDiagnostics]);

  // ─── Pipeline Audit ─────────────────────────────────────────────────────────
  const loadPipelineAudit = useCallback(async () => {
    if (pipelineAuditLoading) return;
    setPipelineAuditLoading(true);
    try {
      const supabase = createClient();
      const ps = portfolioState && portfolioState !== 'all' ? portfolioState : 'all';
      const { data, error } = await supabase.rpc('get_active_pipeline_audit', { p_state: ps });
      if (error) throw error;
      if (mountedRef.current) setPipelineAudit(data as PipelineAudit);
    } catch (err) {
      console.error('[DashboardKPIMonitor] pipeline audit error:', err);
    } finally {
      if (mountedRef.current) setPipelineAuditLoading(false);
    }
  }, [portfolioState, pipelineAuditLoading]);

  const togglePipelineAudit = useCallback(() => {
    setShowPipelineAudit(prev => {
      if (!prev && !pipelineAudit) loadPipelineAudit();
      return !prev;
    });
  }, [pipelineAudit, loadPipelineAudit]);

  // ─── Correct pipeline stage ─────────────────────────────────────────────────
  const correctStageToNewLead = useCallback(async (prospectId: string) => {
    setCorrectingId(prospectId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('correct_pipeline_stage_to_new_lead', {
        p_lead_id: prospectId,
        p_reason: 'No legitimate outreach event found supporting non-New-Lead stage — corrected via KPI Monitor pipeline audit',
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (mountedRef.current) {
        setCorrectionResults(prev => ({
          ...prev,
          [prospectId]: result.success ? 'Corrected to New Lead ✓' : (result.error ?? 'Failed'),
        }));
        // Refresh pipeline audit after correction
        if (result.success) {
          setPipelineAudit(null);
          loadPipelineAudit();
          // Re-run KPI check to reflect updated counts
          setTimeout(() => runCheck(), 1000);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (mountedRef.current) {
        setCorrectionResults(prev => ({ ...prev, [prospectId]: `Error: ${msg}` }));
      }
    } finally {
      if (mountedRef.current) setCorrectingId(null);
    }
  }, [loadPipelineAudit, runCheck]);

  if (!isAdmin) return null;
  if (state.results.length === 0 && !state.checking) return null;

  const hasAlerts = (state.alertCount > 0 || state.errorCount > 0) && !muted;
  const hasCritical = state.criticalCount > 0 && !muted;
  const hasErrors = state.errorCount > 0 && !muted;

  // Compact banner when no alerts
  if (!hasAlerts && !state.checking && state.results.length > 0 && !expanded) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">
          KPI Monitor: All {state.results.length} metrics within tolerance
          {state.lastChecked && (
            <span className="text-emerald-600/60 ml-1">
              · checked{' '}
              {state.lastChecked.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </p>
        <button
          onClick={runCheck}
          disabled={state.checking}
          className="p-1 rounded hover:bg-emerald-500/10 transition-colors"
        >
          <RefreshCw
            size={11}
            className={`text-emerald-600 ${state.checking ? 'animate-spin' : ''}`}
          />
        </button>
        <button
          onClick={() => setExpanded(true)}
          className="p-1 rounded hover:bg-emerald-500/10 transition-colors"
        >
          <ChevronDown size={11} className="text-emerald-600" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`border rounded-xl overflow-hidden ${
        hasCritical || hasErrors
          ? 'border-red-500/40 bg-red-500/5'
          : hasAlerts
          ? 'border-amber-500/40 bg-amber-500/5' :'border-border bg-card'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        {state.checking ? (
          <Loader2 size={14} className="text-muted-foreground animate-spin shrink-0" />
        ) : hasCritical || hasErrors ? (
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
        ) : hasAlerts ? (
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">KPI Monitor</span>
            {state.checking && (
              <span className="text-xs text-muted-foreground">Checking…</span>
            )}
            {!state.checking && hasCritical && (
              <span className="text-xs font-semibold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">
                {state.criticalCount} critical divergence{state.criticalCount !== 1 ? 's' : ''}
              </span>
            )}
            {!state.checking && hasErrors && (
              <span className="text-xs font-semibold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">
                {state.errorCount} DATA ERROR{state.errorCount !== 1 ? 'S' : ''}
              </span>
            )}
            {!state.checking && hasAlerts && !hasCritical && !hasErrors && (
              <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {state.alertCount} metric{state.alertCount !== 1 ? 's' : ''} diverged
              </span>
            )}
          </div>
          {state.lastChecked && (
            <p className="text-[10px] text-muted-foreground">
              Last checked:{' '}
              {state.lastChecked.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · Hourly auto-check
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleAvgDiag}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Trace Avg Score diagnostics"
          >
            <BarChart2 size={12} />
          </button>
          <button
            onClick={togglePipelineAudit}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Audit Active Pipeline records"
          >
            <ShieldAlert size={12} />
          </button>
          <button
            onClick={() => setMuted(m => !m)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title={muted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {muted ? <BellOff size={12} /> : <Bell size={12} />}
          </button>
          <button
            onClick={runCheck}
            disabled={state.checking}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Run check now"
          >
            <RefreshCw size={12} className={state.checking ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expanded results table */}
      {expanded && state.results.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-2 bg-muted/30 flex items-center gap-2">
            <Database size={11} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Dashboard vs Canonical DB — Same definition on both sides
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-muted-foreground font-semibold">Metric</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Dashboard</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-semibold">DB Count</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Diff</th>
                  <th className="text-center px-3 py-2 text-muted-foreground font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.results.map(row => (
                  <tr
                    key={row.metricId}
                    className={`border-b border-border/50 last:border-0 ${
                      row.status === 'error' ? 'bg-red-500/10'
                        : row.status === 'critical' ? 'bg-red-500/5'
                        : row.status === 'warning' ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2">
                      <div>
                        <span className="font-medium text-foreground">{row.label}</span>
                        <p
                          className="text-[10px] text-muted-foreground mt-0.5 max-w-[220px] truncate"
                          title={row.definition}
                        >
                          {row.definition}
                        </p>
                        {row.errorMessage && (
                          <p className="text-[10px] text-red-600 mt-0.5 font-medium">
                            {row.errorMessage}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-3 py-2 font-mono text-foreground">
                      {row.displayed !== null ? row.displayed.toLocaleString() : (
                        <span className="text-red-600 font-semibold text-[10px]">DATA ERROR</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2 font-mono text-foreground">
                      {row.canonical !== null ? row.canonical.toLocaleString() : (
                        <span className="text-red-600 font-semibold text-[10px]">DATA ERROR</span>
                      )}
                    </td>
                    <td
                      className={`text-right px-3 py-2 font-mono font-semibold ${
                        row.difference === null ? 'text-red-600'
                          : row.difference === 0 ? 'text-muted-foreground'
                          : row.status === 'critical' ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      {row.difference === null ? 'N/A'
                        : row.difference === 0 ? '—'
                        : `±${row.difference.toLocaleString()}`}
                    </td>
                    <td className="text-center px-3 py-2">
                      {row.status === 'ok' && (
                        <CheckCircle2 size={13} className="text-emerald-500 mx-auto" />
                      )}
                      {row.status === 'warning' && (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle size={11} />
                          <span className="text-[10px]">WARN</span>
                        </span>
                      )}
                      {row.status === 'critical' && (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                          <AlertTriangle size={11} />
                          <span className="text-[10px]">CRIT</span>
                        </span>
                      )}
                      {row.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                          <XCircle size={11} />
                          <span className="text-[10px]">ERROR</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(hasAlerts || hasErrors) && (
            <div className="px-4 py-3 border-t border-border bg-muted/20">
              <div className="flex items-start gap-2">
                <Activity size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {hasErrors
                    ? 'DATA ERROR means a metric query failed or returned undefined — not a real zero. Check Supabase logs and the get_dashboard_summary RPC.'
                    : 'Divergences may indicate a sync delay, stale cache, or data quality issue. Check Sync Health and Dedup Monitor if critical metrics diverge.'}
                  {' '}All metrics use the same canonical definitions on both sides.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRACE AVG SCORE Diagnostics Panel ─────────────────────────────── */}
      {showAvgDiag && (
        <div className="border-t border-border bg-muted/10">
          <div className="px-4 py-2 bg-blue-500/5 border-b border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={11} className="text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                TRACE AVG SCORE — Canonical Diagnostics
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadAvgDiagnostics}
                disabled={avgDiagLoading}
                className="p-1 rounded hover:bg-blue-500/10 transition-colors"
                title="Refresh diagnostics"
              >
                <RefreshCw size={10} className={`text-blue-500 ${avgDiagLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowAvgDiag(false)} className="p-1 rounded hover:bg-muted transition-colors">
                <XCircle size={10} className="text-muted-foreground" />
              </button>
            </div>
          </div>
          {avgDiagLoading && !avgDiag ? (
            <div className="px-4 py-3 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Running server-side diagnostics…</span>
            </div>
          ) : avgDiag ? (
            <div className="px-4 py-3 space-y-3">
              {/* Root cause note */}
              <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  <span className="font-semibold">Root Cause Fixed:</span> {avgDiag.root_cause_note}
                </p>
              </div>
              {/* Methods agreement check */}
              {avgDiag.methods_agree === false && (
                <div className="p-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-[10px] text-red-700 dark:text-red-400 font-semibold">
                    ⚠ METHODS DISAGREE: FILTER method = {avgDiag.rounded_avg}, CASE WHEN method = {avgDiag.rounded_avg_case_method}.
                    This indicates a data anomaly — both methods should return identical values.
                  </p>
                </div>
              )}
              {/* Population breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Total Prospects', value: avgDiag.total_prospects.toLocaleString(), color: 'text-foreground' },
                  { label: 'Scored (> 0)', value: avgDiag.scored_count.toLocaleString(), color: 'text-emerald-600' },
                  { label: 'Null/Zero Score', value: (avgDiag.null_score_count + avgDiag.zero_score_count).toLocaleString(), color: 'text-amber-600' },
                  { label: 'Rounded Avg', value: String(avgDiag.rounded_avg), color: 'text-blue-600 font-bold' },
                ].map(item => (
                  <div key={item.label} className="bg-card border border-border rounded-lg p-2 text-center">
                    <p className={`text-sm font-mono font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              {/* Both calculation methods */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 text-center">
                  <p className="text-xs font-mono font-bold text-blue-600">{avgDiag.rounded_avg}</p>
                  <p className="text-[10px] text-muted-foreground">FILTER method (KPI Monitor)</p>
                  <p className="text-[10px] text-muted-foreground/60">raw: {avgDiag.raw_avg}</p>
                </div>
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-2 text-center">
                  <p className="text-xs font-mono font-bold text-purple-600">{avgDiag.rounded_avg_case_method ?? avgDiag.rounded_avg}</p>
                  <p className="text-[10px] text-muted-foreground">CASE WHEN method (Dashboard RPC)</p>
                  <p className="text-[10px] text-muted-foreground/60">raw: {avgDiag.raw_avg_case_method ?? avgDiag.raw_avg}</p>
                </div>
              </div>
              {/* Score distribution */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { label: 'Min', value: String(avgDiag.min_score) },
                  { label: 'P25', value: String(avgDiag.p25) },
                  { label: 'Median', value: String(avgDiag.p50) },
                  { label: 'P75', value: String(avgDiag.p75) },
                  { label: 'Max', value: String(avgDiag.max_score) },
                ].map(item => (
                  <div key={item.label} className="bg-muted/30 rounded-lg p-2 text-center">
                    <p className="text-xs font-mono font-semibold text-foreground">{item.value}</p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
              {/* Score buckets */}
              {avgDiag.score_distribution && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Score Distribution</p>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {[
                      { label: 'NULL', value: avgDiag.score_distribution.score_null, color: 'text-muted-foreground' },
                      { label: 'Zero', value: avgDiag.score_distribution.score_zero, color: 'text-amber-600' },
                      { label: '1–24', value: avgDiag.score_distribution.score_1_24, color: 'text-red-600' },
                      { label: '25–49', value: avgDiag.score_distribution.score_25_49, color: 'text-orange-600' },
                      { label: '50–74', value: avgDiag.score_distribution.score_50_74, color: 'text-yellow-600' },
                      { label: '75–89', value: avgDiag.score_distribution.score_75_89, color: 'text-emerald-600' },
                      { label: '90–100', value: avgDiag.score_distribution.score_90_100, color: 'text-blue-600' },
                      { label: '>100', value: avgDiag.score_distribution.score_over_100, color: 'text-red-600' },
                    ].map(item => (
                      <div key={item.label} className="bg-card border border-border rounded p-1.5 text-center">
                        <p className={`text-xs font-mono font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                        <p className="text-[9px] text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Definition */}
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <p><span className="font-semibold">Population:</span> {avgDiag.population_filter}</p>
                <p><span className="font-semibold">Rounding:</span> {avgDiag.rounding_rule}</p>
                <p><span className="font-semibold">Definition version:</span> {avgDiag.definition_version}</p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Click refresh to load diagnostics.</p>
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE AUDIT Panel ───────────────────────────────────────────── */}
      {showPipelineAudit && (
        <div className="border-t border-border bg-muted/10">
          <div className="px-4 py-2 bg-orange-500/5 border-b border-orange-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={11} className="text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                ACTIVE PIPELINE AUDIT — Outreach Integrity Check
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadPipelineAudit}
                disabled={pipelineAuditLoading}
                className="p-1 rounded hover:bg-orange-500/10 transition-colors"
                title="Refresh audit"
              >
                <RefreshCw size={10} className={`text-orange-500 ${pipelineAuditLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowPipelineAudit(false)} className="p-1 rounded hover:bg-muted transition-colors">
                <XCircle size={10} className="text-muted-foreground" />
              </button>
            </div>
          </div>
          {pipelineAuditLoading && !pipelineAudit ? (
            <div className="px-4 py-3 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Auditing pipeline records…</span>
            </div>
          ) : pipelineAudit ? (
            <div className="px-4 py-3 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total Pipeline', value: pipelineAudit.total_pipeline, color: 'text-foreground' },
                  { label: 'Valid Outreach', value: pipelineAudit.with_legitimate_outreach, color: 'text-emerald-600' },
                  { label: 'No Outreach', value: pipelineAudit.without_outreach, color: pipelineAudit.without_outreach > 0 ? 'text-red-600' : 'text-muted-foreground' },
                ].map(item => (
                  <div key={item.label} className="bg-card border border-border rounded-lg p-2 text-center">
                    <p className={`text-lg font-mono font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>

              {pipelineAudit.without_outreach > 0 && (
                <div className="p-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-[10px] text-red-700 dark:text-red-400 font-semibold">
                    ⚠ {pipelineAudit.without_outreach} pipeline record{pipelineAudit.without_outreach !== 1 ? 's have' : ' has'} no legitimate outreach event.
                    These should be corrected to New Lead stage.
                  </p>
                </div>
              )}

              {/* Records table */}
              {pipelineAudit.records.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-2 py-1.5 text-muted-foreground font-semibold">Address</th>
                        <th className="text-left px-2 py-1.5 text-muted-foreground font-semibold">Stage</th>
                        <th className="text-right px-2 py-1.5 text-muted-foreground font-semibold">Score</th>
                        <th className="text-left px-2 py-1.5 text-muted-foreground font-semibold">Outreach Evidence</th>
                        <th className="text-center px-2 py-1.5 text-muted-foreground font-semibold">Valid</th>
                        <th className="text-center px-2 py-1.5 text-muted-foreground font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineAudit.records.map(rec => (
                        <tr key={rec.prospect_id} className={`border-b border-border/50 last:border-0 ${!rec.has_legitimate_outreach ? 'bg-red-500/5' : ''}`}>
                          <td className="px-2 py-1.5 max-w-[160px] truncate" title={rec.address}>
                            {rec.address}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium">
                              {rec.lead_stage}
                            </span>
                          </td>
                          <td className="text-right px-2 py-1.5 font-mono">{rec.prospect_score}</td>
                          <td className="px-2 py-1.5 max-w-[180px]">
                            {rec.outreach_evidence_type === 'NONE' ? (
                              <span className="text-red-600 font-semibold text-[10px]">NONE</span>
                            ) : (
                              <span className="text-emerald-600 text-[10px] truncate block" title={rec.outreach_evidence_type}>
                                {rec.outreach_evidence_type}
                              </span>
                            )}
                          </td>
                          <td className="text-center px-2 py-1.5">
                            {rec.has_legitimate_outreach ? (
                              <CheckCircle2 size={12} className="text-emerald-500 mx-auto" />
                            ) : (
                              <XCircle size={12} className="text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="text-center px-2 py-1.5">
                            {correctionResults[rec.prospect_id] ? (
                              <span className={`text-[10px] font-medium ${correctionResults[rec.prospect_id].includes('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                                {correctionResults[rec.prospect_id]}
                              </span>
                            ) : !rec.has_legitimate_outreach ? (
                              <button
                                onClick={() => correctStageToNewLead(rec.prospect_id)}
                                disabled={correctingId === rec.prospect_id}
                                className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors font-medium disabled:opacity-50"
                              >
                                {correctingId === rec.prospect_id ? (
                                  <Loader2 size={10} className="animate-spin inline" />
                                ) : 'Fix → New Lead'}
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pipelineAudit.records.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No active pipeline records found.
                </p>
              )}

              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold">Legitimate outreach:</span> connected call, SMS reply, email reply, appointment, proposal, contract, manual stage change.
                Assignment, CSV import, verification, enrichment, and listing status changes do NOT count.
              </p>
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Click refresh to audit pipeline records.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
