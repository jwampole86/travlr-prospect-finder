'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, RefreshCw, Send, Users, Waypoints } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { ErrorBanner, LoadingState, PageHeader, Panel, SegmentedTabs, StatGrid, StatusPill, buttonPrimary, buttonSecondary } from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import FollowUpQueue from './components/FollowUpQueue';
import SequenceTable from './components/SequenceTable';
import TrendPanel from './components/TrendPanel';
import { getPerformanceMaxima, loadCadencePerformanceData, type CadencePerformanceData } from './lib';

type TabKey = 'overview' | 'sequences' | 'queue';

export default function CadencePerformancePage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CadencePerformanceData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadCadencePerformanceData(supabase);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cadence performance data.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    if (!data) return [];
    const templateCoverage = data.summary.totalSteps > 0
      ? Math.round((data.summary.readyTemplateSteps / data.summary.totalSteps) * 100)
      : 0;

    return [
      { label: 'Active sequences', value: `${data.summary.activeSequenceCount}/${data.summary.sequenceCount}`, hint: `${data.summary.totalSteps} configured steps`, icon: Waypoints, tone: 'primary' as const },
      { label: 'Enrollments', value: data.summary.enrollmentCount.toLocaleString(), hint: `${data.summary.activeEnrollmentCount} active · ${data.summary.completedEnrollmentCount} completed`, icon: Users, tone: 'default' as const },
      { label: 'Send log activity', value: data.summary.sendCount.toLocaleString(), hint: `${data.summary.deliveredSendCount} delivered · ${data.summary.failedSendCount} failed`, icon: Send, tone: data.summary.sendCount > 0 ? 'success' as const : 'warning' as const },
      { label: 'Template coverage', value: `${templateCoverage}%`, hint: `${data.summary.readyTemplateSteps}/${data.summary.totalSteps} step keys found`, icon: CheckCircle2, tone: templateCoverage === 100 ? 'success' as const : 'warning' as const },
      { label: 'Scheduled touches', value: data.summary.scheduledTouchCount.toLocaleString(), hint: `${data.summary.contactedWithoutNextTouchCount} contacted with no next touch`, icon: Activity, tone: data.summary.scheduledTouchCount > 0 ? 'success' as const : 'warning' as const },
      { label: 'Human queue', value: data.summary.humanOutreachCount.toLocaleString(), hint: `${data.followUpQueue.filter((lead) => !lead.assignedAgentId).length} unassigned follow-ups`, icon: AlertTriangle, tone: data.summary.humanOutreachCount > 0 ? 'warning' as const : 'default' as const },
    ];
  }, [data]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = ['Sequence', 'Active', 'Default', 'Steps', 'Enrollments', 'Active Enrollments', 'Completed', 'Escalated', 'Paused', 'Unsubscribed', 'Sends', 'Delivered', 'Failed', 'Skipped', 'Engagement %', 'Last Enrollment', 'Last Send'];
    const rows = data.sequences.map((sequence) => [
      sequence.name,
      sequence.isActive ? 'Yes' : 'No',
      sequence.isDefault ? 'Yes' : 'No',
      sequence.steps.length,
      sequence.totalEnrollments,
      sequence.activeEnrollments,
      sequence.completedEnrollments,
      sequence.escalatedEnrollments,
      sequence.pausedEnrollments,
      sequence.unsubscribedEnrollments,
      sequence.totalSends,
      sequence.deliveredSends,
      sequence.failedSends,
      sequence.skippedSends,
      sequence.engagementRate,
      sequence.lastEnrollmentAt ?? '',
      sequence.lastSendAt ?? '',
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cadence-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const exportPrintView = useCallback(() => {
    if (!data) return;
    const windowRef = window.open('', '_blank');
    if (!windowRef) return;

    const sequenceRows = data.sequences.map((sequence) => `
      <tr>
        <td>${escapeHtml(sequence.name)}</td>
        <td>${sequence.steps.length}</td>
        <td>${sequence.totalEnrollments}</td>
        <td>${sequence.totalSends}</td>
        <td>${sequence.engagementRate}%</td>
      </tr>
    `).join('');

    const queueRows = data.followUpQueue.map((lead) => `
      <tr>
        <td>${escapeHtml(lead.name)}</td>
        <td>${escapeHtml(lead.address)}</td>
        <td>${escapeHtml(lead.queueType === 'human_outreach' ? 'Human outreach' : 'No next touch')}</td>
        <td>${escapeHtml(lead.lastContactedAt ?? 'Never')}</td>
      </tr>
    `).join('');

    windowRef.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Cadence Performance</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111827} h1{margin:0 0 8px} p{color:#4b5563}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
      .card{border:1px solid #d1d5db;border-radius:12px;padding:16px}.val{font-size:24px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #d1d5db;padding:8px;text-align:left;font-size:12px}
      th{background:#f3f4f6}
    </style></head><body>
      <h1>Cadence Performance</h1>
      <p>Generated ${new Date(data.generatedAt).toLocaleString()}</p>
      <div class="grid">
        <div class="card"><div class="val">${data.summary.activeSequenceCount}/${data.summary.sequenceCount}</div><div>Active sequences</div></div>
        <div class="card"><div class="val">${data.summary.enrollmentCount}</div><div>Total enrollments</div></div>
        <div class="card"><div class="val">${data.summary.sendCount}</div><div>Send log activity</div></div>
      </div>
      <h2>Sequences</h2>
      <table><thead><tr><th>Sequence</th><th>Steps</th><th>Enrollments</th><th>Sends</th><th>Engagement</th></tr></thead><tbody>${sequenceRows || '<tr><td colspan="5">No sequences</td></tr>'}</tbody></table>
      <h2>Follow-up queue</h2>
      <table><thead><tr><th>Lead</th><th>Address</th><th>Reason</th><th>Last contact</th></tr></thead><tbody>${queueRows || '<tr><td colspan="4">No queued leads</td></tr>'}</tbody></table>
    </body></html>`);
    windowRef.document.close();
    windowRef.print();
  }, [data]);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={BarChart3}
          title="Cadence Performance"
          description="Live metrics from cadence_sequences, cadence_enrollments, cadence_send_log, and cadence follow-up readiness fields."
          actions={(
            <>
              <button type="button" onClick={exportCsv} disabled={!data} className={buttonSecondary}>Export CSV</button>
              <button type="button" onClick={exportPrintView} disabled={!data} className={buttonSecondary}>Print view</button>
              <button type="button" onClick={() => void loadData()} disabled={loading} className={buttonPrimary}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </>
          )}
        />

        {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}
        {loading && <LoadingState label="Loading cadence metrics…" />}

        {!loading && data && (
          <>
            <StatGrid stats={stats} columns={3} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                tabs={[
                  { key: 'overview', label: 'Overview', icon: Activity },
                  { key: 'sequences', label: 'Sequences', icon: Waypoints },
                  { key: 'queue', label: 'Follow-up queue', icon: AlertTriangle, badge: data.followUpQueue.filter((lead) => !lead.assignedAgentId).length || undefined },
                ]}
                value={tab}
                onChange={setTab}
              />
              <div className="text-xs text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleString()}</div>
            </div>

            {tab === 'overview' && (
              <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <Panel title="12-week cadence activity" icon={BarChart3}>
                  <TrendPanel points={data.trend} />
                </Panel>

                <div className="space-y-6">
                  <Panel title="Enrollment status" icon={Users}>
                    <StatusMetric label="Active" value={data.summary.activeEnrollmentCount} tone="success" />
                    <StatusMetric label="Completed" value={data.summary.completedEnrollmentCount} tone="primary" />
                    <StatusMetric label="Escalated" value={data.summary.escalatedEnrollmentCount} tone="warning" />
                    <StatusMetric label="Paused + unsubscribed" value={data.summary.pausedEnrollmentCount + data.summary.unsubscribedEnrollmentCount} tone="danger" />
                  </Panel>

                  <Panel title="Send outcomes" icon={Send}>
                    <StatusMetric label="Delivered" value={data.summary.deliveredSendCount} tone="success" />
                    <StatusMetric label="Failed" value={data.summary.failedSendCount} tone="danger" />
                    <StatusMetric label="Skipped" value={data.summary.skippedSendCount} tone="warning" />
                    <StatusMetric label="Engaged sends" value={data.summary.engagedSendCount} tone="primary" />
                  </Panel>

                  <Panel title="Readiness snapshot" icon={Activity}>
                    <div className="space-y-3 text-sm">
                      <ReadinessRow label="New leads" value={data.summary.newLeadCount} />
                      <ReadinessRow label="Phone-ready leads" value={data.summary.phoneReadyCount} />
                      <ReadinessRow label="SMS opt-ins" value={data.summary.smsOptInCount} />
                      <ReadinessRow label="Scheduled touches" value={data.summary.scheduledTouchCount} />
                      <ReadinessRow label="Contacted, no next touch" value={data.summary.contactedWithoutNextTouchCount} warning />
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {tab === 'sequences' && (
              <Panel title="Sequence configuration and outcomes" icon={Waypoints} padded={false}>
                <SequenceTable rows={data.sequences} />
              </Panel>
            )}

            {tab === 'queue' && (
              <Panel title="Manual follow-up queue" icon={AlertTriangle}>
                <FollowUpQueue rows={data.followUpQueue} />
              </Panel>
            )}

            {tab === 'overview' && (
              <Panel title="What the live DB says" icon={CheckCircle2}>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <StatusPill tone={data.summary.sequenceCount > 0 ? 'success' : 'danger'}>{data.summary.sequenceCount} sequence row{data.summary.sequenceCount === 1 ? '' : 's'}</StatusPill>
                  <StatusPill tone={data.summary.enrollmentCount > 0 ? 'primary' : 'warning'}>{data.summary.enrollmentCount} enrollments</StatusPill>
                  <StatusPill tone={data.summary.sendCount > 0 ? 'primary' : 'warning'}>{data.summary.sendCount} send-log rows</StatusPill>
                  <StatusPill tone={data.summary.recent30DaySendCount > 0 ? 'success' : 'warning'}>{data.summary.recent30DaySendCount} sends in the last 30 days</StatusPill>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`rounded-full px-2.5 py-1 font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function ReadinessRow({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${warning && value > 0 ? 'text-warning' : 'text-foreground'}`}>{value.toLocaleString()}</span>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
