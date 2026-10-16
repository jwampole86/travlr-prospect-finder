'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Play,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  TerminalSquare,
  TimerReset,
} from 'lucide-react';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';
import type { CronJobSummary, CronMonitorPayload, CronRunHistoryRow } from './types';

type JobTab = 'all' | 'recorded' | 'unrecorded' | 'quota';

const tabConfig = [
  { key: 'all', label: 'All jobs', icon: Activity },
  { key: 'recorded', label: 'Recorded', icon: CheckCircle2 },
  { key: 'unrecorded', label: 'Needs logging', icon: ShieldAlert },
  { key: 'quota', label: 'Paid / confirm', icon: AlertTriangle },
] satisfies { key: JobTab; label: string; icon: React.ElementType }[];

function formatTimestamp(value: string | null) {
  if (!value) return 'No run recorded';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(value: string | null) {
  if (!value) return 'No run recorded';
  const diffMinutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function toneForStatus(status: CronJobSummary['lastRun']['status']) {
  switch (status) {
    case 'success':
      return 'success' as const;
    case 'partial':
      return 'warning' as const;
    case 'failed':
      return 'danger' as const;
    case 'running':
      return 'primary' as const;
    default:
      return 'default' as const;
  }
}

function labelForStatus(status: CronJobSummary['lastRun']['status']) {
  switch (status) {
    case 'success':
      return 'Healthy';
    case 'partial':
      return 'Partial';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    default:
      return 'No run recorded';
  }
}

function HistorySourcePill({ source }: { source: CronJobSummary['historySource'] }) {
  if (source === 'cron_job_runs') return <StatusPill tone="primary">cron_job_runs</StatusPill>;
  if (source === 'system_health_checks') return <StatusPill tone="success">system_health_checks</StatusPill>;
  return <StatusPill tone="warning">No history source</StatusPill>;
}

function ConfirmModal({
  job,
  pending,
  onClose,
  onConfirm,
}: {
  job: CronJobSummary | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (job: CronJobSummary) => void;
}) {
  if (!job) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-warning/10 p-3 text-warning">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Confirm manual run</h2>
            <p className="text-sm text-muted-foreground">{job.confirmationMessage}</p>
            <p className="text-xs text-muted-foreground">
              Route: <span className="font-mono text-foreground">{job.path}</span>
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary} disabled={pending}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(job)} className={buttonPrimary} disabled={pending}>
            {pending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Run now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CronMonitorPage() {
  const [tab, setTab] = useState<JobTab>('all');
  const [payload, setPayload] = useState<CronMonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningPath, setRunningPath] = useState<string | null>(null);
  const [confirmJob, setConfirmJob] = useState<CronJobSummary | null>(null);
  const [lastResult, setLastResult] = useState<{ job: string; ok: boolean; status: number; result: unknown } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/cron-monitor/data', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load cron jobs');
      setPayload(data as CronMonitorPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load cron jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const runJob = useCallback(async (job: CronJobSummary) => {
    setRunningPath(job.path);
    setLastResult(null);
    try {
      const response = await fetch('/cron-monitor/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: job.path }),
      });
      const data = await response.json();
      setLastResult({
        job: job.name,
        ok: Boolean(data?.ok),
        status: Number(data?.status || response.status),
        result: data?.result ?? data,
      });
      await load();
    } catch (runError) {
      setLastResult({
        job: job.name,
        ok: false,
        status: 500,
        result: { error: runError instanceof Error ? runError.message : 'Manual run failed' },
      });
    } finally {
      setRunningPath(null);
      setConfirmJob(null);
    }
  }, [load]);

  const filteredJobs = useMemo(() => {
    const jobs = payload?.jobs || [];
    switch (tab) {
      case 'recorded':
        return jobs.filter((job) => job.lastRun.status !== 'unrecorded');
      case 'unrecorded':
        return jobs.filter((job) => job.lastRun.status === 'unrecorded');
      case 'quota':
        return jobs.filter((job) => job.spendsQuota || job.requiresConfirmation);
      default:
        return jobs;
    }
  }, [payload, tab]);

  const history = payload?.recordedRuns || [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={ServerCog}
          title="Cron Job Monitor"
          description="Reads the real Vercel cron schedule and only shows recorded history when a route actually writes it."
          actions={
            <button type="button" onClick={load} className={buttonSecondary} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        {error && <ErrorBanner message={error} onRetry={load} />}

        {loading && !payload ? (
          <LoadingState label="Loading cron jobs…" />
        ) : payload ? (
          <>
            <StatGrid
              columns={5}
              stats={[
                { label: 'Scheduled jobs', value: payload.summary.totalJobs, hint: 'Read from vercel.json', icon: Activity, tone: 'primary' },
                { label: 'Recorded jobs', value: payload.summary.recordedJobs, hint: 'Have a real history source', icon: CheckCircle2, tone: 'success' },
                { label: 'Need logging', value: payload.summary.unrecordedJobs, hint: 'Show “No run recorded”', icon: ShieldAlert, tone: 'warning' },
                { label: 'Failing / partial', value: payload.summary.failingJobs, hint: 'Latest run not fully successful', icon: AlertTriangle, tone: payload.summary.failingJobs ? 'danger' : 'default' },
                { label: 'Paid / confirm', value: payload.summary.quotaJobs, hint: 'Manual runs require confirmation', icon: TimerReset, tone: 'warning' },
              ]}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                tabs={tabConfig.map((item) => ({
                  key: item.key,
                  label: item.label,
                  icon: item.icon,
                  badge:
                    item.key === 'recorded'
                      ? payload.summary.recordedJobs
                      : item.key === 'unrecorded'
                        ? payload.summary.unrecordedJobs
                        : undefined,
                }))}
                value={tab}
                onChange={setTab}
              />
              <p className="text-xs text-muted-foreground">
                Updated {formatRelative(payload.fetchedAt)} · {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'} shown
              </p>
            </div>

            <Panel title="Scheduled cron jobs" icon={Clock3}>
              {filteredJobs.length === 0 ? (
                <EmptyState icon={ShieldAlert} title="No jobs match this view" hint="Try a different tab or refresh the monitor." />
              ) : (
                <div className="space-y-3">
                  {filteredJobs.map((job) => (
                    <div key={job.path} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">{job.name}</h2>
                            <StatusPill tone={toneForStatus(job.lastRun.status)}>{labelForStatus(job.lastRun.status)}</StatusPill>
                            {job.spendsQuota && <StatusPill tone="warning">Paid quota</StatusPill>}
                            {!job.routeExists && <StatusPill tone="danger">Route missing</StatusPill>}
                          </div>
                          <p className="max-w-3xl text-sm text-muted-foreground">{job.description}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border bg-card px-2 py-1 font-mono text-foreground">{job.schedule}</span>
                            <span className="rounded-full border border-border bg-card px-2 py-1">{job.scheduleLabel}</span>
                            <span className="rounded-full border border-border bg-card px-2 py-1 font-mono text-foreground">{job.path}</span>
                            <HistorySourcePill source={job.historySource} />
                          </div>
                        </div>

                        <div className="flex flex-col items-start gap-2 lg:items-end">
                          <button
                            type="button"
                            className={buttonPrimary}
                            disabled={runningPath === job.path || !job.routeExists}
                            onClick={() => (job.requiresConfirmation ? setConfirmJob(job) : runJob(job))}
                          >
                            {runningPath === job.path ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                            {runningPath === job.path ? 'Running…' : 'Run now'}
                          </button>
                          {job.requiresConfirmation && (
                            <p className="text-[11px] text-muted-foreground">Confirmation required before manual execution.</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last run</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{formatTimestamp(job.lastRun.startedAt)}</p>
                          <p className="text-xs text-muted-foreground">{formatRelative(job.lastRun.startedAt)}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{formatDuration(job.lastRun.durationMs)}</p>
                          <p className="text-xs text-muted-foreground">Errors: {job.lastRun.errorCount}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-3 md:col-span-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recorded summary</p>
                          <p className="mt-1 text-sm text-foreground">{job.lastRun.summary}</p>
                          {job.lastRun.status === 'unrecorded' && (
                            <p className="mt-1 text-xs text-muted-foreground">This job needs explicit run logging before the monitor can show a real last-run result.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Instrumented run history" icon={TerminalSquare}>
              {history.length === 0 ? (
                <EmptyState
                  icon={TerminalSquare}
                  title="No instrumented scheduled runs yet"
                  hint="Jobs only appear here after they write to cron_job_runs. System health currently falls back to system_health_checks until its next recorded run."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Job</th>
                        <th className="px-3 py-2">Started</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Errors</th>
                        <th className="px-3 py-2">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row: CronRunHistoryRow) => (
                        <tr key={`${row.key}-${row.startedAt}`} className="border-b border-border/60 align-top">
                          <td className="px-3 py-3 font-medium text-foreground">{row.name}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            <div>{formatTimestamp(row.startedAt)}</div>
                            <div className="text-xs">{formatRelative(row.startedAt)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill tone={toneForStatus(row.status)}>{labelForStatus(row.status)}</StatusPill>
                          </td>
                          <td className="px-3 py-3 tabular-nums text-foreground">{row.errorCount}</td>
                          <td className="px-3 py-3 text-muted-foreground">{row.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {lastResult && (
              <Panel title={`Last manual run · ${lastResult.job}`} icon={Play}>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusPill tone={lastResult.ok ? 'success' : 'danger'}>{lastResult.ok ? 'Completed' : 'Failed'}</StatusPill>
                  <span>HTTP {lastResult.status}</span>
                </div>
                <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/30 p-4 text-xs text-foreground">
                  {JSON.stringify(lastResult.result, null, 2)}
                </pre>
              </Panel>
            )}
          </>
        ) : null}
      </div>

      <ConfirmModal job={confirmJob} pending={Boolean(runningPath)} onClose={() => setConfirmJob(null)} onConfirm={runJob} />
    </AppLayout>
  );
}
