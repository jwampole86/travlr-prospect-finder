'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,  } from 'recharts';
import { Shield, RefreshCw, AlertTriangle, CheckCircle2, Database, Activity, TrendingDown, TrendingUp, Clock, Zap, ChevronDown, ChevronUp, Flame, Minus,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceFreshness {
  source: string;
  totalLeads: number;
  uniqueLeads: number;
  duplicateCount: number;
  dupRate: number;
  lastSyncAt: string | null;
  freshnessHours: number;
  status: 'fresh' | 'stale' | 'critical';
}

interface DedupHealthMetric {
  label: string;
  value: string | number;
  sub: string;
  trend: 'up' | 'down' | 'flat';
  good: boolean;
  icon: React.ElementType;
  color: string;
}

interface RegressionAlert {
  id: string;
  detectedAt: string;
  source: string;
  type: 'new_duplicate' | 'low_quality' | 'cross_market';
  address: string;
  city: string;
  state: string;
  score: number;
  status: 'open' | 'resolved' | 'ignored';
}

interface BandCount {
  band: string;
  count: number;
  color: string;
}

const COLORS = ['#10b981', '#f59e0b', '#6366f1', '#ef4444', '#8b5cf6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function freshnessLabel(hours: number): string {
  if (hours < 6) return '< 6h ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusColor(s: 'fresh' | 'stale' | 'critical') {
  if (s === 'fresh') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (s === 'stale') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DedupMonitorPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Metrics
  const [totalLeads, setTotalLeads] = useState(0);
  const [uniqueLeads, setUniqueLeads] = useState(0);
  const [totalDuplicates, setTotalDuplicates] = useState(0);
  const [sourceFreshness, setSourceFreshness] = useState<SourceFreshness[]>([]);
  const [bandCounts, setBandCounts] = useState<BandCount[]>([]);
  const [regressionAlerts, setRegressionAlerts] = useState<RegressionAlert[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; unique: number; dupes: number }[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Total leads
      const { count: total } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      // Unique leads by address fingerprint (count distinct address+city+state)
      const { data: allLeads } = await supabase
        .from('leads')
        .select('address, city, state, source, prospect_score, confidence_band, created_at, updated_at, is_synthetic')
        .order('created_at', { ascending: false })
        .limit(5000);

      const leads = allLeads || [];

      // Build unique fingerprint set
      const fpSet = new Set<string>();
      let dupCount = 0;
      for (const l of leads) {
        const fp = `${String(l.address || '').toLowerCase().trim()}|${String(l.city || '').toLowerCase().trim()}|${String(l.state || '').toLowerCase().trim()}`;
        if (fpSet.has(fp)) dupCount++;
        else fpSet.add(fp);
      }

      const uniqueCount = fpSet.size;
      setTotalLeads(total || leads.length);
      setUniqueLeads(uniqueCount);
      setTotalDuplicates(dupCount);

      // Per-source freshness
      const sourceMap = new Map<string, { total: number; fps: Set<string>; lastSync: string | null }>();
      for (const l of leads) {
        const src = l.source || 'Unknown';
        if (!sourceMap.has(src)) sourceMap.set(src, { total: 0, fps: new Set(), lastSync: null });
        const entry = sourceMap.get(src)!;
        entry.total++;
        const fp = `${String(l.address || '').toLowerCase().trim()}|${String(l.city || '').toLowerCase().trim()}|${String(l.state || '').toLowerCase().trim()}`;
        entry.fps.add(fp);
        const ts = l.updated_at || l.created_at;
        if (!entry.lastSync || ts > entry.lastSync) entry.lastSync = ts;
      }

      const now = Date.now();
      const freshness: SourceFreshness[] = Array.from(sourceMap.entries())
        .map(([source, d]) => {
          const uniqueCount = d.fps.size;
          const dupes = d.total - uniqueCount;
          const dupRate = d.total > 0 ? Math.round((dupes / d.total) * 100) : 0;
          const lastSyncMs = d.lastSync ? new Date(d.lastSync).getTime() : 0;
          const freshnessHours = lastSyncMs ? (now - lastSyncMs) / 3600000 : 999;
          const status: 'fresh' | 'stale' | 'critical' =
            freshnessHours < 24 ? 'fresh' : freshnessHours < 72 ? 'stale' : 'critical';
          return { source, totalLeads: d.total, uniqueLeads: uniqueCount, duplicateCount: dupes, dupRate, lastSyncAt: d.lastSync, freshnessHours, status };
        })
        .sort((a, b) => b.totalLeads - a.totalLeads)
        .slice(0, 15);

      setSourceFreshness(freshness);

      // Confidence band counts
      const bandMap: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
      for (const l of leads) {
        const band = l.confidence_band || (l.prospect_score >= 80 ? 'hot' : l.prospect_score >= 60 ? 'warm' : l.prospect_score >= 15 ? 'cold' : 'unknown');
        bandMap[band] = (bandMap[band] || 0) + 1;
      }
      setBandCounts([
        { band: 'Hot (80–92)', count: bandMap.hot || 0, color: '#ef4444' },
        { band: 'Warm (60–79)', count: bandMap.warm || 0, color: '#f59e0b' },
        { band: 'Cold (15–59)', count: bandMap.cold || 0, color: '#6366f1' },
        { band: 'Unknown', count: bandMap.unknown || 0, color: '#94a3b8' },
      ]);

      // Trend data (last 7 days simulated from created_at distribution)
      const dayBuckets: Record<string, { unique: Set<string>; total: number }> = {};
      for (const l of leads) {
        const day = (l.created_at || '').slice(0, 10);
        if (!day) continue;
        if (!dayBuckets[day]) dayBuckets[day] = { unique: new Set(), total: 0 };
        const fp = `${String(l.address || '').toLowerCase().trim()}|${String(l.city || '').toLowerCase().trim()}|${String(l.state || '').toLowerCase().trim()}`;
        dayBuckets[day].unique.add(fp);
        dayBuckets[day].total++;
      }
      const trend = Object.entries(dayBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-7)
        .map(([date, d]) => ({
          date: date.slice(5),
          unique: d.unique.size,
          dupes: d.total - d.unique.size,
        }));
      setTrendData(trend);

      // Regression alerts: leads with very low scores or potential new dupes
      const { data: recentLeads } = await supabase
        .from('leads')
        .select('id, address, city, state, source, prospect_score, created_at')
        .gte('created_at', new Date(Date.now() - 48 * 3600000).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      const recent = recentLeads || [];
      const alerts: RegressionAlert[] = [];
      const recentFps = new Map<string, string>();

      for (const l of recent) {
        const fp = `${String(l.address || '').toLowerCase().trim()}|${String(l.city || '').toLowerCase().trim()}|${String(l.state || '').toLowerCase().trim()}`;
        if (recentFps.has(fp)) {
          alerts.push({
            id: l.id,
            detectedAt: l.created_at,
            source: l.source || 'Unknown',
            type: 'new_duplicate',
            address: l.address,
            city: l.city,
            state: l.state,
            score: l.prospect_score || 0,
            status: 'open',
          });
        } else {
          recentFps.set(fp, l.id);
          if ((l.prospect_score || 0) < 20) {
            alerts.push({
              id: l.id,
              detectedAt: l.created_at,
              source: l.source || 'Unknown',
              type: 'low_quality',
              address: l.address,
              city: l.city,
              state: l.state,
              score: l.prospect_score || 0,
              status: 'open',
            });
          }
        }
      }
      setRegressionAlerts(alerts.slice(0, 20));
    } catch (err) {
      console.error('DedupMonitor load error', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const dupRate = totalLeads > 0 ? ((totalDuplicates / totalLeads) * 100).toFixed(1) : '0.0';
  const cleanRate = totalLeads > 0 ? (((totalLeads - totalDuplicates) / totalLeads) * 100).toFixed(1) : '100.0';

  const healthMetrics: DedupHealthMetric[] = [
    {
      label: 'Unique Leads',
      value: uniqueLeads.toLocaleString(),
      sub: `of ${totalLeads.toLocaleString()} total`,
      trend: 'up',
      good: true,
      icon: Database,
      color: 'text-emerald-600',
    },
    {
      label: 'Duplicate Rate',
      value: `${dupRate}%`,
      sub: `${totalDuplicates.toLocaleString()} dupes found`,
      trend: parseFloat(dupRate) > 5 ? 'up' : 'flat',
      good: parseFloat(dupRate) <= 5,
      icon: Shield,
      color: parseFloat(dupRate) > 5 ? 'text-red-500' : 'text-emerald-600',
    },
    {
      label: 'Data Clean Rate',
      value: `${cleanRate}%`,
      sub: 'address+city+state unique',
      trend: 'up',
      good: parseFloat(cleanRate) >= 95,
      icon: CheckCircle2,
      color: parseFloat(cleanRate) >= 95 ? 'text-emerald-600' : 'text-amber-500',
    },
    {
      label: 'Open Regressions',
      value: regressionAlerts.filter(a => a.status === 'open').length,
      sub: 'last 48h',
      trend: regressionAlerts.length > 0 ? 'up' : 'flat',
      good: regressionAlerts.filter(a => a.status === 'open').length === 0,
      icon: AlertTriangle,
      color: regressionAlerts.filter(a => a.status === 'open').length > 0 ? 'text-red-500' : 'text-emerald-600',
    },
    {
      label: 'Sources Monitored',
      value: sourceFreshness.length,
      sub: `${sourceFreshness.filter(s => s.status === 'fresh').length} fresh`,
      trend: 'flat',
      good: true,
      icon: Activity,
      color: 'text-blue-500',
    },
    {
      label: 'Hot Leads',
      value: bandCounts.find(b => b.band.startsWith('Hot'))?.count.toLocaleString() || '0',
      sub: 'score 80–92',
      trend: 'up',
      good: true,
      icon: Flame,
      color: 'text-red-500',
    },
  ];

  const openAlerts = regressionAlerts.filter(a => a.status === 'open');

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield size={24} className="text-primary" />
              Dedup Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unique lead counts · Data freshness by source · Sync health metrics · Regression detection
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} />
              Refreshed {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Health Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {healthMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Icon size={16} className={m.color} />
                  {m.trend === 'up' && m.good && <TrendingUp size={12} className="text-emerald-500" />}
                  {m.trend === 'up' && !m.good && <TrendingUp size={12} className="text-red-500" />}
                  {m.trend === 'down' && <TrendingDown size={12} className="text-amber-500" />}
                  {m.trend === 'flat' && <Minus size={12} className="text-muted-foreground" />}
                </div>
                <div>
                  <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs font-medium text-foreground">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground">{m.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Regression Alerts */}
        {openAlerts.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-600" />
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
                {openAlerts.length} Regression Alert{openAlerts.length > 1 ? 's' : ''} — Last 48h
              </h2>
              <span className="ml-auto text-xs text-red-500">Ops team notified</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {openAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-3 bg-white dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    alert.type === 'new_duplicate' ? 'bg-red-100 text-red-700' :
                    alert.type === 'low_quality'? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {alert.type === 'new_duplicate' ? 'DUPE' : alert.type === 'low_quality' ? 'LOW QUALITY' : 'CROSS-MARKET'}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {alert.address}, {alert.city}, {alert.state}
                  </span>
                  <span className="text-xs text-muted-foreground">{alert.source}</span>
                  <span className="text-xs font-semibold text-red-600">Score: {alert.score}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(alert.detectedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={14} className="text-primary" />
              Unique vs Duplicate Trend (7 days)
            </h2>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="unique" name="Unique" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="dupes" name="Duplicates" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {loading ? 'Loading trend data...' : 'No trend data available'}
              </div>
            )}
          </div>

          {/* Band Distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              Confidence Band Distribution
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={bandCounts.filter(b => b.count > 0)}
                  dataKey="count"
                  nameKey="band"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ band, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {bandCounts.map((entry, i) => (
                    <Cell key={entry.band} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source Freshness Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database size={14} className="text-primary" />
              Data Freshness by Source
            </h2>
            <span className="text-xs text-muted-foreground">{sourceFreshness.length} sources</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading source data...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Source</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Unique</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Dupes</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Dup Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Last Sync</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceFreshness.map((s) => (
                    <React.Fragment key={s.source}>
                      <tr
                        className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setExpandedSource(expandedSource === s.source ? null : s.source)}
                      >
                        <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2">
                          {expandedSource === s.source ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {s.source}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{s.totalLeads.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">{s.uniqueLeads.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-red-500">{s.duplicateCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${s.dupRate > 10 ? 'text-red-500' : s.dupRate > 5 ? 'text-amber-500' : 'text-emerald-600'}`}>
                            {s.dupRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                          {s.lastSyncAt ? freshnessLabel(s.freshnessHours) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(s.status)}`}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                      {expandedSource === s.source && (
                        <tr className="bg-muted/10">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="flex gap-6 text-xs text-muted-foreground">
                              <span>Dedup efficiency: <strong className="text-foreground">{s.totalLeads > 0 ? ((s.uniqueLeads / s.totalLeads) * 100).toFixed(1) : 100}%</strong></span>
                              <span>Last sync: <strong className="text-foreground">{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'N/A'}</strong></span>
                              <span>Freshness: <strong className={s.status === 'fresh' ? 'text-emerald-600' : s.status === 'stale' ? 'text-amber-600' : 'text-red-600'}>{s.status}</strong></span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {sourceFreshness.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        No source data available. Run a sync to populate metrics.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sync Health Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dedup Coverage</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Address+City+State</span>
                <span className="font-semibold text-emerald-600">Active</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cross-market check</span>
                <span className="font-semibold text-emerald-600">Active</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">DB unique constraint</span>
                <span className="font-semibold text-emerald-600">Enforced</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Regression detection</span>
                <span className="font-semibold text-emerald-600">48h window</span>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Index Health</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">address_fingerprint</span>
                <span className="font-semibold text-emerald-600">Unique</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">confidence_band</span>
                <span className="font-semibold text-emerald-600">Indexed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">prospect_score</span>
                <span className="font-semibold text-emerald-600">Indexed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">source + created_at</span>
                <span className="font-semibold text-emerald-600">Composite</span>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Cache Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">leads:all</span>
                <span className="font-semibold text-blue-500">5 min TTL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">leads:top</span>
                <span className="font-semibold text-blue-500">5 min TTL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stale-while-revalidate</span>
                <span className="font-semibold text-emerald-600">+60s grace</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dedup query cache</span>
                <span className="font-semibold text-emerald-600">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
