'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, Wallet, Zap } from 'lucide-react';
import {
  buttonPrimary,
  buttonSecondary,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
} from '@/components/ops';

type TabKey = 'overview' | 'providers' | 'logs';
type LogFilter = 'all' | 'stage1' | 'stage2' | 'stage3';

interface SummaryRow {
  provider: string;
  stage: string;
  total_cost: number;
  total_calls: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  last_called_at: string | null;
}

interface RecentLog {
  id: string;
  lead_id: string | null;
  provider: string;
  stage: string;
  cost: number | null;
  success: boolean | null;
  error_message: string | null;
  called_at: string;
}

interface SummaryPayload {
  checkedAt: string;
  totals: {
    loggedRows: number;
    providers: number;
    totalSpend: number;
    totalCalls: number;
    successes: number;
    failures: number;
    successRate: number;
    lastCalledAt: string | null;
  };
  summary: SummaryRow[];
  stageTotals: Record<string, {
    stage: string;
    total_cost: number;
    total_calls: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
  }>;
  recentLogs: RecentLog[];
}

interface AutoEnrichResult {
  enriched: number;
  skipped: number;
  errors: number;
  leads: Array<{ id: string; address: string; score: number; result: string }>;
}

const STAGE_LABELS: Record<string, string> = {
  stage1: 'Stage 1 · Owner lookup',
  stage2: 'Stage 2 · Contact enrichment',
  stage3: 'Stage 3 · Skip trace',
};

