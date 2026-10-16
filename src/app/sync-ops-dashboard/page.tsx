'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bell, CheckCircle2, Database, Loader2, Play, Radio, ShieldCheck, Square, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';
import ActivityLog from './components/ActivityLog';
import AlertsPanel from './components/AlertsPanel';
import E2EPanel from './components/E2EPanel';
import PortfolioSyncList from './components/PortfolioSyncList';
import SourceHealthStrip from './components/SourceHealthStrip';
import { SOURCES, pullSource, timeAgo, type SourceKey, type SourceRunResult } from './lib/syncEngine';
import type { LogEntry, LogLevel, PortfolioRow, SourceCell, SourceStat } from './lib/types';
import { useE2E } from './lib/useE2E';
import { useSyncAlerts } from './lib/useSyncAlerts';

type Tab = 'sync' | 'e2e' | 'alerts';

const CONCURRENCY = 2;
const AUTO_SYNC_EVERY_MIN = 30;
const AUTO_SYNC_OVERDUE_MS = 2 * 60 * 60 * 1000;
const LOG_LIMIT = 300;

const sourceByLeadSource = (name: string | undefined) => SOURCES.find((s) => s.leadSource === name);

function useLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seq = useRef(0);
  const add = useCallback((level: LogLevel, text: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setEntries((prev) => [...prev.slice(-(LOG_LIMIT - 1)), { id: ++seq.current, ts, level, text }]);
  }, []);
  const clear = useCallback(() => setEntries([]), []);
  return { entries, add, clear };
}

