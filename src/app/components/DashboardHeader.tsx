'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, Plus, Clock, ExternalLink, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorWithRetry } from '@/lib/hooks/useRetryToast';
import {
  refreshLeadsFromSources,
  getLastRefreshTime,
  getNextRefreshTime,
  REFRESH_SOURCES,
  setLastRefreshTime,
} from '@/lib/services/leadsRefreshService';
import { leadsService } from '@/lib/services/leadsService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { loadSyncSchedules, getSoonestNextSync, formatNextSync } from '@/lib/services/syncSchedulerService';
import { useAuth } from '@/contexts/AuthContext';

// 1 hour in milliseconds — centrally managed via SYNC_INTERVAL_MS in syncSchedulerService
const AUTO_REFRESH_INTERVAL_MS = 1 * 60 * 60 * 1000;

interface DashboardHeaderProps {
  onLeadsRefreshed?: () => void;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatCountdown(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'now';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Trigger a background sync for all active portfolios in PARALLEL.
 * Returns a summary of results without blocking the UI.
 *
 * Calls the same RapidAPI-backed pipeline (Trulia + Zillow) used by the
 * Data Source Sync widget's per-source Retry buttons — NOT the legacy
 * /api/sync/execute route, which only discovered via Trulia, only had a
 * hardcoded state mapping for 11 of the (now 27) portfolios, and whose
 * JSON response shape (`pipeline_summary.total_inserted` /
 * `portfolios[].errors`) never matched what this function read
 * (`total_leads_inserted` / `total_errors` / `insert_errors` at the root),
 * so the UI always reported "0 new leads added" regardless of what the
 * backend actually did.
 */
async function triggerParallelSync(
  portfolios: { label: string; stateCode: string }[],
  onPortfolioComplete?: (portfolio: string, inserted: number, hasErrors: boolean) => void
): Promise<{ totalInserted: number; errors: string[] }> {
  const syncStart = Date.now();

  async function syncOnePortfolio(p: { label: string; stateCode: string }): Promise<{ inserted: number; errors: string[] }> {
    const [truliaRes, zillowRes] = await Promise.allSettled([
      fetch('/api/leads/rapidapi-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'trulia', location: p.stateCode, maxPages: 1 }),
      }).then((r) => r.json()),
      fetch('/api/leads/rapidapi-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'zillow-search', region: p.stateCode.toLowerCase(), maxPages: 1 }),
      }).then((r) => r.json()),
    ]);

    let inserted = 0;
    const errors: string[] = [];
    for (const res of [truliaRes, zillowRes]) {
      if (res.status === 'fulfilled') {
        inserted += Number(res.value?.totals?.rowsNew ?? 0);
        if (res.value?.error) errors.push(`${p.label}: ${res.value.error}`);
      } else {
        errors.push(`${p.label}: ${res.reason?.message ?? 'Unknown sync error'}`);
      }
    }

    onPortfolioComplete?.(p.label, inserted, errors.length > 0);
    return { inserted, errors };
  }

  // Limit concurrency so source ingestion cannot starve dashboard/API requests.
  const results: { inserted: number; errors: string[] }[] = [];
  const concurrency = 2;
  for (let index = 0; index < portfolios.length; index += concurrency) {
    const batch = portfolios.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map(syncOnePortfolio))));
  }

  const syncDuration = Date.now() - syncStart;
  console.info(`[DashboardHeader] Parallel sync completed in ${syncDuration}ms across ${portfolios.length} portfolios`);

  let totalInserted = 0;
  const errors: string[] = [];
  for (const result of results) {
    totalInserted += result.inserted;
    errors.push(...result.errors);
  }

  return { totalInserted, errors };
}

