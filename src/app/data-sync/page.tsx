'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Play, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp, Database, Zap, ExternalLink, BarChart2, AlertTriangle, Radio, Info, ShieldAlert, Activity } from 'lucide-react';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';


// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncSourceRow {
  id: string;
  portfolio: string;
  zone: string;
  source_name: string;
  sync_url: string;
  status: string;
  feasibility_note: string | null;
  updated_at: string | null;
}

interface SyncDetail {
  portfolio: string;
  zone: string;
  source: string;
  url: string;
  imported: number;
  duplicates: number;
  errors: string[];
  leads_inserted: number;
}

interface PortfolioSummary {
  portfolio: string;
  total_imported: number;
  total_duplicates: number;
  total_inserted: number;
  errors: string[];
  sources_run: number;
  details: SyncDetail[];
  // Real DB diagnostic fields
  db_total: number;
  db_real: number;
  db_synthetic: number;
  db_validated: number;
  db_mismatch: number;
  db_by_source: Record<string, number>;
  db_by_stage: Record<string, number>;
  db_error: string | null;
  previous_count: number | null;
  suspicious_empty: boolean;
}

interface SyncRunResult {
  success: boolean;
  sync_mode: string;
  sync_mode_description: string;
  total_urls_executed: number;
  total_leads_imported: number;
  total_duplicates_removed: number;
  total_leads_inserted: number;
  total_errors: number;
  insert_error: string | null;
  insert_errors: string[];
  processing_errors: string[];
  portfolios: PortfolioSummary[];
  ran_at: string;
  duration_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  Trulia: 'bg-green-100 text-green-700 border-green-200',
  Dwellsy: 'bg-teal-100 text-teal-700 border-teal-200',
  'Rent.com': 'bg-blue-100 text-blue-700 border-blue-200',
  'Realtor.com': 'bg-red-100 text-red-700 border-red-200',
  PadMapper: 'bg-purple-100 text-purple-700 border-purple-200',
  'Apartment List': 'bg-orange-100 text-orange-700 border-orange-200',
  Zillow: 'bg-sky-100 text-sky-700 border-sky-200',
  HotPads: 'bg-pink-100 text-pink-700 border-pink-200',
  Craigslist: 'bg-violet-100 text-violet-700 border-violet-200',
};

function sourceColor(name: string) {
  return SOURCE_COLORS[name] || 'bg-gray-100 text-gray-700 border-gray-200';
}

function portfolioColor(name: string) {
  const map: Record<string, string> = {
    'Colorado Portfolio': 'text-blue-600 bg-blue-50 border-blue-200',
    'California Portfolio': 'text-orange-600 bg-orange-50 border-orange-200',
    'Nevada Portfolio': 'text-purple-600 bg-purple-50 border-purple-200',
    'Washington Portfolio': 'text-green-600 bg-green-50 border-green-200',
    'Texas Portfolio': 'text-yellow-700 bg-yellow-50 border-yellow-200',
    'Florida Portfolio': 'text-cyan-600 bg-cyan-50 border-cyan-200',
    'Utah Portfolio': 'text-red-600 bg-red-50 border-red-200',
    'Maine Portfolio': 'text-teal-600 bg-teal-50 border-teal-200',
    'Oregon Portfolio': 'text-emerald-600 bg-emerald-50 border-emerald-200',
    'Massachusetts Portfolio': 'text-indigo-600 bg-indigo-50 border-indigo-200',
    'Maryland Portfolio': 'text-rose-600 bg-rose-50 border-rose-200',
    // Legacy short names
    Colorado: 'text-blue-600 bg-blue-50 border-blue-200',
    California: 'text-orange-600 bg-orange-50 border-orange-200',
    Nevada: 'text-purple-600 bg-purple-50 border-purple-200',
    Washington: 'text-green-600 bg-green-50 border-green-200',
    Texas: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    Florida: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    Utah: 'text-red-600 bg-red-50 border-red-200',
    Maine: 'text-teal-600 bg-teal-50 border-teal-200',
    Oregon: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    Massachusetts: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  };
  return map[name] || 'text-gray-600 bg-gray-50 border-gray-200';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ─── Suspicious Empty Warning ─────────────────────────────────────────────────

function SuspiciousEmptyWarning({ portfolio, previousCount }: { portfolio: string; previousCount: number }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
      <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800">⚠ Suspicious Empty Result — Data Preserved</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Previous sync contained <strong>{previousCount.toLocaleString()}</strong> records for {portfolio}, but the current
          database query returned 0. Existing data has been preserved. This may indicate an RLS policy issue,
          state code mismatch, or all leads being marked synthetic.
        </p>
      </div>
    </div>
  );
}

