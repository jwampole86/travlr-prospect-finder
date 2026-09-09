'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Database, Clock, ShieldAlert, Info, ChevronDown, ChevronUp,
  BarChart2, Search
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioDiagnostic {
  portfolio: string;
  state_code: string;
  // Request
  request_status: 'success' | 'error' | 'no_data';
  request_error: string | null;
  query_used: string;
  // Counts
  raw_count: number;
  real_count: number;
  synthetic_count: number;
  validated_count: number;
  mismatch_count: number;
  // Breakdown
  by_source: Record<string, number>;
  by_stage: Record<string, number>;
  // Metadata
  last_synced_at: string | null;
  duration_ms: number;
  suspicious_empty: boolean;
  previous_count: number | null;
}

interface SyncEvent {
  id: string;
  operation_id: string;
  status: string;
  created_at: string;
  payload: {
    db_total?: number;
    db_real?: number;
    db_synthetic?: number;
    leads_imported?: number;
    leads_inserted?: number;
    error_count?: number;
    errors?: string[];
    suspicious_empty?: boolean;
  };
}

// ─── Portfolio → state mapping ────────────────────────────────────────────────

const PORTFOLIO_STATE_MAP: Record<string, string> = {
  'Colorado Portfolio': 'CO',
  'California Portfolio': 'CA',
  'Nevada Portfolio': 'NV',
  'Washington Portfolio': 'WA',
  'Texas Portfolio': 'TX',
  'Florida Portfolio': 'FL',
  'Utah Portfolio': 'UT',
  'Maine Portfolio': 'ME',
  'Oregon Portfolio': 'OR',
  'Massachusetts Portfolio': 'MA',
  'Maryland Portfolio': 'MD',
};

const ALL_PORTFOLIOS = Object.keys(PORTFOLIO_STATE_MAP);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: 'success' | 'error' | 'no_data') {
  if (status === 'success') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'error') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