export default function SyncOpsDashboardPage() {
  const { configuredPortfolios } = usePortfolio();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>('sync');
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [newLast24h, setNewLast24h] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [allProgress, setAllProgress] = useState({ done: 0, total: 0 });
  const [sessionNew, setSessionNew] = useState(0);

  const syncLog = useLog();
  const e2eLog = useLog();
  const alerts = useSyncAlerts();
  const cancelRef = useRef(false);
  const liveStates = useRef(new Set<string>());
  const rowsRef = useRef<PortfolioRow[]>([]);
  rowsRef.current = rows;

  const portfolioKeys = configuredPortfolios.map((p) => p.key).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const portfolios = useMemo(() => configuredPortfolios, [portfolioKeys]);
  const e2e = useE2E(useMemo(() => portfolios.map((p) => ({ label: p.label, stateCode: p.stateCode })), [portfolios]), e2eLog.add);

  // ── Initial rows (one per portfolio) ───────────────────────────────────────
  useEffect(() => {
    setRows((prev) =>
      portfolios.map((p) => prev.find((r) => r.stateCode === p.stateCode) ?? {
        portfolio: p.label, stateCode: p.stateCode, totalLeads: 0, running: false, progress: { done: 0, total: 0 }, cells: {},
      })
    );
  }, [portfolios]);

  // ── Persisted history: what the cron and earlier syncs actually did ────────
  const loadHistory = useCallback(async () => {
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const { data: events } = await supabase
      .from('sync_events')
      .select('operation_id, status, last_error, payload, created_at')
      .eq('operation_type', 'source_sync')
      .order('created_at', { ascending: false })
      .limit(3000);

    const history = new Map<string, Partial<Record<SourceKey, SourceCell>>>();
    const latestBySource = new Map<SourceKey, { at: string; status: 'success' | 'failed'; error: string | null }>();
    for (const e of events || []) {
      const p = (e.payload || {}) as Record<string, unknown>;
      const def = sourceByLeadSource(p.source as string | undefined);
      const state = p.state_code as string | undefined;
      if (!def) continue;
      const status = e.status === 'success' ? 'success' : 'failed';
      if (!latestBySource.has(def.key)) latestBySource.set(def.key, { at: e.created_at, status, error: e.last_error });
      if (!state) continue;
      const cells = history.get(state) ?? {};
      if (!cells[def.key]) {
        const fetched = Number(p.fetched) || 0;
        cells[def.key] = {
          status: status === 'failed' ? 'failed' : fetched === 0 ? 'empty' : 'success',
          fetched, newLeads: Number(p.new_leads) || 0, updated: Math.max(0, (Number(p.imported) || 0) - (Number(p.new_leads) || 0)),
          duplicates: 0, at: e.created_at, error: e.last_error, durationMs: null,
        };
      }
      history.set(state, cells);
    }
    setLastEventAt(events?.[0]?.created_at ?? null);

    setRows((prev) => prev.map((r) => {
      const persisted = history.get(r.stateCode);
      if (!persisted) return r;
      const cells = { ...r.cells };
      for (const key of Object.keys(persisted) as SourceKey[]) {
        const existing = cells[key];
        if (!existing || persisted[key]!.at > existing.at) cells[key] = persisted[key];
      }
      return { ...r, cells };
    }));

    // Source mix + freshness
    const grand = await supabase.from('leads').select('*', { count: 'exact', head: true }).then((r) => r.count || 0);
    const recent = await supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', since24h).then((r) => r.count || 0);
    const stats = await Promise.all(SOURCES.map(async (s): Promise<SourceStat> => {
      const base = () => supabase.from('leads').select('*', { count: 'exact', head: true }).eq('source', s.leadSource);
      const [total, last24h] = await Promise.all([base().then((r) => r.count || 0), base().gte('created_at', since24h).then((r) => r.count || 0)]);
      const latest = latestBySource.get(s.key);
      return {
        key: s.key, name: s.name, accent: s.accent, total, last24h,
        sharePct: grand ? Math.round((total / grand) * 1000) / 10 : 0,
        lastEventAt: latest?.at ?? null, lastStatus: latest?.status ?? null, lastError: latest?.status === 'failed' ? latest.error : null,
      };
    }));
    setSourceStats(stats);
    setNewLast24h(recent);
    setStatsLoading(false);
  }, [supabase]);

  const loadLeadCounts = useCallback(async (only?: string) => {
    const targets = only ? portfolios.filter((p) => p.stateCode === only) : portfolios;
    const counts = new Map<string, number>();
    for (let i = 0; i < targets.length; i += 8) {
      await Promise.all(targets.slice(i, i + 8).map(async (p) => {
        const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', p.stateCode);
        counts.set(p.stateCode, count || 0);
      }));
    }
    setRows((prev) => prev.map((r) => (counts.has(r.stateCode) ? { ...r, totalLeads: counts.get(r.stateCode)! } : r)));
  }, [supabase, portfolios]);

  useEffect(() => {
    if (portfolios.length === 0) return;
    loadHistory();
    loadLeadCounts();
  }, [portfolios, loadHistory, loadLeadCounts]);

  // ── Live feed: pulls made by the automatic cron or other sessions ──────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('sync-ops-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_events' }, (payload) => {
        const ev = payload.new as { operation_type?: string; status?: string; last_error?: string; payload?: Record<string, unknown>; created_at: string };
        if (ev.operation_type !== 'source_sync') return;
        const state = ev.payload?.state_code as string | undefined;
        if (state && liveStates.current.has(state)) return; // this page is already logging that run
        const name = (ev.payload?.source as string) || 'Source';
        const fresh = Number(ev.payload?.new_leads) || 0;
        syncLog.add(ev.status === 'success' ? 'ok' : 'error',
          ev.status === 'success' ? `Auto-sync · ${name} ${state ?? ''}: +${fresh} new` : `Auto-sync · ${name} ${state ?? ''} failed: ${ev.last_error ?? 'unknown error'}`);
        clearTimeout(timer);
        timer = setTimeout(() => { loadHistory(); if (state) loadLeadCounts(state); }, 1500);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [supabase, loadHistory, loadLeadCounts, syncLog.add]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync engine ────────────────────────────────────────────────────────────
  const patchRow = useCallback((stateCode: string, fn: (r: PortfolioRow) => PortfolioRow) => {
    setRows((prev) => prev.map((r) => (r.stateCode === stateCode ? fn(r) : r)));
  }, []);

  const syncPortfolio = useCallback(async (stateCode: string): Promise<SourceRunResult[]> => {
    const row = rowsRef.current.find((r) => r.stateCode === stateCode);
    if (!row) return [];
    const label = row.portfolio;
    const previousLeads = row.totalLeads;
    const results: SourceRunResult[] = [];

    liveStates.current.add(stateCode);
    patchRow(stateCode, (r) => ({ ...r, running: true, progress: { done: 0, total: SOURCES.length } }));
    syncLog.add('info', `▶ ${label}: pulling ${SOURCES.map((s) => s.name).join(', ')}`);

    await Promise.all(SOURCES.map(async (def) => {
      const r = await pullSource(def, stateCode);
      results.push(r);
      const cell: SourceCell = {
        status: r.status, fetched: r.fetched, newLeads: r.newLeads, updated: r.updated, duplicates: r.duplicates,
        at: new Date().toISOString(), error: r.error, durationMs: r.durationMs,
      };
      patchRow(stateCode, (x) => ({ ...x, cells: { ...x.cells, [def.key]: cell }, progress: { ...x.progress, done: x.progress.done + 1 } }));

      const secs = (r.durationMs / 1000).toFixed(1);
      if (r.status === 'failed') syncLog.add('error', `   ✗ ${def.name}: ${r.error} (${secs}s)`);
      else if (r.status === 'skipped') syncLog.add('info', `   – ${def.name}: no cities configured`);
      else if (r.status === 'empty') syncLog.add('warn', `   ○ ${def.name}: 0 listings returned (${secs}s)`);
      else syncLog.add(r.rowErrors > 0 ? 'warn' : 'ok', `   ✓ ${def.name}: ${r.fetched} fetched · +${r.newLeads} new · ${r.updated} updated${r.rowErrors ? ` · ${r.rowErrors} row errors` : ''} (${secs}s)`);
    }));

    const added = results.reduce((n, r) => n + r.newLeads, 0);
    setSessionNew((n) => n + added);
    syncLog.add(results.some((r) => r.status === 'failed') ? 'warn' : 'ok', `■ ${label}: +${added} new leads`);

    await alerts.evaluate(label, results, previousLeads);
    patchRow(stateCode, (r) => ({ ...r, running: false }));
    // Keep the guard briefly: the server records each pull just after responding.
    setTimeout(() => liveStates.current.delete(stateCode), 10_000);
    loadLeadCounts(stateCode);
    return results;
  }, [alerts, loadLeadCounts, patchRow, syncLog]);

  const syncAll = useCallback(async () => {
    cancelRef.current = false;
    setSyncingAll(true);
    setSessionNew(0);
    const queue = portfolios.map((p) => p.stateCode);
    setAllProgress({ done: 0, total: queue.length });
    syncLog.add('info', `═ Syncing ${queue.length} portfolios (${CONCURRENCY} at a time)`);

    let cursor = 0;
    const worker = async () => {
      while (!cancelRef.current && cursor < queue.length) {
        const state = queue[cursor++];
        await syncPortfolio(state);
        setAllProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    syncLog.add(cancelRef.current ? 'warn' : 'ok', cancelRef.current ? '═ Sync stopped' : '═ Full sync complete');
    setSyncingAll(false);
    loadHistory();
    toast.success(cancelRef.current ? 'Sync stopped' : 'Full sync complete');
  }, [portfolios, syncLog, syncPortfolio, loadHistory]);

  const syncOne = useCallback(async (stateCode: string) => {
    await syncPortfolio(stateCode);
    loadHistory();
  }, [syncPortfolio, loadHistory]);

  // ── Derived KPIs ───────────────────────────────────────────────────────────
  const totalLeads = rows.reduce((n, r) => n + r.totalLeads, 0);
  const dayAgo = Date.now() - 86400000;
  const syncedToday = rows.filter((r) => Object.values(r.cells).some((c) => c && c.status !== 'skipped' && new Date(c.at).getTime() > dayAgo)).length;
  const failedCells = rows.reduce((n, r) => n + Object.values(r.cells).filter((c) => c?.status === 'failed').length, 0);
  const overdue = lastEventAt ? Date.now() - new Date(lastEventAt).getTime() > AUTO_SYNC_OVERDUE_MS : true;
  const runningCount = rows.filter((r) => r.running).length;

  const kpis = [
    { label: 'Total leads', value: totalLeads.toLocaleString(), hint: `${portfolios.length} portfolios`, icon: Database, tone: 'text-primary bg-primary/10' },
    { label: 'New in 24h', value: newLast24h.toLocaleString(), hint: sessionNew > 0 ? `+${sessionNew} this session` : 'across all sources', icon: TrendingUp, tone: 'text-success bg-success/10' },
    { label: 'Synced in 24h', value: `${syncedToday}/${portfolios.length}`, hint: 'portfolios refreshed', icon: CheckCircle2, tone: syncedToday === portfolios.length ? 'text-success bg-success/10' : 'text-warning bg-warning/10' },
    { label: 'Failing pulls', value: failedCells.toString(), hint: 'latest result per source', icon: AlertTriangle, tone: failedCells > 0 ? 'text-danger bg-danger/10' : 'text-muted-foreground bg-muted' },
    { label: 'Open alerts', value: alerts.unacked.toString(), hint: 'unacknowledged', icon: Bell, tone: alerts.unacked > 0 ? 'text-danger bg-danger/10' : 'text-muted-foreground bg-muted' },
  ];

  const TABS: { key: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'sync', label: 'Sync progress', icon: Radio },
    { key: 'e2e', label: 'E2E validation', icon: ShieldCheck },
    { key: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.unacked },
  ];

  const busy = syncingAll || e2e.running;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Activity size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Sync Ops</h1>
                <p className="text-sm text-muted-foreground">Live source pulls, per-portfolio health, validation and alerts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setTab('e2e'); e2e.run(); }}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                {e2e.running ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                Run E2E validation
              </button>
              {syncingAll ? (
                <button
                  onClick={() => { cancelRef.current = true; }}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Square size={14} /> Stop ({runningCount} active)
                </button>
              ) : (
                <button
                  onClick={syncAll}
                  disabled={busy || portfolios.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Play size={15} /> Sync all {portfolios.length} portfolios
                </button>
              )}
            </div>
          </div>

          {syncingAll && (
            <div className="relative mt-5">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{allProgress.done} of {allProgress.total} portfolios</span>
                <span>+{sessionNew} new leads</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${allProgress.total ? (allProgress.done / allProgress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </header>

        {/* Auto-sync status */}
        <div className={`flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-xs ${overdue ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'}`}>
          <Zap size={14} />
          {overdue ? (
            <span>
              Automatic sync hasn&apos;t reported {lastEventAt ? `since ${timeAgo(lastEventAt)}` : 'yet'}. It should run every {AUTO_SYNC_EVERY_MIN} min once the cron is deployed.
            </span>
          ) : (
            <span>
              Automatic sync active: refreshes the stalest portfolios every {AUTO_SYNC_EVERY_MIN} min. Last pull {timeAgo(lastEventAt)}.
            </span>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                <span className={`rounded-lg p-1.5 ${k.tone}`}><k.icon size={14} /></span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{k.value}</div>
              <div className="text-[11px] text-muted-foreground">{k.hint}</div>
            </div>
          ))}
        </div>

        <SourceHealthStrip stats={sourceStats} loading={statsLoading} />

        {/* Tabs */}
        <div className="inline-flex gap-1 rounded-2xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {!!t.badge && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{t.badge}</span>}
            </button>
          ))}
        </div>

        {tab === 'sync' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PortfolioSyncList rows={rows} busy={syncingAll} onSync={syncOne} />
            </div>
            <ActivityLog
              title="Activity"
              entries={syncLog.entries}
              onClear={syncLog.clear}
              emptyText="Run a sync, or wait for the automatic pull, to see activity here…"
              className="lg:sticky lg:top-6 lg:self-start"
            />
          </div>
        )}

        {tab === 'e2e' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><E2EPanel rows={e2e.rows} running={e2e.running} /></div>
            <ActivityLog title="Validation log" entries={e2eLog.entries} onClear={e2eLog.clear} emptyText="Run validation to see output…" className="lg:self-start" />
          </div>
        )}

        {tab === 'alerts' && <AlertsPanel alerts={alerts} />}
      </div>
    </AppLayout>
  );
}