// ─── Portfolio Result Card ────────────────────────────────────────────────────

function PortfolioResultCard({
  summary,
  defaultOpen,
  timestamp,
}: {
  summary: PortfolioSummary;
  defaultOpen: boolean;
  timestamp: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const errors = summary.errors ?? [];
  const hasErrors = errors.filter((e) => !e.startsWith('Address validation')).length > 0;
  const hasWarnings = errors.filter((e) => e.startsWith('Address validation')).length > 0;
  const hasSuspicious = summary.suspicious_empty;

  const statusColor = hasSuspicious || hasErrors
    ? 'border-amber-300'
    : summary.db_real > 0
    ? 'border-green-200' :'border-border';

  const statusBg = hasSuspicious || hasErrors
    ? 'bg-amber-50/30'
    : summary.db_real > 0
    ? 'bg-green-50/20' :'';

  return (
    <div className={`border rounded-xl overflow-hidden ${statusColor}`}>
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${statusBg} hover:bg-muted/40 transition-colors bg-card`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${portfolioColor(summary.portfolio)}`}>
            {summary.portfolio.replace(' Portfolio', '')}
          </span>
          <div className="flex items-center gap-2 text-xs">
            {hasSuspicious ? (
              <span className="flex items-center gap-1 text-amber-600 font-semibold">
                <ShieldAlert size={11} />
                Suspicious empty
              </span>
            ) : hasErrors ? (
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <XCircle size={11} />
                {errors.length} error{errors.length !== 1 ? 's' : ''}
              </span>
            ) : summary.db_real > 0 ? (
              <span className="flex items-center gap-1 text-green-600 font-semibold">
                <CheckCircle2 size={11} />
                {summary.db_real.toLocaleString()} real leads
              </span>
            ) : (
              <span className="text-muted-foreground">0 leads in DB</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-3">
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span>Total: <strong className="text-foreground">{summary.db_total.toLocaleString()}</strong></span>
            <span>Real: <strong className="text-green-600">{summary.db_real.toLocaleString()}</strong></span>
            <span>Synthetic: <strong className="text-amber-600">{summary.db_synthetic.toLocaleString()}</strong></span>
            {summary.db_validated > 0 && (
              <span>Validated: <strong className="text-blue-600">{summary.db_validated.toLocaleString()}</strong></span>
            )}
          </div>
          {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Detail */}
      {open && (
        <div className="divide-y divide-border bg-muted/10">
          {/* DB Stats Grid */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Database Counts</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Total in DB', value: summary.db_total, color: 'text-foreground' },
                { label: 'Real Leads', value: summary.db_real, color: 'text-green-600' },
                { label: 'Synthetic / Excluded', value: summary.db_synthetic, color: 'text-amber-600' },
                { label: 'Addr Validated', value: summary.db_validated, color: 'text-blue-600' },
                { label: 'Addr Mismatch', value: summary.db_mismatch, color: 'text-red-500' },
                { label: 'Sources Configured', value: summary.sources_run, color: 'text-purple-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background border border-border rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={`text-base font-bold ${color}`}>{value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Suspicious empty warning */}
          {hasSuspicious && summary.previous_count !== null && (
            <div className="px-4 py-3">
              <SuspiciousEmptyWarning portfolio={summary.portfolio} previousCount={summary.previous_count} />
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {hasErrors ? 'Errors & Warnings' : 'Warnings'}
              </p>
              {errors.map((err, i) => {
                const isWarning = err.startsWith('Address validation') || err.startsWith('⚠');
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 font-mono break-all ${
                      isWarning
                        ? 'bg-amber-50 border border-amber-200 text-amber-800' :'bg-red-50 border border-red-200 text-red-800'
                    }`}
                  >
                    {isWarning ? <AlertTriangle size={10} className="mt-0.5 shrink-0" /> : <XCircle size={10} className="mt-0.5 shrink-0" />}
                    <span>{err}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Source URL list */}
          {summary.details.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Configured Sources</p>
              <div className="space-y-1">
                {summary.details.slice(0, 8).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${sourceColor(d.source)}`}>
                      {d.source}
                    </span>
                    <span className="text-muted-foreground shrink-0">{d.zone}</span>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5 truncate text-[10px]"
                      title={d.url}
                    >
                      <ExternalLink size={8} className="shrink-0" />
                      <span className="truncate">{d.url.replace(/^https?:\/\//, '').substring(0, 50)}</span>
                    </a>
                  </div>
                ))}
                {summary.details.length > 8 && (
                  <p className="text-[10px] text-muted-foreground">+{summary.details.length - 8} more sources configured</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataSyncPage() {
  const supabase = createClient();
  const [sources, setSources] = useState<SyncSourceRow[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('all');

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    const { data } = await supabase
      .from('sync_source_coverage')
      .select('id, portfolio, zone, source_name, sync_url, status, feasibility_note, updated_at')
      .eq('status', 'active')
      .not('sync_url', 'is', null)
      .order('portfolio')
      .order('zone');
    setSources((data as SyncSourceRow[]) || []);
    setLoadingSources(false);
  }, [supabase]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleRunSync = async () => {
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const res = await fetch('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: selectedPortfolio === 'all' ? null : selectedPortfolio,
          diagnostic: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setRunError(data.error || 'Sync failed');
      } else {
        setResult(data as SyncRunResult);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRunning(false);
    }
  };

  // Group sources by portfolio for the pre-run table
  const groupedSources = sources.reduce<Record<string, SyncSourceRow[]>>((acc, s) => {
    if (!acc[s.portfolio]) acc[s.portfolio] = [];
    acc[s.portfolio].push(s);
    return acc;
  }, {});

  const filteredGrouped = selectedPortfolio === 'all'
    ? groupedSources
    : { [selectedPortfolio]: groupedSources[selectedPortfolio] || [] };

  const totalActiveUrls = sources.length;
  const portfolioCount = Object.keys(groupedSources).length;
  const sourceNames = [...new Set(sources.map((s) => s.source_name))];

  const resultTotalErrors = result
    ? (result.portfolios ?? []).reduce((s, p) => s + (p.errors ?? []).filter((e) => !e.startsWith('Address validation')).length, 0)
    : 0;

  const resultTotalReal = result
    ? (result.portfolios ?? []).reduce((s, p) => s + (p.db_real ?? 0), 0)
    : 0;

  const resultTotalSuspicious = result
    ? (result.portfolios ?? []).filter((p) => p.suspicious_empty).length
    : 0;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Radio size={20} className="text-primary" />
              Data Source Sync
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real database audit — queries actual leads per portfolio and surfaces accurate counts, errors, and address validation results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/sync-diagnostics"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
            >
              <Activity size={13} />
              Diagnostics
            </a>
            <button
              onClick={fetchSources}
              disabled={loadingSources}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
            >
              <RefreshCw size={13} className={loadingSources ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Info banner — explain what the sync does */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
          <Info size={14} className="shrink-0 mt-0.5 text-blue-600" />
          <div>
            <strong>Real Data Sync:</strong> This sync queries the actual <code className="bg-blue-100 px-1 rounded">leads</code> table
            in the database and reports accurate counts per portfolio. It does not generate synthetic data.
            &ldquo;Real leads&rdquo; = non-synthetic records available to agents.
            &ldquo;Synthetic / Excluded&rdquo; = records flagged <code className="bg-blue-100 px-1 rounded">is_synthetic=true</code> and hidden from agents.
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active URLs', value: totalActiveUrls, icon: Database, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Portfolios', value: portfolioCount, icon: BarChart2, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Sources', value: sourceNames.length, icon: Radio, color: 'text-purple-500', bg: 'bg-purple-50' },
            {
              label: result
                ? resultTotalErrors > 0
                  ? 'Errors (Last Run)'
                  : resultTotalSuspicious > 0
                  ? 'Suspicious Portfolios' :'Real Leads (DB)' :'Ready to Run',
              value: result
                ? resultTotalErrors > 0
                  ? resultTotalErrors
                  : resultTotalSuspicious > 0
                  ? resultTotalSuspicious
                  : resultTotalReal.toLocaleString()
                : '—',
              icon: result
                ? resultTotalErrors > 0
                  ? AlertTriangle
                  : resultTotalSuspicious > 0
                  ? ShieldAlert
                  : CheckCircle2
                : Zap,
              color: result
                ? resultTotalErrors > 0
                  ? 'text-red-500'
                  : resultTotalSuspicious > 0
                  ? 'text-amber-500' :'text-success' :'text-amber-500',
              bg: result
                ? resultTotalErrors > 0
                  ? 'bg-red-50'
                  : resultTotalSuspicious > 0
                  ? 'bg-amber-50' :'bg-success/10' :'bg-amber-50',
            },
          ].map(({ label, value, icon: IconComp, color, bg }) => {
            const IconEl = IconComp as React.ElementType;
            return (
              <div key={label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <IconEl size={16} className={color} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold text-foreground">{value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Portfolio Filter
            </label>
            <select
              value={selectedPortfolio}
              onChange={(e) => setSelectedPortfolio(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Portfolios ({portfolioCount})</option>
              {PORTFOLIOS.filter((p) => p.key !== 'all').map((p) => (
                <option key={p.key} value={p.label}>
                  {p.label} — {p.cities}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleRunSync}
              disabled={running || loadingSources}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {running ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Auditing DB…
                </>
              ) : (
                <>
                  <Play size={14} />
                  Run Sync Audit
                </>
              )}
            </button>
          </div>
        </div>

        {/* Run error */}
        {runError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Sync failed</p>
              <p className="text-xs mt-0.5 font-mono">{runError}</p>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className={`border rounded-xl p-4 ${
              resultTotalErrors > 0
                ? 'bg-red-50/50 border-red-200'
                : resultTotalSuspicious > 0
                ? 'bg-amber-50/50 border-amber-200' :'bg-green-50/50 border-green-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  {resultTotalErrors > 0 ? (
                    <XCircle size={18} className="text-red-600" />
                  ) : resultTotalSuspicious > 0 ? (
                    <ShieldAlert size={18} className="text-amber-600" />
                  ) : (
                    <CheckCircle2 size={18} className="text-green-600" />
                  )}
                  <span className={`font-semibold text-sm ${
                    resultTotalErrors > 0 ? 'text-red-700' : resultTotalSuspicious > 0 ? 'text-amber-700' : 'text-green-700'
                  }`}>
                    {resultTotalErrors > 0
                      ? `Sync audit completed with ${resultTotalErrors} error${resultTotalErrors !== 1 ? 's' : ''}`
                      : resultTotalSuspicious > 0
                      ? `Sync audit complete — ${resultTotalSuspicious} portfolio${resultTotalSuspicious !== 1 ? 's' : ''} returned suspicious empty results`
                      : `Sync audit complete at ${formatTime(result.ran_at)}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    <span className="font-bold text-foreground">{result.total_leads_imported.toLocaleString()}</span>{' '}
                    <span className="text-muted-foreground">total in DB</span>
                  </span>
                  <span>
                    <span className="font-bold text-green-600">{resultTotalReal.toLocaleString()}</span>{' '}
                    <span className="text-muted-foreground">real leads</span>
                  </span>
                  <span>
                    <span className="font-bold text-amber-600">{result.total_duplicates_removed.toLocaleString()}</span>{' '}
                    <span className="text-muted-foreground">synthetic/excluded</span>
                  </span>
                  {result.duration_ms && (
                    <span>
                      <span className="font-bold text-foreground">{formatDuration(result.duration_ms)}</span>{' '}
                      <span className="text-muted-foreground">duration</span>
                    </span>
                  )}
                </div>
              </div>
              {result.sync_mode_description && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Info size={11} />
                  {result.sync_mode_description}
                </p>
              )}
            </div>

            {/* Per-portfolio result cards */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Per-Portfolio Results</h2>
              {(result.portfolios ?? []).map((summary, i) => (
                <PortfolioResultCard
                  key={summary.portfolio}
                  summary={summary}
                  defaultOpen={i === 0}
                  timestamp={result.ran_at}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── PRE-RUN: Configured URLs table ── */}
        {!result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Configured Sync URLs
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({totalActiveUrls} active across {portfolioCount} portfolios)
                </span>
              </h2>
            </div>

            {loadingSources ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted/40 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(filteredGrouped).map(([portfolio, rows]) => {
                  return (
                    <div key={portfolio} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-card">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${portfolioColor(portfolio)}`}>
                            {portfolio.replace(' Portfolio', '')}
                          </span>
                          <span className="text-sm text-muted-foreground">{rows.length} URL{rows.length !== 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {[...new Set(rows.map((r) => r.source_name))].join(' · ')}
                        </span>
                      </div>
                      <div className="divide-y divide-border bg-muted/10">
                        {rows.slice(0, 5).map((row) => (
                          <div key={row.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${sourceColor(row.source_name)}`}>
                                {row.source_name}
                              </span>
                              <span className="text-xs text-muted-foreground font-medium shrink-0">{row.zone}</span>
                              <a
                                href={row.sync_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-primary hover:underline flex items-center gap-0.5 truncate"
                                title={row.sync_url}
                              >
                                <ExternalLink size={9} className="shrink-0" />
                                <span className="truncate">{row.sync_url}</span>
                              </a>
                            </div>
                            <span className="flex items-center gap-1 text-[10px] text-success bg-success/10 border border-success/20 px-1.5 py-0.5 rounded shrink-0">
                              <CheckCircle2 size={9} />
                              Active
                            </span>
                          </div>
                        ))}
                        {rows.length > 5 && (
                          <div className="px-4 py-2 text-xs text-muted-foreground">
                            +{rows.length - 5} more URLs configured
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