function toneForRate(rate: number): 'success' | 'warning' | 'danger' {
  return rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger';
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function relativeTime(value: string | null) {
  if (!value) return 'Never';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function EnrichmentCostsClient() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [autoEnriching, setAutoEnriching] = useState(false);
  const [autoEnrichError, setAutoEnrichError] = useState<string | null>(null);
  const [autoEnrichResult, setAutoEnrichResult] = useState<AutoEnrichResult | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/enrichment-costs/summary', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load enrichment cost summary');
      setData(json);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load enrichment cost summary');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAutoEnrich = useCallback(async () => {
    setAutoEnriching(true);
    setAutoEnrichError(null);
    setAutoEnrichResult(null);
    try {
      const res = await fetch('/api/enrichment/pdl-auto-enrich', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Auto-enrich failed');
      setAutoEnrichResult(json as AutoEnrichResult);
      await load();
    } catch (runError) {
      setAutoEnrichError(runError instanceof Error ? runError.message : 'Auto-enrich failed');
    } finally {
      setAutoEnriching(false);
    }
  }, [load]);

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    return logFilter === 'all' ? data.recentLogs : data.recentLogs.filter((log) => log.stage === logFilter);
  }, [data, logFilter]);

  const stats = data ? [
    {
      label: 'Logged calls',
      value: data.totals.loggedRows.toLocaleString(),
      hint: data.totals.lastCalledAt ? `Last call ${relativeTime(data.totals.lastCalledAt)}` : 'No API calls logged yet',
      icon: Database,
      tone: 'default' as const,
    },
    {
      label: 'Total spend',
      value: formatCurrency(data.totals.totalSpend),
      hint: `${data.totals.providers} providers with logged activity`,
      icon: Wallet,
      tone: 'primary' as const,
    },
    {
      label: 'Success rate',
      value: formatPercent(data.totals.successRate),
      hint: `${data.totals.successes} success · ${data.totals.failures} failure`,
      icon: CheckCircle2,
      tone: toneForRate(data.totals.successRate),
    },
    {
      label: 'Recent feed',
      value: data.recentLogs.length.toLocaleString(),
      hint: 'Latest 100 rows shown below; summary scans the full table',
      icon: Clock3,
      tone: 'default' as const,
    },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Enrichment Cost Tracking"
        description="Real spend and success metrics from enrichment_api_logs with honest empty states when nothing has been logged yet."
        actions={(
          <>
            <button type="button" onClick={() => { void load(); }} disabled={refreshing} className={buttonSecondary}>
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button type="button" onClick={() => { void handleAutoEnrich(); }} disabled={autoEnriching} className={buttonPrimary}>
              <Zap size={16} className={autoEnriching ? 'animate-pulse' : ''} />
              {autoEnriching ? 'Running…' : 'Auto-enrich 70+ leads'}
            </button>
          </>
        )}
      />

      {error && <ErrorBanner message={error} onRetry={() => { void load(); }} />}
      {autoEnrichError && <ErrorBanner message={autoEnrichError} onRetry={() => { void handleAutoEnrich(); }} />}

      {loading ? (
        <LoadingState label="Loading enrichment cost data…" />
      ) : !data ? (
        <EmptyState icon={AlertTriangle} title="No summary available" hint="The enrichment summary query did not return data." />
      ) : (
        <>
          <StatGrid stats={stats} columns={4} />

          {autoEnrichResult && (
            <Panel title="Latest auto-enrich run" icon={Zap}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Enriched</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{autoEnrichResult.enriched}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Skipped</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{autoEnrichResult.skipped}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Errors</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{autoEnrichResult.errors}</div>
                </div>
              </div>
              {autoEnrichResult.leads.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3">Lead</th>
                        <th className="py-2 pr-3">Score</th>
                        <th className="py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {autoEnrichResult.leads.map((lead) => (
                        <tr key={lead.id}>
                          <td className="py-2 pr-3 text-foreground">{lead.address}</td>
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">{lead.score}</td>
                          <td className="py-2 text-muted-foreground">{lead.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              tabs={[
                { key: 'overview', label: 'Overview', icon: Activity },
                { key: 'providers', label: 'Providers', icon: Database },
                { key: 'logs', label: 'Recent logs', icon: Clock3 },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className="text-xs text-muted-foreground">Checked {formatDateTime(data.checkedAt)}</div>
          </div>

          {tab === 'overview' && (
            <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <Panel title="Stage snapshots" icon={Activity}>
                <div className="grid gap-3 md:grid-cols-3">
                  {(['stage1', 'stage2', 'stage3'] as const).map((stage) => {
                    const total = data.stageTotals[stage];
                    return (
                      <div key={stage} className="rounded-2xl border border-border bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</p>
                            <p className="text-xs text-muted-foreground">{total.total_calls} logged call{total.total_calls === 1 ? '' : 's'}</p>
                          </div>
                          <StatusPill tone={toneForRate(total.success_rate)}>{formatPercent(total.success_rate)}</StatusPill>
                        </div>
                        <dl className="mt-4 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Spend</dt>
                            <dd className="font-semibold tabular-nums text-foreground">{formatCurrency(total.total_cost)}</dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Successes</dt>
                            <dd className="font-semibold tabular-nums text-foreground">{total.success_count}</dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Failures</dt>
                            <dd className="font-semibold tabular-nums text-foreground">{total.failure_count}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Notes" icon={AlertTriangle}>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    The provider summary scans the full <code className="rounded bg-muted px-1 py-0.5 text-foreground">enrichment_api_logs</code> table with pagination, so totals stay correct even past Supabase’s 1,000-row response cap.
                  </p>
                  <p>
                    The table below shows only the latest 100 log rows for inspection. If the database has no logged calls yet, this page now says so explicitly instead of showing fabricated ROI.
                  </p>
                  <p>
                    Shared enrichment routes now persist <code className="rounded bg-muted px-1 py-0.5 text-foreground">error_message</code> when a call fails, so failed rows on this page have actionable context.
                  </p>
                </div>
              </Panel>
            </div>
          )}

          {tab === 'providers' && (
            <Panel title="Provider breakdown" icon={Database} padded={false}>
              {data.summary.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Database} title="No enrichment calls logged" hint="This page is wired to the live enrichment_api_logs table. Once calls are logged, provider totals will appear here." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Stage</th>
                        <th className="px-4 py-3 text-right">Calls</th>
                        <th className="px-4 py-3 text-right">Spend</th>
                        <th className="px-4 py-3 text-right">Success</th>
                        <th className="px-4 py-3 text-right">Failures</th>
                        <th className="px-4 py-3 text-right">Last call</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.summary.map((row) => (
                        <tr key={`${row.provider}-${row.stage}`} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium text-foreground">{row.provider}</td>
                          <td className="px-4 py-3 text-muted-foreground">{STAGE_LABELS[row.stage] || row.stage}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.total_calls}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(row.total_cost)}</td>
                          <td className="px-4 py-3 text-right"><StatusPill tone={toneForRate(row.success_rate)}>{formatPercent(row.success_rate)}</StatusPill></td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.failure_count}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatDateTime(row.last_called_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {tab === 'logs' && (
            <Panel
              title="Recent API log rows"
              icon={Clock3}
              actions={(
                <div className="flex flex-wrap gap-2">
                  {(['all', 'stage1', 'stage2', 'stage3'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLogFilter(value)}
                      className={logFilter === value ? buttonPrimary : buttonSecondary}
                    >
                      {value === 'all' ? 'All stages' : STAGE_LABELS[value]}
                    </button>
                  ))}
                </div>
              )}
              padded={false}
            >
              {filteredLogs.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Clock3} title="No recent log rows" hint="The live table currently has no matching rows for this filter." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Stage</th>
                        <th className="px-4 py-3 text-right">Cost</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(log.called_at)}</td>
                          <td className="px-4 py-3 text-foreground">{log.provider}</td>
                          <td className="px-4 py-3 text-muted-foreground">{STAGE_LABELS[log.stage] || log.stage}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(Number(log.cost || 0))}</td>
                          <td className="px-4 py-3">
                            <StatusPill tone={log.success ? 'success' : 'danger'}>
                              {log.success ? 'Success' : 'Failed'}
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{log.error_message || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
