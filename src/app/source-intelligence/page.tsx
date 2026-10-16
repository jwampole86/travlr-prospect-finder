'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, PieChart, RefreshCw, Search, Shield, TrendingUp } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  buttonPrimary,
  EmptyState,
  ErrorBanner,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  StatGrid,
  StatusPill,
} from '@/components/ops';

interface SourceRow {
  source: string;
  totalLeads: number;
  sharePct: number;
  qualityLeads: number;
  qualityPct: number;
  convertedLeads: number;
  conversionPct: number;
  fullyVerifiedLeads: number;
  verifiedPct: number;
  liveLeads: number;
  livePct: number;
}

interface SummaryPayload {
  checkedAt: string;
  definitions: {
    qualityThreshold: number;
    conversionStages: string[];
    liveStages: string[];
  };
  totals: {
    totalLeads: number;
    activeSources: number;
    qualityLeads: number;
    qualityPct: number;
    convertedLeads: number;
    conversionPct: number;
    verifiedLeads: number;
    verifiedPct: number;
    liveLeads: number;
    livePct: number;
  };
  sources: SourceRow[];
}

function Bar({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-foreground">{value.toFixed(1)}%</span>
    </div>
  );
}

export default function SourceIntelligencePage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/source-intelligence/summary', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load source intelligence');
      setSummary(json);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load source intelligence');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (summary?.sources || []).filter((row) => !term || row.source.toLowerCase().includes(term));
  }, [query, summary]);

  const topShare = summary?.sources[0] || null;
  const topQuality = summary?.sources.reduce<SourceRow | null>((best, row) => (!best || row.qualityPct > best.qualityPct ? row : best), null) || null;
  const topConversion = summary?.sources.reduce<SourceRow | null>((best, row) => (!best || row.conversionPct > best.conversionPct ? row : best), null) || null;

  const stats = summary ? [
    { label: 'Tracked leads', value: summary.totals.totalLeads.toLocaleString(), hint: 'Real non-synthetic rows in leads', icon: Activity, tone: 'default' as const },
    { label: 'Active sources', value: summary.totals.activeSources.toLocaleString(), hint: 'Distinct values currently present in leads.source', icon: PieChart, tone: 'primary' as const },
    { label: 'Quality share', value: `${summary.totals.qualityPct.toFixed(1)}%`, hint: `${summary.totals.qualityLeads.toLocaleString()} leads scored ${summary.definitions.qualityThreshold}+`, icon: CheckCircle2, tone: summary.totals.qualityPct > 25 ? 'success' as const : 'warning' as const },
    { label: 'Progressed leads', value: `${summary.totals.conversionPct.toFixed(1)}%`, hint: `${summary.totals.convertedLeads.toLocaleString()} leads moved beyond intake`, icon: TrendingUp, tone: summary.totals.convertedLeads > 0 ? 'success' as const : 'default' as const },
  ] : [];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <PageHeader
          icon={Shield}
          title="Source Intelligence"
          description="Share, quality, verification, and conversion metrics computed from real count queries on leads.source."
          actions={(
            <button type="button" onClick={() => { void load(); }} disabled={refreshing} className={buttonPrimary}>
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => { void load(); }} />}

        {loading ? (
          <LoadingState label="Loading source intelligence…" />
        ) : !summary ? (
          <EmptyState icon={Shield} title="No source intelligence data" hint="The source summary route returned no data." />
        ) : (
          <>
            <StatGrid stats={stats} columns={4} />

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Leaders" icon={TrendingUp}>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Largest share</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold text-foreground">{topShare?.source || '—'}</span>
                      {topShare && <StatusPill tone="primary">{topShare.sharePct.toFixed(1)}%</StatusPill>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Highest quality rate</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold text-foreground">{topQuality?.source || '—'}</span>
                      {topQuality && <StatusPill tone="success">{topQuality.qualityPct.toFixed(1)}%</StatusPill>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Highest progression rate</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold text-foreground">{topConversion?.source || '—'}</span>
                      {topConversion && <StatusPill tone="warning">{topConversion.conversionPct.toFixed(1)}%</StatusPill>}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Metric definitions" icon={CheckCircle2}>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">Share</strong> uses each source’s row count divided by all non-synthetic leads.</p>
                  <p><strong className="text-foreground">Quality</strong> counts rows with <code className="rounded bg-muted px-1 py-0.5 text-foreground">prospect_score &gt;= {summary.definitions.qualityThreshold}</code>.</p>
                  <p><strong className="text-foreground">Conversion</strong> counts stages {summary.definitions.conversionStages.join(', ')}.</p>
                </div>
              </Panel>

              <Panel title="Reality check" icon={Shield}>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>This page no longer estimates cost-per-lead or dedup ratios from mock values.</p>
                  <p>Every number shown here comes from live count queries, so low conversion or verification rates are surfaced honestly.</p>
                  <p className="text-xs">Updated {new Date(summary.checkedAt).toLocaleString()}</p>
                </div>
              </Panel>
            </div>

            <Panel
              title="Source breakdown"
              icon={PieChart}
              actions={(
                <div className="relative w-full sm:w-72">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter sources…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              )}
              padded={false}
            >
              {filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Search} title="No sources matched" hint="Try a broader search term." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3 text-right">Leads</th>
                        <th className="px-4 py-3 min-w-[180px]">Share</th>
                        <th className="px-4 py-3 min-w-[180px]">Quality</th>
                        <th className="px-4 py-3 min-w-[180px]">Conversion</th>
                        <th className="px-4 py-3 text-right">Fully verified</th>
                        <th className="px-4 py-3 text-right">Live / contract</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((row) => (
                        <tr key={row.source} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{row.source}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{row.totalLeads.toLocaleString()}</td>
                          <td className="px-4 py-3"><Bar value={row.sharePct} colorClass="bg-sky-500" /></td>
                          <td className="px-4 py-3">
                            <Bar value={row.qualityPct} colorClass="bg-emerald-500" />
                            <div className="mt-1 text-[11px] text-muted-foreground">{row.qualityLeads.toLocaleString()} high-score leads</div>
                          </td>
                          <td className="px-4 py-3">
                            <Bar value={row.conversionPct} colorClass="bg-amber-500" />
                            <div className="mt-1 text-[11px] text-muted-foreground">{row.convertedLeads.toLocaleString()} progressed</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold tabular-nums text-foreground">{row.fullyVerifiedLeads.toLocaleString()}</div>
                            <div className="text-[11px] text-muted-foreground">{row.verifiedPct.toFixed(1)}%</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold tabular-nums text-foreground">{row.liveLeads.toLocaleString()}</div>
                            <div className="text-[11px] text-muted-foreground">{row.livePct.toFixed(1)}%</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </AppLayout>
  );
}
