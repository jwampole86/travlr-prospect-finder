'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Clock,
  Database,
  Zap,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Play,
  BarChart2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TraceStep {
  label: string;
  ms: number;
  status: 'ok' | 'warn' | 'critical' | 'error';
}

interface PageTrace {
  page: string;
  steps: TraceStep[];
  totalMs: number;
  firstUsefulMs: number;
  fullySettledMs: number;
  requestCount: number;
  payloadKb: number;
  cacheHit: boolean;
  errors: string[];
  timestamp: string;
}

interface DiagnosticRow {
  page: string;
  beforeMs: number | null;
  afterMs: number | null;
  slowestApi: string;
  slowestQuery: string;
  initialRequests: number;
  payloadKb: number;
  cacheStatus: string;
  errors: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(ms: number, warn = 1000, critical = 3000) {
  if (ms >= critical) return 'text-destructive';
  if (ms >= warn) return 'text-warning';
  return 'text-success';
}

function statusBadge(ms: number, warn = 1000, critical = 3000) {
  if (ms >= critical) return 'bg-destructive/10 text-destructive border-destructive/30';
  if (ms >= warn) return 'bg-warning/10 text-warning border-warning/30';
  return 'bg-success/10 text-success border-success/30';
}

function formatMs(ms: number | null) {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ─── Trace runner ─────────────────────────────────────────────────────────────

async function runPageTrace(page: string): Promise<PageTrace> {
  const steps: TraceStep[] = [];
  const errors: string[] = [];
  const start = performance.now();

  const mark = (label: string, status: TraceStep['status'] = 'ok') => {
    steps.push({ label, ms: Math.round(performance.now() - start), status });
  };

  mark('Route initialized');

  // Auth check
  try {
    const authStart = performance.now();
    await fetch('/api/auth/callback', { method: 'HEAD' }).catch(() => null);
    const authMs = Math.round(performance.now() - authStart);
    mark(`Auth resolved`, authMs > 500 ? 'warn' : 'ok');
  } catch {
    mark('Auth check failed', 'error');
    errors.push('Auth check failed');
  }

  // Page-specific API calls
  const apiCalls: { label: string; url: string; warnMs?: number }[] = [];

  if (page === 'Dashboard') {
    apiCalls.push(
      { label: 'Summary RPC', url: '/api/dashboard/summary', warnMs: 500 },
      { label: 'Pipeline RPC', url: '/api/dashboard/pipeline', warnMs: 500 },
      { label: 'Top Leads', url: '/api/leads/paginated?page=1&pageSize=10&sortKey=prospect_score&sortDir=desc', warnMs: 800 },
      { label: 'Recent Activity', url: '/api/dashboard/activity', warnMs: 500 },
      { label: 'Regulation Status', url: '/api/dashboard/regulation-status', warnMs: 500 },
    );
  } else if (page === 'Lead Management') {
    apiCalls.push(
      { label: 'Leads Page 1', url: '/api/leads/paginated?page=1&pageSize=50&sortKey=prospect_score&sortDir=desc', warnMs: 2000 },
    );
  } else if (page === 'Prospect Finder') {
    apiCalls.push(
      { label: 'Prospects Page 1', url: '/api/leads/paginated?page=1&pageSize=50&sortKey=prospect_score&sortDir=desc&scoreMin=60', warnMs: 2000 },
    );
  } else if (page === 'Property Profile') {
    apiCalls.push(
      { label: 'Lead Detail', url: '/api/leads/paginated?page=1&pageSize=1', warnMs: 1500 },
    );
  }

  let slowestApi = '';
  let slowestApiMs = 0;
  let totalPayloadBytes = 0;
  let requestCount = 0;

  for (const call of apiCalls) {
    try {
      const callStart = performance.now();
      const res = await fetch(call.url, { signal: AbortSignal.timeout(10_000) });
      const callMs = Math.round(performance.now() - callStart);
      requestCount++;

      // Estimate payload size
      const text = await res.text().catch(() => '');
      totalPayloadBytes += text.length;

      const warnThreshold = call.warnMs ?? 1000;
      const status: TraceStep['status'] = callMs >= 3000 ? 'critical' : callMs >= warnThreshold ? 'warn' : 'ok';
      mark(`${call.label}: ${callMs}ms`, status);

      if (callMs > slowestApiMs) {
        slowestApiMs = callMs;
        slowestApi = `${call.label} (${callMs}ms)`;
      }

      if (!res.ok) {
        errors.push(`${call.label}: HTTP ${res.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      mark(`${call.label}: FAILED`, 'error');
      errors.push(`${call.label}: ${msg}`);
    }
  }

  const totalMs = Math.round(performance.now() - start);
  const firstUsefulMs = steps.find(s => s.label.includes('initialized'))?.ms ?? 0;
  const fullySettledMs = totalMs;

  mark('Fully settled', totalMs > 3000 ? 'critical' : totalMs > 1500 ? 'warn' : 'ok');

  return {
    page,
    steps,
    totalMs,
    firstUsefulMs,
    fullySettledMs,
    requestCount,
    payloadKb: Math.round(totalPayloadBytes / 1024),
    cacheHit: false,
    errors,
    timestamp: new Date().toISOString(),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const PAGES = [
  'Dashboard',
  'Lead Management',
  'Prospect Finder',
  'Property Profile',
  'Agent Dashboard',
  'Teleprompter',
];

const DIAGNOSTIC_ROWS: DiagnosticRow[] = PAGES.map(page => ({
  page,
  beforeMs: null,
  afterMs: null,
  slowestApi: '—',
  slowestQuery: '—',
  initialRequests: 0,
  payloadKb: 0,
  cacheStatus: 'unknown',
  errors: '—',
}));

export default function PerformanceDiagnosticsPage() {
  const { role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [traces, setTraces] = useState<PageTrace[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const [diagnosticRows, setDiagnosticRows] = useState<DiagnosticRow[]>(DIAGNOSTIC_ROWS);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'owner') {
      router.replace('/');
    }
  }, [authLoading, role, router]);

  const runTrace = useCallback(async (page: string) => {
    if (!mountedRef.current) return;
    setRunning(page);
    try {
      const trace = await runPageTrace(page);
      if (!mountedRef.current) return;
      setTraces(prev => {
        const filtered = prev.filter(t => t.page !== page);
        return [trace, ...filtered];
      });
      // Update diagnostic row
      setDiagnosticRows(prev => prev.map(row => {
        if (row.page !== page) return row;
        return {
          ...row,
          afterMs: trace.totalMs,
          slowestApi: trace.steps.reduce((s, step) => {
            const match = step.label.match(/(.+): (\d+)ms/);
            if (!match) return s;
            const ms = parseInt(match[2], 10);
            const prev2 = s === '—' ? 0 : parseInt(s.match(/\((\d+)ms\)/)?.[1] ?? '0', 10);
            return ms > prev2 ? `${match[1]} (${ms}ms)` : s;
          }, '—'),
          initialRequests: trace.requestCount,
          payloadKb: trace.payloadKb,
          cacheStatus: trace.cacheHit ? 'HIT' : 'MISS',
          errors: trace.errors.length > 0 ? trace.errors.join('; ') : 'None',
        };
      }));
    } catch (e) {
      console.error('[PerformanceDiagnostics] trace failed:', e);
    } finally {
      if (mountedRef.current) setRunning(null);
    }
  }, []);

  const runAllTraces = useCallback(async () => {
    for (const page of PAGES) {
      await runTrace(page);
    }
  }, [runTrace]);

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Activity size={20} className="text-primary" />
              Performance Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Admin-only · Trace page load paths, measure API latency, identify bottlenecks
            </p>
          </div>
          <button
            onClick={runAllTraces}
            disabled={running !== null}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {running ? (
              <><RefreshCw size={14} className="animate-spin" /> Running...</>
            ) : (
              <><Play size={14} /> Run All Traces</>
            )}
          </button>
        </div>

        {/* Performance Targets */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BarChart2 size={14} className="text-primary" />
            Performance Targets
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Page Shell', target: '< 500ms' },
              { label: 'Dashboard First Content', target: '< 1.5s' },
              { label: 'Lead Management', target: '< 2s' },
              { label: 'Prospect Finder', target: '< 2s' },
              { label: 'Property Profile', target: '< 1.5s' },
              { label: 'Teleprompter', target: '< 1.5s' },
            ].map(t => (
              <div key={t.label} className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground">{t.label}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{t.target}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Diagnostic Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database size={14} className="text-primary" />
              Page Load Report
            </h2>
            <span className="text-[11px] text-muted-foreground">Click a page row to run its trace</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Page</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Load Time</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Slowest API</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Requests</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Payload</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Cache</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Errors</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {diagnosticRows.map(row => (
                  <tr key={row.page} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{row.page}</td>
                    <td className="px-4 py-3">
                      {row.afterMs !== null ? (
                        <span className={`font-mono font-semibold ${statusColor(row.afterMs, 1500, 3000)}`}>
                          {formatMs(row.afterMs)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{row.slowestApi}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.initialRequests || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.payloadKb ? `${row.payloadKb} KB` : '—'}</td>
                    <td className="px-4 py-3">
                      {row.cacheStatus !== 'unknown' ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${row.cacheStatus === 'HIT' ? 'bg-success/10 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'}`}>
                          {row.cacheStatus}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.errors !== '—' && row.errors !== 'None' ? (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle size={10} /> {row.errors.length > 30 ? row.errors.slice(0, 30) + '…' : row.errors}
                        </span>
                      ) : row.errors === 'None' ? (
                        <span className="text-success flex items-center gap-1"><CheckCircle size={10} /> None</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => runTrace(row.page)}
                        disabled={running !== null}
                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-[10px] font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                      >
                        {running === row.page ? (
                          <RefreshCw size={10} className="animate-spin" />
                        ) : (
                          <Play size={10} />
                        )}
                        Trace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trace Results */}
        {traces.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              Trace Results
            </h2>
            {traces.map(trace => (
              <div key={`${trace.page}-${trace.timestamp}`} className="bg-card rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedTrace(expandedTrace === trace.page ? null : trace.page)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-foreground">TRACE PAGE LOAD: {trace.page}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge(trace.totalMs, 1500, 3000)}`}>
                      {formatMs(trace.totalMs)}
                    </span>
                    {trace.errors.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/30">
                        {trace.errors.length} error{trace.errors.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(trace.timestamp).toLocaleTimeString()}
                    </span>
                    {expandedTrace === trace.page ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {expandedTrace === trace.page && (
                  <div className="border-t border-border">
                    {/* Step timeline */}
                    <div className="px-5 py-4 font-mono text-xs space-y-1.5 bg-muted/20">
                      {trace.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            step.status === 'ok' ? 'bg-success' :
                            step.status === 'warn' ? 'bg-warning' :
                            step.status === 'critical'? 'bg-destructive' : 'bg-muted-foreground'
                          }`} />
                          <span className="text-muted-foreground w-16 shrink-0 text-right">{step.ms}ms</span>
                          <span className={
                            step.status === 'ok' ? 'text-foreground' :
                            step.status === 'warn' ? 'text-warning' :
                            step.status === 'critical'? 'text-destructive' : 'text-muted-foreground'
                          }>{step.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Summary */}
                    <div className="px-5 py-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">First Useful Render</p>
                        <p className={`text-sm font-semibold ${statusColor(trace.firstUsefulMs, 500, 1500)}`}>
                          {formatMs(trace.firstUsefulMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Fully Settled</p>
                        <p className={`text-sm font-semibold ${statusColor(trace.fullySettledMs, 1500, 3000)}`}>
                          {formatMs(trace.fullySettledMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">API Requests</p>
                        <p className="text-sm font-semibold text-foreground">{trace.requestCount}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Payload Size</p>
                        <p className="text-sm font-semibold text-foreground">{trace.payloadKb} KB</p>
                      </div>
                    </div>

                    {/* Errors */}
                    {trace.errors.length > 0 && (
                      <div className="px-5 py-3 border-t border-border bg-destructive/5">
                        <p className="text-[11px] font-semibold text-destructive mb-1.5">Errors</p>
                        {trace.errors.map((e, i) => (
                          <p key={i} className="text-[11px] text-destructive font-mono">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Architecture Rules */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            Architecture Rules (Non-Negotiable)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            {[
              '✅ Dashboard sections load independently — one slow section never blocks others',
              '✅ Server-side pagination — Lead Management fetches 25–50 rows, not thousands',
              '✅ No full-database frontend fetches — use aggregation RPCs for KPIs',
              '✅ No source syncs during page load — syncs are manual/scheduled only',
              '✅ No regulation research during page load — reads canonical stored data',
              '✅ Every async request has a 10–15s timeout — no infinite spinners',
              '✅ Every loading setter has a finally block — loading never stays true',
              '✅ Request cancellation on unmount/route change via AbortController',
              '✅ Search debounced 300ms — no query on every keystroke',
              '✅ Skeleton loading per section — no full-page spinner for data loads',
              '✅ Error state with Retry per section — one failure never freezes the page',
              '✅ Heavy work (bulk SMS, enrichment, CSV import) queued as background jobs',
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
