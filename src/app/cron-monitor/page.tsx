'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  Clock, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Play, BarChart2, Zap, Database, TrendingUp, Calendar,
  ChevronDown, ChevronUp, Activity
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface CronRun {
  id: string;
  job_name: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  leads_scanned: number;
  scores_recalculated: number;
  reenrichment_triggered: number;
  property_data_refreshed: number;
  error_count: number;
  errors: string[];
  created_at: string;
}

interface JobConfig {
  key: string;
  name: string;
  description: string;
  schedule: string;
  endpoint: string;
  icon: React.ElementType;
  color: string;
}

const JOBS: JobConfig[] = [
  {
    key: 'property-refresh',
    name: 'Property Data Refresh',
    description: 'Refreshes property data, recalculates prospect scores, and triggers re-enrichment on leads not contacted in 7+ days.',
    schedule: 'Every hour',
    endpoint: '/api/cron/property-refresh',
    icon: Database,
    color: 'text-blue-600 bg-blue-500/10',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDuration(start: string, end: string | null): string {
  if (!end) return 'Running…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: CronRun['status'] }) {
  const cfg = {
    success: { label: 'Success', cls: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
    partial: { label: 'Partial', cls: 'bg-amber-500/10 text-amber-600', icon: AlertTriangle },
    failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-600', icon: XCircle },
    running: { label: 'Running', cls: 'bg-blue-500/10 text-blue-600', icon: RefreshCw },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.cls}`}>
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CronMonitorPage() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ job: string; result: Record<string, unknown> } | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('cron_job_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      setRuns((data ?? []) as CronRun[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
    // Auto-refresh every 30s
    const interval = setInterval(loadRuns, 30000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  const triggerJob = async (job: JobConfig) => {
    setTriggering(job.key);
    setTriggerResult(null);
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json();
      setTriggerResult({ job: job.name, result: json });
      await loadRuns();
    } catch (err) {
      setTriggerResult({ job: job.name, result: { error: String(err) } });
    } finally {
      setTriggering(null);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const last24h = runs.filter(r => new Date(r.started_at).getTime() > Date.now() - 86400000);
  const successCount = last24h.filter(r => r.status === 'success').length;
  const failCount = last24h.filter(r => r.status === 'failed' || r.status === 'partial').length;
  const totalLeadsProcessed = last24h.reduce((acc, r) => acc + r.leads_scanned, 0);
  const totalReenriched = last24h.reduce((acc, r) => acc + r.reenrichment_triggered, 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              Cron Job Monitor
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Background job execution history — auto-refreshes every 30s
            </p>
          </div>
          <button
            onClick={loadRuns}
            disabled={loading}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Runs (24h)', value: last24h.length.toString(), icon: Clock, color: 'bg-blue-500/10 text-blue-600' },
              { label: 'Successful', value: successCount.toString(), icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600' },
              { label: 'Errors / Partial', value: failCount.toString(), icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-600' },
              { label: 'Leads Processed', value: totalLeadsProcessed.toLocaleString(), icon: TrendingUp, color: 'bg-purple-500/10 text-purple-600' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                  <kpi.icon size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Job cards */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap size={12} />Registered Jobs
            </h2>
            {JOBS.map(job => {
              const lastRun = runs.find(r => r.job_name === job.key);
              const Icon = job.icon;
              return (
                <div key={job.key} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${job.color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm">{job.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{job.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar size={10} />{job.schedule}
                          </span>
                          {lastRun && (
                            <>
                              <span className="text-[10px] text-muted-foreground">
                                Last run: {fmtTime(lastRun.started_at)}
                              </span>
                              <StatusBadge status={lastRun.status} />
                            </>
                          )}
                          {!lastRun && (
                            <span className="text-[10px] text-muted-foreground italic">Never run</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => triggerJob(job)}
                      disabled={triggering === job.key}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                    >
                      {triggering === job.key ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      {triggering === job.key ? 'Running…' : 'Run Now'}
                    </button>
                  </div>

                  {/* Last run stats */}
                  {lastRun && (
                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Leads Scanned', value: lastRun.leads_scanned },
                        { label: 'Scores Updated', value: lastRun.scores_recalculated },
                        { label: 'Re-Enriched', value: lastRun.reenrichment_triggered },
                        { label: 'Duration', value: fmtDuration(lastRun.started_at, lastRun.completed_at) },
                      ].map(stat => (
                        <div key={stat.label} className="text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trigger result */}
          {triggerResult && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <BarChart2 size={12} />Last Trigger Result — {triggerResult.job}
              </h3>
              <pre className="text-xs text-foreground bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(triggerResult.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Run history table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock size={12} />Run History
              </h2>
              <span className="text-[10px] text-muted-foreground">{runs.length} runs</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Activity size={28} className="mx-auto mb-2 opacity-20" />
                No runs yet. Click "Run Now" to trigger a job.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Job</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Started</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Duration</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Leads</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Scores</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Re-Enrich</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run, idx) => (
                      <React.Fragment key={run.id}>
                        <tr className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="px-4 py-3 font-medium text-foreground">{run.job_name}</td>
                          <td className="px-3 py-3 text-muted-foreground">{fmtTime(run.started_at)}</td>
                          <td className="px-3 py-3 text-right text-muted-foreground">{fmtDuration(run.started_at, run.completed_at)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-foreground">{run.leads_scanned}</td>
                          <td className="px-3 py-3 text-right text-emerald-600 font-semibold">{run.scores_recalculated}</td>
                          <td className="px-3 py-3 text-right text-blue-600 font-semibold">{run.reenrichment_triggered}</td>
                          <td className="px-3 py-3 text-center"><StatusBadge status={run.status} /></td>
                          <td className="px-4 py-3 text-center">
                            {run.errors?.length > 0 && (
                              <button
                                onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {expandedRun === run.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedRun === run.id && run.errors?.length > 0 && (
                          <tr className="bg-red-500/5">
                            <td colSpan={8} className="px-4 py-3">
                              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Errors</p>
                              <ul className="space-y-1">
                                {run.errors.map((e, i) => (
                                  <li key={i} className="text-xs text-red-600 font-mono">{e}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Setup instructions */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Zap size={12} />External Cron Setup
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              To run automatically, configure an external cron scheduler (e.g., cron-job.org, GitHub Actions, Vercel Cron) to POST to the endpoints below every hour.
            </p>
            <div className="space-y-2">
              {JOBS.map(job => (
                <div key={job.key} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{job.name} — {job.schedule}</p>
                  <code className="text-xs text-foreground font-mono">
                    POST {process.env.NEXT_PUBLIC_SITE_URL ?? 'https://your-app.com'}{job.endpoint}
                  </code>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Header: <code className="font-mono">x-job-secret: YOUR_SEQUENCE_JOB_SECRET</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
