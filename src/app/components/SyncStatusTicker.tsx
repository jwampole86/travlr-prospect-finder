'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, ExternalLink, Database } from 'lucide-react';
import { REFRESH_SOURCES, getLastRefreshTime } from '@/lib/services/leadsRefreshService';
import { createClient } from '@/lib/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { toast } from 'sonner';

interface SourceStatus {
  name: string;
  label: string;
  url: string;
  lastPull: Date | null;
  health: 'healthy' | 'stale' | 'failed' | 'unknown';
  retrying: boolean;
  dbStatus?: 'success' | 'partial' | 'failed' | null;
  dbLastSync?: Date | null;
}

const SOURCE_LAST_PULL_KEY = 'travlr_source_last_pull';

function loadSourcePulls(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(SOURCE_LAST_PULL_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveSourcePull(sourceName: string, date: Date) {
  if (typeof window === 'undefined') return;
  const pulls = loadSourcePulls();
  pulls[sourceName] = date.toISOString();
  localStorage.setItem(SOURCE_LAST_PULL_KEY, JSON.stringify(pulls));
}

function getHealth(
  lastPull: Date | null,
  dbStatus?: 'success' | 'partial' | 'failed' | null,
  leadsLastCreated?: Date | null
): SourceStatus['health'] {
  // DB sync_events status takes highest priority
  if (dbStatus === 'failed') return 'failed';
  if (dbStatus === 'success') return 'healthy';
  if (dbStatus === 'partial') return 'stale';

  // If we have leads from this source, derive health from most recent lead creation
  if (leadsLastCreated) {
    const diffHours = (Date.now() - leadsLastCreated.getTime()) / 3600000;
    if (diffHours < 25) return 'healthy';   // leads created within 25h → healthy
    if (diffHours < 72) return 'stale';     // 25–72h → stale
    return 'failed';
  }

  // Fall back to localStorage timestamp
  if (!lastPull) return 'unknown';
  const diffHours = (Date.now() - lastPull.getTime()) / 3600000;
  if (diffHours < 7) return 'healthy';
  if (diffHours < 24) return 'stale';
  return 'failed';
}

function formatPullTime(date: Date | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface Props {
  onLeadsRefreshed?: () => void;
}

export default function SyncStatusTicker({ onLeadsRefreshed }: Props) {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [portfolioLeadCount, setPortfolioLeadCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const { selectedPortfolio } = usePortfolio();
  const supabase = createClient();

  /**
   * Fetch the most recent sync_events per source from the DB.
   */
  const fetchDbSyncStatus = useCallback(async (): Promise<Record<string, { status: string; ts: Date }>> => {
    try {
      const { data } = await supabase
        .from('sync_events')
        .select('operation_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!data) return {};

      const bySource: Record<string, { status: string; ts: Date }> = {};
      for (const row of data) {
        const src = (row.operation_id as string) || '';
        if (!src) continue;
        const matchedSource = REFRESH_SOURCES.find(
          (s) => src.toLowerCase().includes(s.name.toLowerCase())
        );
        const key = matchedSource?.name || src;
        if (!bySource[key]) {
          bySource[key] = { status: row.status as string, ts: new Date(row.created_at as string) };
        }
      }
      return bySource;
    } catch {
      return {};
    }
  }, [supabase]);

  /**
   * Fetch the most recent lead created_at per source from the leads table.
   * This gives accurate freshness even when sync_events has no matching records.
   */
  const fetchLeadsLastCreatedBySource = useCallback(async (): Promise<Record<string, Date>> => {
    try {
      const results: Record<string, Date> = {};
      await Promise.all(
        REFRESH_SOURCES.map(async (s) => {
          const { data } = await supabase
            .from('leads')
            .select('created_at')
            .eq('source', s.name)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data?.created_at) {
            results[s.name] = new Date(data.created_at as string);
          }
        })
      );
      return results;
    } catch {
      return {};
    }
  }, [supabase]);

  const buildSources = useCallback(async () => {
    const pulls = loadSourcePulls();
    const globalLast = getLastRefreshTime();
    const [dbStatus, leadsLastCreated] = await Promise.all([
      fetchDbSyncStatus(),
      fetchLeadsLastCreatedBySource(),
    ]);

    return REFRESH_SOURCES.map((s) => {
      const rawDate = pulls[s.name] || (globalLast ? globalLast.toISOString() : null);
      const lastPull = rawDate ? new Date(rawDate) : null;
      const dbEntry = dbStatus[s.name];
      const dbSyncStatus = dbEntry
        ? (dbEntry.status as 'success' | 'partial' | 'failed')
        : null;
      const dbLastSync = dbEntry?.ts || null;
      const sourceLeadsLast = leadsLastCreated[s.name] || null;

      // Use DB last-sync time if more recent than localStorage
      const effectiveLastPull =
        dbLastSync && (!lastPull || dbLastSync > lastPull) ? dbLastSync : lastPull;

      // Use most recent of: dbLastSync, localStorage, leads created_at
      const displayTime =
        sourceLeadsLast && (!effectiveLastPull || sourceLeadsLast > effectiveLastPull)
          ? sourceLeadsLast
          : effectiveLastPull;

      return {
        name: s.name,
        label: s.label,
        url: s.url,
        lastPull: displayTime,
        health: getHealth(effectiveLastPull, dbSyncStatus, sourceLeadsLast),
        retrying: false, // always reset retrying on rebuild — never persist stuck state
        dbStatus: dbSyncStatus,
        dbLastSync: displayTime,
      };
    });
  }, [fetchDbSyncStatus, fetchLeadsLastCreatedBySource]);

  // Fetch lead count for the currently selected portfolio from the DB
  const fetchPortfolioLeadCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      if (selectedPortfolio.stateCode !== 'all') {
        query = query.eq('state', selectedPortfolio.stateCode);
      }

      const { count } = await query;
      setPortfolioLeadCount(count ?? 0);
    } catch {
      setPortfolioLeadCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [selectedPortfolio, supabase]);

  useEffect(() => {
    buildSources().then(setSources);
    const interval = setInterval(() => buildSources().then(setSources), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [buildSources]);

  useEffect(() => {
    fetchPortfolioLeadCount();
  }, [fetchPortfolioLeadCount]);

  useEffect(() => {
    const channel = supabase
      .channel('sync-ticker-leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        () => {
          fetchPortfolioLeadCount();
        }
      )
      .subscribe();

    const syncChannel = supabase
      .channel('sync-ticker-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_events' },
        () => {
          buildSources().then(setSources);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(syncChannel);
    };
  }, [supabase, fetchPortfolioLeadCount, buildSources]);

  async function handleRetry(sourceName: string) {
    setSources((prev) =>
      prev.map((s) => (s.name === sourceName ? { ...s, retrying: true } : s))
    );

    toast.loading(`Retrying ${sourceName}…`, { id: `retry-${sourceName}` });

    try {
      const response = await fetch('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: selectedPortfolio.stateCode === 'all' ? 'all' : selectedPortfolio.label,
          sync_run_id: crypto.randomUUID(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        throw new Error(result.message || result.error || `Sync failed (${response.status})`);
      }
      const now = new Date();
      saveSourcePull(sourceName, now);

      setSources((prev) =>
        prev.map((s) =>
          s.name === sourceName
            ? { ...s, retrying: false, lastPull: now, health: 'healthy' }
            : s
        )
      );

      toast.success(`${sourceName} sync complete — ${result.total_leads_inserted ?? 0} new leads`, { id: `retry-${sourceName}` });
      onLeadsRefreshed?.();
      fetchPortfolioLeadCount();
    } catch {
      setSources((prev) =>
        prev.map((s) => (s.name === sourceName ? { ...s, retrying: false, health: 'failed' } : s))
      );
      toast.error(`${sourceName} retry failed`, { id: `retry-${sourceName}` });
    }
  }

  const failedCount = sources.filter((s) => s.health === 'failed').length;
  const staleCount = sources.filter((s) => s.health === 'stale').length;
  const healthyCount = sources.filter((s) => s.health === 'healthy').length;

  const portfolioHasNoLeads = portfolioLeadCount === 0;
  const portfolioLabel = selectedPortfolio.stateCode === 'all' ? 'All Portfolios' : selectedPortfolio.label;

  // Only degrade to "needs sync" if portfolio truly has zero leads
  const effectiveFailedCount = portfolioHasNoLeads ? 0 : failedCount;
  const effectiveStaleCount = portfolioHasNoLeads ? sources.length : staleCount;
  const effectiveHealthyCount = portfolioHasNoLeads ? 0 : healthyCount;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${effectiveFailedCount > 0 ? 'bg-danger' : effectiveStaleCount > 0 ? 'bg-warning' : 'bg-success'}`} />
            {(effectiveFailedCount > 0 || effectiveStaleCount > 0) && (
              <div className={`absolute inset-0 rounded-full animate-ping ${effectiveFailedCount > 0 ? 'bg-danger/40' : 'bg-warning/40'}`} />
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground">Data Source Sync</h3>
          {effectiveFailedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20 font-semibold">
              {effectiveFailedCount} failed
            </span>
          )}
          {effectiveStaleCount > 0 && effectiveFailedCount === 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 font-semibold">
              {portfolioHasNoLeads ? 'needs sync' : `${effectiveStaleCount} stale`}
            </span>
          )}
          {effectiveHealthyCount === sources.length && sources.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20 font-semibold">
              all healthy
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-success" />
            {effectiveHealthyCount} healthy
          </span>
          {effectiveStaleCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle size={11} className="text-warning" />
              {portfolioHasNoLeads ? 'no data' : `${effectiveStaleCount} stale`}
            </span>
          )}
          {effectiveFailedCount > 0 && (
            <span className="flex items-center gap-1">
              <XCircle size={11} className="text-danger" />
              {effectiveFailedCount} failed
            </span>
          )}
        </div>
      </div>

      {/* Portfolio lead count banner */}
      <div className={`flex items-center gap-2 px-4 py-2 border-b border-border text-[11px] ${
        portfolioHasNoLeads
          ? 'bg-warning/5 text-warning' :'bg-muted/20 text-muted-foreground'
      }`}>
        <Database size={11} className={portfolioHasNoLeads ? 'text-warning' : 'text-muted-foreground'} />
        <span className="font-medium">{portfolioLabel}:</span>
        {loadingCount ? (
          <span className="text-muted-foreground">loading…</span>
        ) : portfolioLeadCount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : portfolioHasNoLeads ? (
          <span className="font-semibold text-warning">0 leads — sync not yet run for this portfolio</span>
        ) : (
          <span className="font-semibold text-foreground">{portfolioLeadCount.toLocaleString()} leads synced</span>
        )}
      </div>

      {/* Source rows */}
      <div className="divide-y divide-border">
        {sources.map((source) => {
          const displayHealth = portfolioHasNoLeads ? 'stale' : source.health;
          const isHealthy = displayHealth === 'healthy';
          const isStale = displayHealth === 'stale';
          const isFailed = displayHealth === 'failed';
          const isUnknown = displayHealth === 'unknown';

          const displayTime = source.dbLastSync || source.lastPull;

          return (
            <div key={source.name} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              {/* Status icon */}
              <div className="shrink-0">
                {isHealthy && <CheckCircle2 size={14} className="text-success" />}
                {isStale && <AlertTriangle size={14} className="text-warning" />}
                {isFailed && <XCircle size={14} className="text-danger" />}
                {isUnknown && <Clock size={14} className="text-muted-foreground" />}
              </div>

              {/* Source info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{source.name}</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={`Open ${source.name}`}
                  >
                    <ExternalLink size={10} />
                  </a>
                  {source.dbStatus && (
                    <span className={`text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide ${
                      source.dbStatus === 'success' ? 'bg-success/10 text-success' :
                      source.dbStatus === 'partial' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                    }`}>
                      {source.dbStatus === 'success' ? 'synced' : source.dbStatus === 'partial' ? 'partial' : 'sync failed'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock size={9} />
                    Last pull:{' '}
                    <span className={`font-medium ${
                      isHealthy ? 'text-success' : isStale ?'text-warning': isFailed ?'text-danger': 'text-muted-foreground'
                    }`}>
                      {portfolioHasNoLeads ? 'Never (for this portfolio)' : formatPullTime(displayTime)}
                    </span>
                  </span>
                  {isFailed && !portfolioHasNoLeads && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger font-medium">
                      Sync failed
                    </span>
                  )}
                  {isStale && !portfolioHasNoLeads && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
                      Needs refresh
                    </span>
                  )}
                  {portfolioHasNoLeads && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
                      No data
                    </span>
                  )}
                </div>
              </div>

              {/* Health badge + Retry button */}
              <div className="shrink-0 flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                  isHealthy ? 'bg-success/10 text-success border-success/20' : isStale ?'bg-warning/10 text-warning border-warning/20': isFailed ?'bg-danger/10 text-danger border-danger/20': 'bg-muted text-muted-foreground border-border'
                }`}>
                  {portfolioHasNoLeads ? 'no data' : isUnknown ? 'not synced' : source.health}
                </span>

                {/* Only show Retry for genuinely stale/failed/unknown sources */}
                {(isFailed || isStale || isUnknown) && (
                  <button
                    onClick={() => handleRetry(source.name)}
                    disabled={source.retrying}
                    title={`Retry ${source.name}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground border border-border bg-card hover:bg-muted hover:text-foreground transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={source.retrying ? 'animate-spin' : ''} />
                    {source.retrying ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-muted/30 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          {portfolioHasNoLeads
            ? `Run Data Sync from the sidebar to populate ${portfolioLabel} · Sources auto-refresh every 1 hour`
            : 'Status reads from DB sync events · Sources auto-refresh every 1 hour · Click Retry to manually sync a stalled source'}
        </p>
      </div>
    </div>
  );
}