function statusIcon(status: 'success' | 'error' | 'no_data') {
  if (status === 'success') return <CheckCircle2 size={12} className="text-green-600" />;
  if (status === 'error') return <XCircle size={12} className="text-red-600" />;
  return <AlertTriangle size={12} className="text-gray-500" />;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Diagnostic Row ───────────────────────────────────────────────────────────

function DiagnosticRow({ diag }: { diag: PortfolioDiagnostic }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = diag.request_status === 'error';
  const hasSuspicious = diag.suspicious_empty;

  return (
    <div className={`border rounded-xl overflow-hidden ${hasError ? 'border-red-200' : hasSuspicious ? 'border-amber-200' : 'border-border'}`}>
      {/* Main row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Portfolio name */}
          <span className="text-sm font-semibold text-foreground min-w-[160px]">
            {diag.portfolio.replace(' Portfolio', '')}
          </span>

          {/* State code */}
          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {diag.state_code}
          </span>

          {/* Status */}
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusBadge(diag.request_status)}`}>
            {statusIcon(diag.request_status)}
            {diag.request_status === 'success' ? 'OK' : diag.request_status === 'error' ? 'ERROR' : 'NO DATA'}
          </span>

          {/* Suspicious */}
          {hasSuspicious && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <ShieldAlert size={10} />
              Suspicious empty
            </span>
          )}

          {/* Counts */}
          <div className="flex items-center gap-4 ml-auto text-xs">
            <span className="text-muted-foreground">
              Raw: <strong className="text-foreground">{diag.raw_count.toLocaleString()}</strong>
            </span>
            <span className="text-muted-foreground">
              Real: <strong className="text-green-600">{diag.real_count.toLocaleString()}</strong>
            </span>
            <span className="text-muted-foreground">
              Synthetic: <strong className="text-amber-600">{diag.synthetic_count.toLocaleString()}</strong>
            </span>
            <span className="text-muted-foreground">
              Validated: <strong className="text-blue-600">{diag.validated_count.toLocaleString()}</strong>
            </span>
            <span className="text-muted-foreground hidden sm:block">
              Mismatch: <strong className="text-red-500">{diag.mismatch_count.toLocaleString()}</strong>
            </span>
            <span className="text-muted-foreground hidden md:block">
              <Clock size={10} className="inline mr-0.5" />
              {formatDuration(diag.duration_ms)}
            </span>
          </div>

          {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 divide-y divide-border">
          {/* Request info */}
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Request</p>
              <div className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Status:</span>
                  <span className={`font-semibold ${hasError ? 'text-red-600' : 'text-green-600'}`}>
                    {diag.request_status.toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Source:</span>
                  <span className="font-mono text-foreground">Supabase leads table</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Query:</span>
                  <code className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded text-[10px] break-all">
                    {diag.query_used}
                  </code>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Duration:</span>
                  <span className="font-mono text-foreground">{formatDuration(diag.duration_ms)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Last sync:</span>
                  <span className="text-foreground">{formatDate(diag.last_synced_at)}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pipeline Counts</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Raw Count', value: diag.raw_count, color: 'text-foreground' },
                  { label: 'Real Leads', value: diag.real_count, color: 'text-green-600' },
                  { label: 'Synthetic', value: diag.synthetic_count, color: 'text-amber-600' },
                  { label: 'Validated', value: diag.validated_count, color: 'text-blue-600' },
                  { label: 'Mismatch', value: diag.mismatch_count, color: 'text-red-500' },
                  { label: 'Inserted', value: diag.real_count, color: 'text-green-600' },
                  { label: 'Updated', value: 0, color: 'text-muted-foreground' },
                  { label: 'Failed', value: hasError ? 1 : 0, color: hasError ? 'text-red-600' : 'text-muted-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-background border border-border rounded px-2 py-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className={`text-sm font-bold ${color}`}>{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {diag.request_error && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">Error</p>
              <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs font-mono text-red-800 break-all">
                {diag.request_error}
              </div>
            </div>
          )}

          {/* Suspicious empty */}
          {hasSuspicious && diag.previous_count !== null && (
            <div className="px-4 py-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <ShieldAlert size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <p className="font-semibold">⚠ Suspicious Empty Result — Existing Data Preserved</p>
                  <p className="mt-0.5">
                    Previous sync recorded <strong>{diag.previous_count.toLocaleString()}</strong> records for this portfolio.
                    Current query returned 0. Existing data has NOT been deleted.
                    Possible causes: RLS policy blocking read, state code mismatch, or all leads marked synthetic.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Source breakdown */}
          {Object.keys(diag.by_source).length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Source</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(diag.by_source)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => (
                    <span key={src} className="text-xs bg-background border border-border rounded px-2 py-1">
                      <span className="font-medium text-foreground">{src}</span>
                      <span className="text-muted-foreground ml-1">{count.toLocaleString()}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Stage breakdown */}
          {Object.keys(diag.by_stage).length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Stage</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(diag.by_stage)
                  .sort(([, a], [, b]) => b - a)
                  .map(([stage, count]) => (
                    <span key={stage} className="text-xs bg-background border border-border rounded px-2 py-1">
                      <span className="font-medium text-foreground">{stage}</span>
                      <span className="text-muted-foreground ml-1">{count.toLocaleString()}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SyncDiagnosticsPage() {
  const supabase = createClient();
  const [diagnostics, setDiagnostics] = useState<PortfolioDiagnostic[]>([]);
  const [recentEvents, setRecentEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    const results: PortfolioDiagnostic[] = [];

    for (const portfolio of ALL_PORTFOLIOS) {
      const stateCode = PORTFOLIO_STATE_MAP[portfolio];
      const startTime = Date.now();

      const diag: PortfolioDiagnostic = {
        portfolio,
        state_code: stateCode,
        request_status: 'success',
        request_error: null,
        query_used: `SELECT * FROM leads WHERE state = '${stateCode}'`,
        raw_count: 0,
        real_count: 0,
        synthetic_count: 0,
        validated_count: 0,
        mismatch_count: 0,
        by_source: {},
        by_stage: {},
        last_synced_at: null,
        duration_ms: 0,
        suspicious_empty: false,
        previous_count: null,
      };

      try {
        // Total count
        const { count: total, error: totalErr } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', stateCode);

        if (totalErr) {
          diag.request_status = 'error';
          diag.request_error = `${totalErr.message} [code: ${totalErr.code || 'unknown'}]`;
          diag.duration_ms = Date.now() - startTime;
          results.push(diag);
          continue;
        }

        diag.raw_count = total ?? 0;

        if (diag.raw_count === 0) {
          // Check for suspicious empty
          const { data: lastEvent } = await supabase
            .from('sync_events')
            .select('payload')
            .eq('operation_id', portfolio)
            .eq('operation_type', 'source_sync')
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (lastEvent?.payload) {
            const p = lastEvent.payload as Record<string, unknown>;
            const prev = (p.db_total as number) || (p.leads_imported as number) || 0;
            if (prev > 0) {
              diag.suspicious_empty = true;
              diag.previous_count = prev;
            }
          }

          diag.request_status = diag.raw_count === 0 ? 'no_data' : 'success';
          diag.duration_ms = Date.now() - startTime;
          results.push(diag);
          continue;
        }

        // Real count
        const { count: realCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', stateCode)
          .eq('is_synthetic', false);
        diag.real_count = realCount ?? 0;
        diag.synthetic_count = diag.raw_count - diag.real_count;

        // Validated count
        const { count: validatedCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', stateCode)
          .eq('addr_validated', true);
        diag.validated_count = validatedCount ?? 0;

        // Mismatch count
        const { count: mismatchCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('state', stateCode)
          .eq('addr_mismatch', true);
        diag.mismatch_count = mismatchCount ?? 0;

        // Source breakdown
        const { data: sourceRows } = await supabase
          .from('leads')
          .select('source')
          .eq('state', stateCode)
          .eq('is_synthetic', false);
        if (sourceRows) {
          for (const row of sourceRows as Array<{ source: string }>) {
            const src = row.source || 'Unknown';
            diag.by_source[src] = (diag.by_source[src] || 0) + 1;
          }
        }

        // Stage breakdown
        const { data: stageRows } = await supabase
          .from('leads')
          .select('stage')
          .eq('state', stateCode)
          .eq('is_synthetic', false);
        if (stageRows) {
          for (const row of stageRows as Array<{ stage: string }>) {
            const stage = row.stage || 'Unknown';
            diag.by_stage[stage] = (diag.by_stage[stage] || 0) + 1;
          }
        }

        // Last synced
        const { data: syncCoverage } = await supabase
          .from('sync_source_coverage')
          .select('updated_at')
          .eq('portfolio', portfolio)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        diag.last_synced_at = syncCoverage?.updated_at || null;

        diag.request_status = 'success';
      } catch (err) {
        diag.request_status = 'error';
        diag.request_error = err instanceof Error ? err.message : 'Unknown error';
      }

      diag.duration_ms = Date.now() - startTime;
      results.push(diag);
    }

    setDiagnostics(results);
    setLastRun(new Date().toISOString());

    // Load recent sync events
    const { data: events } = await supabase
      .from('sync_events')
      .select('id, operation_id, status, created_at, payload')
      .eq('operation_type', 'source_sync')
      .order('created_at', { ascending: false })
      .limit(22);
    setRecentEvents((events || []) as SyncEvent[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { runDiagnostics(); }, [runDiagnostics]);

  const filtered = diagnostics.filter((d) =>
    searchFilter === '' ||
    d.portfolio.toLowerCase().includes(searchFilter.toLowerCase()) ||
    d.state_code.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const totalReal = diagnostics.reduce((s, d) => s + d.real_count, 0);
  const totalRaw = diagnostics.reduce((s, d) => s + d.raw_count, 0);
  const totalSynthetic = diagnostics.reduce((s, d) => s + d.synthetic_count, 0);
  const totalErrors = diagnostics.filter((d) => d.request_status === 'error').length;
  const totalSuspicious = diagnostics.filter((d) => d.suspicious_empty).length;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Activity size={20} className="text-primary" />
              Sync Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Per-portfolio pipeline diagnostics — request status, raw/real/synthetic/validated/mismatch counts, source and stage breakdowns
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/data-sync"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
            >
              <Database size={13} />
              Data Sync
            </a>
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Running…' : 'Re-run Diagnostics'}
            </button>
          </div>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
          <Info size={13} className="shrink-0 mt-0.5 text-blue-600" />
          <span>
            This view queries the <code className="bg-blue-100 px-1 rounded">leads</code> table directly per portfolio/state.
            No API keys, secrets, or credentials are exposed. Counts reflect the actual database state at the time of the query.
          </span>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total in DB', value: totalRaw.toLocaleString(), color: 'text-foreground', bg: 'bg-muted/50', icon: Database },
            { label: 'Real Leads', value: totalReal.toLocaleString(), color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
            { label: 'Synthetic', value: totalSynthetic.toLocaleString(), color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle },
            { label: 'Query Errors', value: totalErrors, color: totalErrors > 0 ? 'text-red-600' : 'text-muted-foreground', bg: totalErrors > 0 ? 'bg-red-50' : 'bg-muted/50', icon: XCircle },
            { label: 'Suspicious Empty', value: totalSuspicious, color: totalSuspicious > 0 ? 'text-amber-600' : 'text-muted-foreground', bg: totalSuspicious > 0 ? 'bg-amber-50' : 'bg-muted/50', icon: ShieldAlert },
          ].map(({ label, value, color, bg, icon: IconComp }) => {
            const IconEl = IconComp as React.ElementType;
            return (
              <div key={label} className={`border border-border rounded-xl p-3 flex items-center gap-3 ${bg}`}>
                <IconEl size={16} className={`${color} shrink-0`} />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Last run */}
        {lastRun && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock size={11} />
            Last diagnostic run: {new Date(lastRun).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by portfolio or state code…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Diagnostic rows */}
        {loading ? (
          <div className="space-y-2">
            {ALL_PORTFOLIOS.map((p) => (
              <div key={p} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">
                Per-Portfolio Pipeline Diagnostics
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({filtered.length} portfolio{filtered.length !== 1 ? 's' : ''})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">Click any row to expand details</p>
            </div>

            {/* Column headers */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 rounded-lg">
              <span className="min-w-[160px]">Portfolio</span>
              <span className="w-10">State</span>
              <span className="w-16">Status</span>
              <span className="ml-auto flex gap-4">
                <span className="w-16 text-right">Raw</span>
                <span className="w-16 text-right">Real</span>
                <span className="w-20 text-right">Synthetic</span>
                <span className="w-20 text-right">Validated</span>
                <span className="w-16 text-right">Mismatch</span>
                <span className="w-16 text-right">Duration</span>
              </span>
            </div>

            {filtered.map((diag) => (
              <DiagnosticRow key={diag.portfolio} diag={diag} />
            ))}
          </div>
        )}

        {/* Recent sync events */}
        {recentEvents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart2 size={14} className="text-primary" />
              Recent Sync Events
            </h2>
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {recentEvents.slice(0, 11).map((event) => {
                  const payload = event.payload || {};
                  const isSuccess = event.status === 'success';
                  return (
                    <div key={event.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                      {isSuccess
                        ? <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                        : <XCircle size={12} className="text-red-500 shrink-0" />}
                      <span className="font-medium text-foreground min-w-[160px]">
                        {event.operation_id?.replace(' Portfolio', '') || '—'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${isSuccess ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {event.status}
                      </span>
                      <div className="flex items-center gap-3 text-muted-foreground ml-2">
                        {payload.db_total !== undefined && (
                          <span>DB: <strong className="text-foreground">{payload.db_total?.toLocaleString()}</strong></span>
                        )}
                        {payload.db_real !== undefined && (
                          <span>Real: <strong className="text-green-600">{payload.db_real?.toLocaleString()}</strong></span>
                        )}
                        {payload.error_count !== undefined && payload.error_count > 0 && (
                          <span className="text-red-500">Errors: <strong>{payload.error_count}</strong></span>
                        )}
                      </div>
                      <span className="ml-auto text-muted-foreground">
                        {new Date(event.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
