'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { linkViabilityService, type SourceStats } from '@/lib/services/linkViabilityService';
import { Activity, AlertTriangle, BarChart2, CheckCircle2, Clock, DollarSign, RefreshCw, Search, Shield, TrendingDown, Zap, XCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


const SOURCE_COLORS: Record<string, string> = {
  trulia: 'bg-green-100 text-green-700',
  rentcom: 'bg-blue-100 text-blue-700',
  realtorcom: 'bg-red-100 text-red-700',
  padmapper: 'bg-purple-100 text-purple-700',
  apartmentlist: 'bg-orange-100 text-orange-700',
  dwellsy: 'bg-teal-100 text-teal-700',
  zillow: 'bg-sky-100 text-sky-700',
  hotpads: 'bg-pink-100 text-pink-700',
  craigslist: 'bg-violet-100 text-violet-700',
  apartments: 'bg-cyan-100 text-cyan-700',
  str_permits: 'bg-amber-100 text-amber-700',
};

const SOURCE_ABBR: Record<string, string> = {
  trulia: 'TR', rentcom: 'RC', realtorcom: 'RL', padmapper: 'PM',
  apartmentlist: 'AL', dwellsy: 'DW', zillow: 'Z', hotpads: 'HP',
  craigslist: 'CL', apartments: 'AP', str_permits: 'SP',
};

function LinkStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    Active: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
    Stale: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle size={10} /> },
    Reposted: { cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: <RefreshCw size={10} /> },
    Unavailable: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle size={10} /> },
  };
  const { cls, icon } = map[status] || map.Active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {icon}{status}
    </span>
  );
}

function StaleBar({ ratio }: { ratio: number }) {
  const color = ratio > 30 ? 'bg-red-500' : ratio > 15 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(ratio, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">{ratio}%</span>
    </div>
  );
}

function EnrichmentBar({ stage }: { stage: number }) {
  const pct = Math.round((stage / 2) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">
        {stage === 0 ? 'S0' : stage < 1 ? 'S1' : stage < 2 ? 'S2' : 'S3'}
      </span>
    </div>
  );
}

