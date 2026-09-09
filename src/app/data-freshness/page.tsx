'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, TrendingUp, TrendingDown, Database, Activity, Radio, Shield, BarChart2, Layers, AlertCircle, ChevronDown, ChevronUp, Bell, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncFailureAlert {
  id: string;
  portfolio: string;
  source_name: string;
  zone: string | null;
  error_message: string;
  occurred_at: string;
  resolved: boolean;
  severity: 'critical' | 'warning';
}

interface PortfolioBacklog {
  portfolio: string;
  stateCode: string;
  totalLeads: number;
  pendingEnrichment: number;
  pendingOutreach: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'failed' | 'partial' | 'pending' | null;
  syncErrorCount: number;
  activeSources: number;
  failedSources: number;
}

interface ZoneCoverage {
  portfolio: string;
  zone: string;
  source_name: string;
  status: 'active' | 'inactive' | 'unconfirmed' | 'deprioritized' | 'infeasible';
  last_synced_at: string | null;
  last_sync_status: string | null;
  leads_imported: number;
}

interface IngestDataPoint {
  hour: string;
  count: number;
  portfolio: string;
}

interface IngestTrend {
  portfolio: string;
  stateCode: string;
  hourlyData: { label: string; count: number }[];
  totalLast24h: number;
  avgPerHour: number;
  trend: 'up' | 'down' | 'flat';
  trendPct: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REAL_PORTFOLIOS = PORTFOLIOS.filter(p => p.key !== 'all');

const STATUS_COLORS = {
  success: 'text-green-600 bg-green-50 border-green-200',
  failed: 'text-red-600 bg-red-50 border-red-200',
  partial: 'text-amber-600 bg-amber-50 border-amber-200',
  pending: 'text-blue-600 bg-blue-50 border-blue-200',
  active: 'text-green-600 bg-green-50 border-green-200',
  inactive: 'text-gray-500 bg-gray-50 border-gray-200',
  unconfirmed: 'text-amber-600 bg-amber-50 border-amber-200',
  deprioritized: 'text-orange-600 bg-orange-50 border-orange-200',
  infeasible: 'text-red-600 bg-red-50 border-red-200',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MiniSparkline({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataFreshnessPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'alerts' | 'backlog' | 'coverage' | 'trends'>('alerts');
  const [alerts, setAlerts] = useState<SyncFailureAlert[]>([]);
  const [backlogs, setBacklogs] = useState<PortfolioBacklog[]>([]);
  const [coverage, setCoverage] = useState<ZoneCoverage[]>([]);
  const [trends, setTrends] = useState<IngestTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterPortfolio, setFilterPortfolio] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const liveRef = useRef(0);

  // ─── Load Alerts ───────────────────────────────────────────────────────────

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('app_notifications')
      .select('*')
      .in('type', ['sync_failure', 'sync_error', 'sync_stalled', 'batch_failure', 'batch_error'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      const mapped: SyncFailureAlert[] = data.map(row => ({
        id: row.id,
        portfolio: (row.metadata as Record<string, string>)?.portfolio || 'Unknown',
        source_name: (row.metadata as Record<string, string>)?.source_name || row.title || 'Unknown Source',
        zone: (row.metadata as Record<string, string>)?.zone || null,
        error_message: row.message || 'No details available',
        occurred_at: row.created_at,
        resolved: row.read || false,
        severity: row.type === 'batch_failure' || row.type === 'batch_error' ? 'critical' : 'warning',
      }));
      setAlerts(mapped);
    }
  }, [supabase]);

  // ─── Load Backlog ──────────────────────────────────────────────────────────

  const loadBacklogs = useCallback(async () => {
    const results: PortfolioBacklog[] = [];

    for (const p of REAL_PORTFOLIOS) {
      // Lead counts
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('portfolio', p.label);

      const { count: pendingEnrichment } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('portfolio', p.label)
        .in('enrichment_stage', [0, 1]);

      const { count: pendingOutreach } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('portfolio', p.label)
        .in('stage', ['New', 'Contacted']);

      // Sync coverage for this portfolio
      const { data: coverageData } = await supabase
        .from('sync_source_coverage')
        .select('status, last_synced_at, last_sync_status')
        .eq('portfolio', p.label);

      const activeSources = coverageData?.filter(c => c.status === 'active').length || 0;
      const failedSources = coverageData?.filter(c => c.last_sync_status === 'failed').length || 0;
      const lastSynced = coverageData
        ?.filter(c => c.last_synced_at)
        .sort((a, b) => new Date(b.last_synced_at!).getTime() - new Date(a.last_synced_at!).getTime())[0];

      // Recent sync errors
      const { count: syncErrorCount } = await supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .in('type', ['sync_failure', 'sync_error', 'batch_failure'])
        .eq('read', false)
        .filter('metadata->>portfolio', 'eq', p.label);

      results.push({
        portfolio: p.label,
        stateCode: p.stateCode,
        totalLeads: totalLeads || 0,
        pendingEnrichment: pendingEnrichment || 0,
        pendingOutreach: pendingOutreach || 0,
        lastSyncAt: lastSynced?.last_synced_at || null,
        lastSyncStatus: (lastSynced?.last_sync_status as PortfolioBacklog['lastSyncStatus']) || null,
        syncErrorCount: syncErrorCount || 0,
        activeSources,
        failedSources,
      });
    }

    setBacklogs(results);
  }, [supabase]);

  // ─── Load Zone Coverage ────────────────────────────────────────────────────

  const loadCoverage = useCallback(async () => {
    const { data } = await supabase
      .from('sync_source_coverage')
      .select('portfolio, zone, source_name, status, last_synced_at, last_sync_status, leads_imported')
      .order('portfolio', { ascending: true })
      .order('zone', { ascending: true });

    if (data) {
      setCoverage(data as ZoneCoverage[]);
    }
  }, [supabase]);

  // ─── Load Ingest Trends ────────────────────────────────────────────────────

  const loadTrends = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const trendResults: IngestTrend[] = [];

    for (const p of REAL_PORTFOLIOS) {
      const { data } = await supabase
        .from('leads')
        .select('created_at')
        .eq('portfolio', p.label)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      // Bucket into 6 4-hour windows
      const buckets: number[] = new Array(6).fill(0);
      const labels = ['20h', '16h', '12h', '8h', '4h', 'Now'];
      const now = Date.now();

      (data || []).forEach(row => {
        const age = now - new Date(row.created_at).getTime();
        const bucket = Math.min(5, Math.floor(age / (4 * 60 * 60 * 1000)));
        buckets[5 - bucket] = (buckets[5 - bucket] || 0) + 1;
      });

      const total = buckets.reduce((a, b) => a + b, 0);
      const avg = total / 6;
      const recent = buckets[5] + buckets[4];
      const older = buckets[1] + buckets[0];
      const trend = recent > older * 1.1 ? 'up' : recent < older * 0.9 ? 'down' : 'flat';
      const trendPct = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;

      trendResults.push({
        portfolio: p.label,
        stateCode: p.stateCode,
        hourlyData: labels.map((label, i) => ({ label, count: buckets[i] })),
        totalLast24h: total,
        avgPerHour: Math.round(avg),
        trend,
        trendPct: Math.abs(trendPct),
      });
    }

    setTrends(trendResults);
  }, [supabase]);

  // ─── Initial Load ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAlerts(), loadBacklogs(), loadCoverage(), loadTrends()]);
    setLoading(false);
  }, [loadAlerts, loadBacklogs, loadCoverage, loadTrends]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Real-time subscription ────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('data-freshness-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const type = row.type as string;
        if (['sync_failure', 'sync_error', 'batch_failure', 'batch_error'].includes(type)) {
          liveRef.current += 1;
          setLiveCount(liveRef.current);
          toast.error(`Sync alert: ${row.title || 'New sync failure detected'}`, { duration: 4000 });
          loadAlerts();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => {
        liveRef.current += 1;
        setLiveCount(c => c + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadAlerts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
    toast.success('Data freshness metrics refreshed');
  };

  const handleResolveAlert = async (id: string) => {
    await supabase.from('app_notifications').update({ read: true }).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    toast.success('Alert marked as resolved');
  };

  // ─── Filtered Data ─────────────────────────────────────────────────────────

  const filteredAlerts = alerts.filter(a => {
    if (filterPortfolio !== 'all' && a.portfolio !== filterPortfolio) return false;
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    return true;
  });

  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  // Group coverage by portfolio+zone
  const coverageByPortfolio = coverage.reduce<Record<string, ZoneCoverage[]>>((acc, row) => {
    const key = row.portfolio;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const filteredCoveragePortfolios = filterPortfolio === 'all'
    ? Object.keys(coverageByPortfolio)
    : Object.keys(coverageByPortfolio).filter(k => k === filterPortfolio);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity size={22} className="text-primary" />
              Data Freshness Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time sync health, backlog tracking, zone coverage, and ingest rate trends
            </p>
          </div>
          <div className="flex items-center gap-3">
            {liveCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <Radio size={10} className="animate-pulse" />
                {liveCount} live events
              </span>
            )}
            {unresolvedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full font-medium">
                <Bell size={10} />
                {unresolvedCount} unresolved
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle size={12} className="text-red-500" />
              Unresolved Alerts
            </div>
            <div className="text-2xl font-bold text-foreground">{unresolvedCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{alerts.filter(a => a.severity === 'critical' && !a.resolved).length} critical</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Database size={12} className="text-blue-500" />
              Total Backlog
            </div>
            <div className="text-2xl font-bold text-foreground">
              {backlogs.reduce((s, b) => s + b.pendingEnrichment + b.pendingOutreach, 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">across {backlogs.length} portfolios</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Shield size={12} className="text-amber-500" />
              Zone Coverage
            </div>
            <div className="text-2xl font-bold text-foreground">
              {coverage.length > 0
                ? `${Math.round((coverage.filter(c => c.status === 'active').length / coverage.length) * 100)}%`
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{coverage.filter(c => c.status === 'active').length} active zones</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp size={12} className="text-green-500" />
              Ingest (24h)
            </div>
            <div className="text-2xl font-bold text-foreground">
              {trends.reduce((s, t) => s + t.totalLast24h, 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">leads ingested today</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {[
            { key: 'alerts', label: 'Sync Failure Alerts', icon: AlertTriangle, badge: unresolvedCount },
            { key: 'backlog', label: 'Backlog by Portfolio', icon: Layers },
            { key: 'coverage', label: 'Zone Coverage', icon: Shield },
            { key: 'trends', label: 'Ingest Rate Trends', icon: TrendingUp },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.badge ? (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={filterPortfolio}
            onChange={e => setFilterPortfolio(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground"
          >
            <option value="all">All Portfolios</option>
            {REAL_PORTFOLIOS.map(p => (
              <option key={p.key} value={p.label}>{p.label}</option>
            ))}
          </select>
          {activeTab === 'alerts' && (
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          )}
        </div>

        {/* ── Tab: Sync Failure Alerts ── */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw size={18} className="animate-spin mr-2" /> Loading alerts…
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 size={32} className="text-green-500 mb-3" />
                <p className="font-medium">No sync failure alerts</p>
                <p className="text-sm mt-1">All sync sources are operating normally</p>
              </div>
            ) : (
              filteredAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`bg-card border rounded-xl p-4 flex items-start gap-4 ${
                    alert.resolved ? 'opacity-60' : alert.severity === 'critical' ? 'border-l-4 border-l-red-500 border-t border-r border-b border-border' : 'border-l-4 border-l-amber-400 border-t border-r border-b border-border'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${alert.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                    {alert.severity === 'critical'
                      ? <XCircle size={16} className="text-red-600" />
                      : <AlertTriangle size={16} className="text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-foreground">{alert.source_name}</span>
                      {alert.portfolio && (
                        <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{alert.portfolio}</span>
                      )}
                      {alert.zone && (
                        <span className="text-xs text-muted-foreground">Zone: {alert.zone}</span>
                      )}
                      {alert.resolved && (
                        <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Resolved</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground mt-1">{alert.error_message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(alert.occurred_at)}</p>
                  </div>
                  {!alert.resolved && (
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1 hover:bg-muted/40 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Backlog by Portfolio ── */}
        {activeTab === 'backlog' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw size={18} className="animate-spin mr-2" /> Loading backlog data…
              </div>
            ) : (
              backlogs
                .filter(b => filterPortfolio === 'all' || b.portfolio === filterPortfolio)
                .map(b => {
                  const backlogTotal = b.pendingEnrichment + b.pendingOutreach;
                  const backlogPct = b.totalLeads > 0 ? Math.round((backlogTotal / b.totalLeads) * 100) : 0;
                  return (
                    <div key={b.portfolio} className="bg-card border border-border rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{b.stateCode}</span>
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{b.portfolio}</div>
                            <div className="text-xs text-muted-foreground">{b.totalLeads.toLocaleString()} total leads</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {b.syncErrorCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              <AlertCircle size={10} />
                              {b.syncErrorCount} errors
                            </span>
                          )}
                          {b.lastSyncStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[b.lastSyncStatus]}`}>
                              {b.lastSyncStatus}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">Last sync: {timeAgo(b.lastSyncAt)}</span>
                        </div>
                      </div>

                      {/* Backlog bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span>Backlog ({backlogPct}% of total)</span>
                          <span>{backlogTotal.toLocaleString()} items</span>
                        </div>
                        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${backlogPct > 50 ? 'bg-red-500' : backlogPct > 25 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(backlogPct, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-muted/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-0.5">Pending Enrichment</div>
                          <div className="text-lg font-bold text-foreground">{b.pendingEnrichment.toLocaleString()}</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-0.5">Pending Outreach</div>
                          <div className="text-lg font-bold text-foreground">{b.pendingOutreach.toLocaleString()}</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-0.5">Active Sources</div>
                          <div className="text-lg font-bold text-green-600">{b.activeSources}</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-0.5">Failed Sources</div>
                          <div className={`text-lg font-bold ${b.failedSources > 0 ? 'text-red-600' : 'text-foreground'}`}>{b.failedSources}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* ── Tab: Zone Coverage ── */}
        {activeTab === 'coverage' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw size={18} className="animate-spin mr-2" /> Loading coverage data…
              </div>
            ) : filteredCoveragePortfolios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield size={32} className="mb-3" />
                <p className="font-medium">No coverage data available</p>
                <p className="text-sm mt-1">Run a sync to populate zone coverage</p>
              </div>
            ) : (
              filteredCoveragePortfolios.map(portfolio => {
                const zones = coverageByPortfolio[portfolio] || [];
                const activeCount = zones.filter(z => z.status === 'active').length;
                const failedCount = zones.filter(z => z.last_sync_status === 'failed').length;
                const isExpanded = expandedZone === portfolio;

                return (
                  <div key={portfolio} className="bg-card border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedZone(isExpanded ? null : portfolio)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Shield size={16} className="text-primary" />
                        <span className="font-semibold text-foreground">{portfolio}</span>
                        <span className="text-xs text-muted-foreground">{zones.length} sources</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">{activeCount} active</span>
                        {failedCount > 0 && (
                          <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{failedCount} failed</span>
                        )}
                        {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/20 text-xs text-muted-foreground">
                              <th className="text-left px-5 py-2.5 font-medium">Zone</th>
                              <th className="text-left px-4 py-2.5 font-medium">Source</th>
                              <th className="text-left px-4 py-2.5 font-medium">Status</th>
                              <th className="text-left px-4 py-2.5 font-medium">Last Sync</th>
                              <th className="text-right px-5 py-2.5 font-medium">Leads</th>
                            </tr>
                          </thead>
                          <tbody>
                            {zones.map((z, i) => (
                              <tr key={i} className="border-t border-border/50 hover:bg-muted/10">
                                <td className="px-5 py-2.5 text-foreground font-medium">{z.zone || 'Statewide'}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{z.source_name}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_COLORS[z.status] || 'text-muted-foreground bg-muted/20 border-border'}`}>
                                    {z.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                  <div>{timeAgo(z.last_synced_at)}</div>
                                  {z.last_sync_status && (
                                    <div className={`text-[10px] mt-0.5 ${z.last_sync_status === 'failed' ? 'text-red-500' : z.last_sync_status === 'success' ? 'text-green-600' : 'text-amber-600'}`}>
                                      {z.last_sync_status}
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-2.5 text-right font-medium text-foreground">{(z.leads_imported || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Tab: Ingest Rate Trends ── */}
        {activeTab === 'trends' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw size={18} className="animate-spin mr-2" /> Loading trend data…
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Lead ingest rate over the last 24 hours, bucketed into 4-hour windows</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trends
                    .filter(t => filterPortfolio === 'all' || t.portfolio === filterPortfolio)
                    .map(t => (
                      <div key={t.portfolio} className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-bold text-primary">{t.stateCode}</span>
                            </div>
                            <div>
                              <div className="font-semibold text-foreground text-sm">{t.portfolio}</div>
                              <div className="text-xs text-muted-foreground">{t.totalLast24h.toLocaleString()} leads in 24h</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {t.trend === 'up' && <TrendingUp size={14} className="text-green-600" />}
                            {t.trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
                            {t.trend === 'flat' && <Activity size={14} className="text-muted-foreground" />}
                            <span className={`text-xs font-medium ${t.trend === 'up' ? 'text-green-600' : t.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {t.trend === 'flat' ? 'Stable' : `${t.trendPct}% ${t.trend}`}
                            </span>
                          </div>
                        </div>

                        {/* Bar chart */}
                        <div className="flex items-end gap-1.5 h-20 mb-2">
                          {t.hourlyData.map((d, i) => {
                            const maxVal = Math.max(...t.hourlyData.map(x => x.count), 1);
                            const pct = (d.count / maxVal) * 100;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div className="w-full flex items-end justify-center" style={{ height: '64px' }}>
                                  <div
                                    className={`w-full rounded-t transition-all ${i === t.hourlyData.length - 1 ? 'bg-primary' : 'bg-primary/30'}`}
                                    style={{ height: `${Math.max(pct, 4)}%` }}
                                    title={`${d.count} leads`}
                                  />
                                </div>
                                <span className="text-[9px] text-muted-foreground">{d.label}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                          <span>Avg {t.avgPerHour}/4h window</span>
                          <span className="flex items-center gap-1">
                            <BarChart2 size={10} />
                            Peak: {Math.max(...t.hourlyData.map(d => d.count)).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
