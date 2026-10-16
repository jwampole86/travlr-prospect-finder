'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  BarChart3,
  Clock3,
  Download,
  LineChart as LineChartIcon,
  MailCheck,
  RefreshCw,
  Reply,
  TableProperties,
  Users,
} from 'lucide-react';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
} from '@/components/ops';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import BreakdownList from './components/BreakdownList';
import ReportFiltersPanel from './components/ReportFilters';
import {
  createDefaultReportFilters,
  type AdvancedReportPayload,
  type ReportFilters,
  type ReportOptions,
} from './reporting';

type ReportTab = 'overview' | 'outreach' | 'preview';

const DEFAULT_OPTIONS: ReportOptions = { sources: [], stages: [], agents: [] };

function buildQueryString(filters: ReportFilters, includeOptions = false) {
  const params = new URLSearchParams();
  params.set('dateRange', filters.dateRange);
  params.set('startDate', filters.startDate);
  params.set('endDate', filters.endDate);
  params.set('scoreMin', String(filters.scoreMin));
  params.set('scoreMax', String(filters.scoreMax));
  for (const source of filters.sources) params.append('sources', source);
  for (const stage of filters.stages) params.append('stages', stage);
  for (const agent of filters.agents) params.append('agents', agent);
  if (includeOptions) params.set('includeOptions', '1');
  return params.toString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdvancedReportsPage() {
  const [tab, setTab] = useState<ReportTab>('overview');
  const [filters, setFilters] = useState<ReportFilters>(() => createDefaultReportFilters());
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(() => createDefaultReportFilters());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_OPTIONS);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [report, setReport] = useState<AdvancedReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(filters) !== JSON.stringify(appliedFilters), [filters, appliedFilters]);

  const loadReport = useCallback(async (currentFilters: ReportFilters, includeOptions = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/advanced-reports/data?${buildQueryString(currentFilters, includeOptions)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load report');
      setReport(data as AdvancedReportPayload);
      if (data?.options) {
        setOptions(data.options as ReportOptions);
        setOptionsLoaded(true);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(appliedFilters, !optionsLoaded);
  }, [appliedFilters, loadReport, optionsLoaded]);

  const handleRunReport = useCallback(() => {
    setAppliedFilters({ ...filters, sources: [...filters.sources], stages: [...filters.stages], agents: [...filters.agents] });
  }, [filters]);

  const handleExport = useCallback(() => {
    const href = `/advanced-reports/export?${buildQueryString(appliedFilters)}`;
    const link = document.createElement('a');
    link.href = href;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [appliedFilters]);

  const handleReset = useCallback(() => {
    const next = createDefaultReportFilters();
    setFilters(next);
    setAppliedFilters(next);
  }, []);

  const summary = report?.summary;
  const previewRows = report?.previewRows || [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={BarChart3}
          title="Advanced Reports"
          description="Real lead and outreach reporting with paginated queries, live counts, and exports of the exact filtered dataset."
          actions={
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50" onClick={() => loadReport(appliedFilters, false)}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        <ReportFiltersPanel
          filters={filters}
          options={options}
          loading={loading}
          dirty={dirty}
          exportDisabled={!report || report.exportCount === 0}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onRun={handleRunReport}
          onReset={handleReset}
          onExport={handleExport}
        />

        {error && <ErrorBanner message={error} onRetry={() => loadReport(appliedFilters, false)} />}

        {loading && !report ? (
          <LoadingState label="Computing report from live lead and outreach data…" />
        ) : report && summary ? (
          <>
            <StatGrid
              columns={5}
              stats={[
                { label: 'Filtered leads', value: summary.totalLeads.toLocaleString(), hint: `Export rows: ${report.exportCount.toLocaleString()}`, icon: Users, tone: 'primary' },
                { label: 'Average score', value: summary.averageScore, hint: `Last lead: ${formatDateTime(summary.lastLeadAt)}`, icon: LineChartIcon, tone: 'success' },
                { label: 'Contacted leads', value: summary.contactedLeads.toLocaleString(), hint: 'Derived from lead outreach status and touch history', icon: MailCheck, tone: 'warning' },
                { label: 'SMS delivered', value: summary.smsDelivered.toLocaleString(), hint: `Reply rate: ${summary.replyRate}%`, icon: Reply, tone: 'primary' },
                { label: 'Closed revenue', value: formatMoney(summary.closedRevenue), hint: `Last outreach: ${formatDateTime(summary.lastOutreachAt)}`, icon: Clock3, tone: 'default' },
              ]}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                tabs={[
                  { key: 'overview', label: 'Overview', icon: BarChart3 },
                  { key: 'outreach', label: 'Outreach', icon: MailCheck },
                  { key: 'preview', label: 'Lead preview', icon: TableProperties },
                ]}
                value={tab}
                onChange={setTab}
              />
              <p className="text-xs text-muted-foreground">Sources used: {report.dataSources.join(', ')}</p>
            </div>

            {summary.totalLeads === 0 ? (
              <EmptyState icon={BarChart3} title="No leads match these filters" hint="Broaden the date range or clear one of the filters, then run the report again." />
            ) : (
              <>
                {tab === 'overview' && (
                  <div className="grid gap-6 xl:grid-cols-[1.65fr,1fr]">
                    <Panel title="Lead volume and score trend" icon={LineChartIcon}>
                      {report.trend.length === 0 ? (
                        <EmptyState icon={LineChartIcon} title="No trend data" hint="The current filters did not return enough rows to chart." />
                      ) : (
                        <div className="h-[320px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={report.trend}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                              <XAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                              <YAxis yAxisId="left" tick={{ fill: 'currentColor', fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'currentColor', fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                              <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)' }} />
                              <Bar yAxisId="left" dataKey="leads" name="Leads" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                              <Bar yAxisId="left" dataKey="contacted" name="Contacted" fill="rgba(59,130,246,0.35)" radius={[8, 8, 0, 0]} />
                              <Line yAxisId="right" type="monotone" dataKey="avgScore" name="Avg score" stroke="rgb(34 197 94)" strokeWidth={2.5} dot={false} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </Panel>

                    <div className="grid gap-6">
                      <Panel title="Stage mix" icon={BarChart3}>
                        <BreakdownList rows={report.breakdowns.stages} emptyHint="No stages were returned for the active filters." />
                      </Panel>
                      <Panel title="Source mix" icon={Download}>
                        <BreakdownList rows={report.breakdowns.sources} emptyHint="No source values were returned for the active filters." />
                      </Panel>
                    </div>

                    <Panel title="Assigned agent distribution" icon={Users} className="xl:col-span-1">
                      <BreakdownList rows={report.breakdowns.agents} emptyHint="No primary agent assignments are recorded for this slice." />
                    </Panel>
                    <Panel title="Lead outreach status" icon={MailCheck} className="xl:col-span-1">
                      <BreakdownList rows={report.breakdowns.outreachStatuses} emptyHint="No outreach status values are recorded yet." />
                    </Panel>
                  </div>
                )}

                {tab === 'outreach' && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Panel title="SMS status distribution" icon={MailCheck}>
                      <BreakdownList rows={report.breakdowns.smsStatuses} emptyHint="No SMS engagement rows matched the selected leads." />
                    </Panel>
                    <Panel title="Outreach readout" icon={Reply}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Touchpoints</p>
                          <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{summary.touchpoints.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Rows pulled from outreach_history for these leads.</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reply rate</p>
                          <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{summary.replyRate}%</p>
                          <p className="text-xs text-muted-foreground">Unique replying leads divided by delivered SMS messages.</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivered SMS</p>
                          <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{summary.smsDelivered.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Latest delivery state comes from sms_lead_engagement.</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Last outreach</p>
                          <p className="mt-1 text-base font-semibold text-foreground">{formatDateTime(summary.lastOutreachAt)}</p>
                          <p className="text-xs text-muted-foreground">Most recent outreach_history or sms_lead_engagement update.</p>
                        </div>
                      </div>
                    </Panel>
                  </div>
                )}

                {tab === 'preview' && (
                  <Panel title="Lead export preview" icon={TableProperties} padded={false}>
                    {previewRows.length === 0 ? (
                      <div className="p-4">
                        <EmptyState icon={TableProperties} title="No rows to preview" hint="Run the report with a broader filter set to preview export rows." />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-4 py-3">Lead</th>
                              <th className="px-4 py-3">Source / Stage</th>
                              <th className="px-4 py-3">Score</th>
                              <th className="px-4 py-3">Agent</th>
                              <th className="px-4 py-3">Touchpoints</th>
                              <th className="px-4 py-3">Latest activity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row) => (
                              <tr key={row.id} className="border-b border-border/60 align-top">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-foreground">{row.address}</div>
                                  <div className="text-xs text-muted-foreground">{row.city}, {row.state} · {formatDateTime(row.createdAt)}</div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  <div>{row.source}</div>
                                  <div className="text-xs">{row.stage}</div>
                                </td>
                                <td className="px-4 py-3 tabular-nums text-foreground">{row.prospectScore}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.primaryAgentName || 'Unassigned'}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  <div>{row.touchpoints}</div>
                                  <div className="text-xs">{row.smsStatus || 'No SMS status'}</div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  <div>{formatDateTime(row.lastTouchAt)}</div>
                                  <div className="text-xs">{row.replyIntent || 'No reply intent'}</div>
                                </td>
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
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