export default function DashboardHeader({ onLeadsRefreshed }: DashboardHeaderProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [nextRefresh, setNextRefresh] = useState('');
  const [showSources, setShowSources] = useState(false);
  // Per-portfolio sync progress: portfolio name → { inserted, done, hasErrors }
  const [portfolioProgress, setPortfolioProgress] = useState<
    Record<string, { inserted: number; done: boolean; hasErrors: boolean }>
  >({});
  const { selectedPortfolio, configuredPortfolios } = usePortfolio();
  const { user } = useAuth();

  // Single ref for the auto-refresh timeout — prevents multiple timers
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether a background sync is in flight
  const syncInFlightRef = useRef(false);

  const updateTimes = useCallback(async () => {
    const last = getLastRefreshTime();
    setLastUpdated(last ? formatRelativeTime(last) : 'Never');

    // Prefer the soonest upcoming sync from the scheduler (most accurate)
    // Fall back to leadsRefreshService's next time if no schedules exist yet
    if (user) {
      try {
        const schedules = await loadSyncSchedules(user.id);
        const soonest = getSoonestNextSync(schedules);
        if (soonest) {
          setNextRefresh(formatNextSync(soonest));
          return;
        }
      } catch { /* fall through to legacy */ }
    }
    const next = getNextRefreshTime();
    setNextRefresh(next ? formatCountdown(next) : 'Soon');
  }, [user]);

  /**
   * Schedule the next auto-refresh exactly 1 hour from now.
   * Clears any existing timer first to guarantee only one is active.
   */
  const scheduleNextAutoRefresh = useCallback(() => {
    if (autoRefreshTimerRef.current !== null) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    autoRefreshTimerRef.current = setTimeout(async () => {
      autoRefreshTimerRef.current = null;
      const result = await refreshLeadsFromSources();
      if (!result.error) {
        setLastRefreshTime(new Date());
        updateTimes();
        if (result.newLeads > 0) {
          toast.success(`Auto-refresh: ${result.newLeads} new leads found`, {
            description: `From ${result.sources.length} sources`,
          });
          onLeadsRefreshed?.();
        }
      }
      scheduleNextAutoRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);
  }, [onLeadsRefreshed, updateTimes]);

  // Countdown display ticks every 30 seconds
  useEffect(() => {
    updateTimes();
    const countdownInterval = setInterval(updateTimes, 30000);
    return () => clearInterval(countdownInterval);
  }, [updateTimes]);

  // On mount: if no last-refresh time is stored yet, seed it to now so the
  // display never shows a stale hardcoded date from a previous session.
  useEffect(() => {
    if (!getLastRefreshTime()) {
      setLastRefreshTime(new Date());
      updateTimes();
    }
  }, [updateTimes]);

  // Mount: schedule the auto-refresh timer (single instance)
  useEffect(() => {
    scheduleNextAutoRefresh();
    return () => {
      if (autoRefreshTimerRef.current !== null) {
        clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Non-blocking Refresh Leads handler.
   *
   * Step 1: Immediately re-query the local DB (fast — no external calls) and
   *         update the UI with last-known-good data. UI stays fully usable.
   * Step 2: Kick off a background parallel sync against all active external sources.
   *         Each portfolio fires independently; UI updates as each one completes.
   * Step 3: When all complete, re-fetch from DB and show final summary.
   */
  async function handleRefresh() {
    if (syncing) return; // prevent double-click during background sync

    // ── Step 1: Immediate DB re-query (non-blocking, fast) ────────────────
    setRefreshing(true);
    setRefreshMsg('Fetching latest data…');

    try {
      // Re-query our own DB — this is fast (no external sites)
      onLeadsRefreshed?.();
      setLastRefreshTime(new Date());
      updateTimes();
    } finally {
      setRefreshing(false);
      setRefreshMsg('');
    }

    // ── Step 2: Background sync — non-blocking, UI stays usable ──────────
    if (syncInFlightRef.current) {
      toast.info('A sync is already in progress', { duration: 3000 });
      return;
    }

    syncInFlightRef.current = true;
    setSyncing(true);

    // Reset per-portfolio progress for this new run
    setPortfolioProgress({});

    // Use dynamic portfolio count — never hardcoded
    const portfolioLabels = configuredPortfolios.map(p => p.label);
    const portfolioCount = portfolioLabels.length;

    toast.info(`Syncing all ${portfolioCount} sources in background…`, {
      id: 'bg-sync',
      description: 'UI stays usable. Results update as each portfolio completes.',
      duration: 8000,
    });

    // Per-portfolio completion callback — fires as each of the 10 finishes
    let completedCount = 0;
    const handlePortfolioComplete = (portfolio: string, inserted: number, hasErrors: boolean) => {
      completedCount++;
      setPortfolioProgress((prev) => ({
        ...prev,
        [portfolio]: { inserted, done: true, hasErrors },
      }));

      // Show a lightweight toast for each portfolio as it completes
      const shortName = portfolio.replace(' Portfolio', '');
      if (hasErrors) {
        toast.warning(`${shortName} synced with errors`, {
          description: `${inserted} leads added`,
          duration: 3000,
        });
      } else if (inserted > 0) {
        toast.success(`${shortName} synced — ${inserted} new leads`, {
          duration: 3000,
        });
      }

      // Re-fetch from DB after each portfolio completes so the UI shows
      // incremental updates rather than waiting for all 10 to finish.
      onLeadsRefreshed?.();
    };

    try {
      const syncResult = await triggerParallelSync(configuredPortfolios, handlePortfolioComplete);

      // ── Step 3: Final re-fetch from DB after all syncs complete ──────────
      onLeadsRefreshed?.();
      setLastRefreshTime(new Date());
      updateTimes();
      scheduleNextAutoRefresh();

      if (syncResult.errors.length > 0) {
        toast.warning(`All ${portfolioCount} portfolios synced — ${syncResult.totalInserted} leads added`, {
          id: 'bg-sync',
          description: `${syncResult.errors.length} source(s) had errors`,
          duration: 6000,
        });
      } else {
        toast.success(`All ${portfolioCount} portfolios synced — ${syncResult.totalInserted} new leads added`, {
          id: 'bg-sync',
          description: `Ran in parallel, UI stayed responsive throughout`,
          duration: 5000,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      showErrorWithRetry({
        message: 'Background sync failed',
        detail: msg,
        onRetry: handleRefresh,
      });
      toast.dismiss('bg-sync');
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
      setPortfolioProgress({});
    }
  }

  async function handleExport() {
    toast.loading('Preparing export…', { id: 'export' });
    try {
      const leads = await leadsService.getAll();
      if (leads.length === 0) {
        toast.error('No leads to export', { id: 'export' });
        return;
      }
      const headers = ['ID', 'Address', 'City', 'State', 'Zip', 'Beds', 'Baths', 'Price', 'Source', 'Stage', 'Regulation Status', 'Prospect Score', 'Days On Market', 'Listing URL', 'Notes', 'Contact Name', 'Contact Phone', 'Est. ADR', 'Est. Occupancy', 'Est. Gross Monthly', 'Est. Net Monthly', 'Created At', 'Updated At'];
      const rows = leads.map((l) => [
        l.id, l.address, l.city, l.state, l.zip, l.beds, l.baths, l.price,
        l.source, l.stage, l.regulationStatus, l.prospectScore, l.daysOnMarket,
        l.listingUrl, `"${(l.notes || '').replace(/"/g, '""')}"`,
        l.contactName || '', l.contactPhone || '',
        l.estimatedADR, l.estimatedOccupancy, l.estimatedGrossMonthly, l.estimatedNetMonthly,
        l.createdAt, l.updatedAt,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `travlr-leads-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${leads.length} leads`, { id: 'export' });
    } catch {
      toast.error('Export failed', { id: 'export' });
    }
  }

  const isWorking = refreshing || syncing;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted border border-border ${selectedPortfolio.color}`}>
            <Building2 size={10} />
            {selectedPortfolio.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Updated: <span className="text-foreground font-medium">{lastUpdated}</span>
            </span>
          </div>
          {nextRefresh && (
            <span className="text-xs text-muted-foreground">
              Next auto-refresh: <span className="text-foreground font-medium">{nextRefresh}</span>
            </span>
          )}
          {syncing && (
            <span className="flex items-center gap-1 text-xs text-primary font-medium animate-pulse">
              <Loader2 size={10} className="animate-spin" />
              Syncing all sources…
            </span>
          )}
          <button
            onClick={() => setShowSources((v) => !v)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink size={10} />
            {showSources ? 'Hide sources' : 'View sources'}
          </button>
        </div>

        {showSources && (
          <div className="mt-2 flex flex-wrap gap-2">
            {REFRESH_SOURCES.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors flex items-center gap-1"
              >
                {s.label}
                <ExternalLink size={9} />
              </a>
            ))}
          </div>
        )}

        {refreshing && refreshMsg && (
          <p className="text-xs text-primary mt-1 animate-pulse">{refreshMsg}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRefresh}
          disabled={isWorking}
          title={syncing ? 'Background sync in progress — UI stays usable' : 'Refresh leads from all sources'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all duration-150 disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 size={13} className="animate-spin text-primary" />
          ) : (
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          )}
          {syncing ? 'Syncing…' : refreshing ? 'Refreshing…' : 'Refresh Leads'}
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all duration-150"
        >
          <Download size={13} />
          Export
        </button>
        <a
          href="/lead-management"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-150 active:scale-95"
        >
          <Plus size={13} />
          Add Lead
        </a>
      </div>
    </div>
  );
}