export default function SourceIntelligencePage() {
  const [stats, setStats] = useState<SourceStats[]>([]);
  const [craigslistStats, setCraigslistStats] = useState<{
    total: number; active: number; stale: number; reposted: number; snapshotOnly: number; staleRatio: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'craigslist' | 'costs'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sourceStats, clStats] = await Promise.all([
        linkViabilityService.getSourceStats(),
        linkViabilityService.getCraigslistStats(),
      ]);
      setStats(sourceStats);
      setCraigslistStats(clStats);
    } catch {
      toast.error('Failed to load source intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const result = await linkViabilityService.runViabilityCheck();
      setLastRun(new Date().toISOString());
      toast.success(`Link check complete — ${result.checked} checked, ${result.updated} updated, ${result.errors} errors`);
      await fetchData();
    } catch {
      toast.error('Link viability check failed');
    } finally {
      setRunning(false);
    }
  };

  const filteredStats = stats.filter(s =>
    !searchQuery || s.source_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLeads = stats.reduce((s, x) => s + x.total_leads, 0);
  const totalActive = stats.reduce((s, x) => s + x.active_links, 0);
  const totalStale = stats.reduce((s, x) => s + x.stale_links, 0);
  const avgDedup = stats.length > 0 ? Math.round(stats.reduce((s, x) => s + x.dedup_rate, 0) / stats.length) : 0;
  const totalCostPerLead = stats.length > 0
    ? (stats.reduce((s, x) => s + x.cost_per_lead * x.total_leads, 0) / Math.max(totalLeads, 1))
    : 0;

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Shield size={20} className="text-primary" />
              Source Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Per-source sync health, link viability, dedup rates, and cost analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastRun && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={11} /> Last run: {formatDate(lastRun)}
              </span>
            )}
            <button
              onClick={handleRunCheck}
              disabled={running}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {running ? 'Running...' : 'Run Link Check'}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Leads', value: totalLeads.toLocaleString(), sub: 'across all sources', icon: Activity, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Active Links', value: totalActive.toLocaleString(), sub: `${totalLeads > 0 ? Math.round((totalActive / totalLeads) * 100) : 0}% of total`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Stale / Dead', value: totalStale.toLocaleString(), sub: `${totalLeads > 0 ? Math.round((totalStale / totalLeads) * 100) : 0}% stale rate`, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Avg Dedup Rate', value: `${avgDedup}%`, sub: 'duplicates removed', icon: BarChart2, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon size={13} className={color} />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'overview', label: 'Source Overview', icon: BarChart2 },
            { key: 'craigslist', label: 'Craigslist Monitor', icon: AlertTriangle },
            { key: 'costs', label: 'Cost-to-Lead', icon: DollarSign },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter sources..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={20} className="animate-spin text-primary" />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Source</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Leads</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-[120px]">Stale Ratio</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-[120px]">Avg Enrichment</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Dedup Rate</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Last Run</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Success / Errors</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Link Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredStats.map((s) => (
                        <tr key={s.source_key} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${SOURCE_COLORS[s.source_key] || 'bg-muted text-muted-foreground'}`}>
                                {SOURCE_ABBR[s.source_key] || s.source_key.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium text-foreground text-xs">{s.source_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">{s.total_leads.toLocaleString()}</td>
                          <td className="px-4 py-3"><StaleBar ratio={s.stale_ratio} /></td>
                          <td className="px-4 py-3"><EnrichmentBar stage={s.avg_enrichment_stage} /></td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-semibold ${s.dedup_rate > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {s.dedup_rate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(s.last_run_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs text-emerald-600 font-medium">{s.last_run_success}</span>
                            <span className="text-xs text-muted-foreground mx-1">/</span>
                            <span className={`text-xs font-medium ${s.last_run_errors > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {s.last_run_errors}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {s.active_links > 0 && <LinkStatusBadge status="Active" />}
                              {s.stale_links > 0 && <LinkStatusBadge status="Stale" />}
                              {s.reposted_links > 0 && <LinkStatusBadge status="Reposted" />}
                              {s.unavailable_links > 0 && <LinkStatusBadge status="Unavailable" />}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredStats.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                            No sources found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Craigslist Monitor Tab */}
        {activeTab === 'craigslist' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Craigslist Volatility Notice</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Craigslist listings expire after ~30–45 days and are frequently reposted under new URLs.
                  The system snapshots listing content at import time and attempts automated re-matching when links go stale.
                  Legal review of Craigslist ToS is required before enabling automated re-check scraping in production.
                </p>
              </div>
            </div>

            {craigslistStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total CL Leads', value: craigslistStats.total, color: 'text-foreground', bg: 'bg-muted/50' },
                  { label: 'Active', value: craigslistStats.active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { label: 'Stale', value: craigslistStats.stale, color: 'text-amber-700', bg: 'bg-amber-50' },
                  { label: 'Reposted', value: craigslistStats.reposted, color: 'text-blue-700', bg: 'bg-blue-50' },
                  { label: 'Snapshot Only', value: craigslistStats.snapshotOnly, color: 'text-muted-foreground', bg: 'bg-muted/50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} border border-border rounded-xl p-4`}>
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingDown size={15} className="text-amber-600" />
                Stale Link Ratio — Craigslist vs All Sources
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Craigslist', ratio: craigslistStats?.staleRatio || 0, highlight: true },
                  ...stats.filter(s => s.source_key !== 'craigslist').map(s => ({ label: s.source_name, ratio: s.stale_ratio, highlight: false })),
                ].map(({ label, ratio, highlight }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`text-xs w-28 shrink-0 ${highlight ? 'font-semibold text-violet-700' : 'text-muted-foreground'}`}>
                      {label}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${highlight ? 'bg-violet-500' : ratio > 20 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(ratio, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-8 text-right ${highlight ? 'text-violet-700' : ratio > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {ratio}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Info size={14} className="text-primary" />
                Link Status Definitions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { status: 'Active', desc: 'Live link confirmed working — listing is accessible on Craigslist' },
                  { status: 'Stale', desc: 'Link died, re-match job has not run yet or did not find a confident match' },
                  { status: 'Reposted', desc: 'Link died but an auto re-match found a likely new post (agent should spot-check)' },
                  { status: 'Unavailable', desc: 'No live link available; stored snapshot content is still viewable in lead detail' },
                ].map(({ status, desc }) => (
                  <div key={status} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                    <LinkStatusBadge status={status} />
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cost-to-Lead Tab */}
        {activeTab === 'costs' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <DollarSign size={16} className="text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Cost-per-lead estimates are based on provider pricing tiers and average records imported per source.
                Actual costs depend on your negotiated rates with each data provider.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Cost-to-Lead by Source</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Estimated cost per imported lead record</p>
              </div>
              <div className="divide-y divide-border">
                {[...stats]
                  .sort((a, b) => b.cost_per_lead - a.cost_per_lead)
                  .map((s) => {
                    const totalCost = s.cost_per_lead * s.total_leads;
                    const maxCost = Math.max(...stats.map(x => x.cost_per_lead * x.total_leads), 1);
                    const barWidth = Math.round((totalCost / maxCost) * 100);
                    return (
                      <div key={s.source_key} className="px-5 py-4 flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${SOURCE_COLORS[s.source_key] || 'bg-muted text-muted-foreground'}`}>
                          {SOURCE_ABBR[s.source_key] || s.source_key.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground">{s.source_name}</span>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground">${s.cost_per_lead.toFixed(2)}/lead</span>
                              <span className="font-semibold text-foreground">${totalCost.toFixed(0)} total</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/70 transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">{s.total_leads.toLocaleString()} leads</span>
                            <span className="text-[10px] text-muted-foreground">{s.dedup_rate}% dedup rate</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Blended avg cost-per-lead</span>
                <span className="text-sm font-bold text-primary">${totalCostPerLead.toFixed(3)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
