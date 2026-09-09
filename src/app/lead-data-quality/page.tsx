'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { CheckCircle, Clock, TrendingUp, TrendingDown, RefreshCw, Database, AlertOctagon, Layers, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceScore {
  source: string;
  reliability: number;
  totalLeads: number;
  enriched: number;
  stale: number;
  avgAge: number;
  trend: 'up' | 'down' | 'flat';
}

interface MissingFieldTrend {
  field: string;
  missing: number;
  pct: number;
  change: number;
}

interface FreshnessSegment {
  label: string;
  count: number;
  color: string;
}

interface CompletenessPoint {
  date: string;
  completeness: number;
  enriched: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const sourcesData: SourceScore[] = [
  { source: 'Zillow', reliability: 94, totalLeads: 1240, enriched: 1168, stale: 42, avgAge: 3.2, trend: 'up' },
  { source: 'Apartments.com', reliability: 88, totalLeads: 870, enriched: 748, stale: 91, avgAge: 6.1, trend: 'flat' },
  { source: 'Craigslist', reliability: 71, totalLeads: 530, enriched: 389, stale: 187, avgAge: 12.4, trend: 'down' },
  { source: 'Salesgenie', reliability: 82, totalLeads: 310, enriched: 268, stale: 55, avgAge: 8.7, trend: 'up' },
  { source: 'Dwellsy', reliability: 76, totalLeads: 195, enriched: 141, stale: 72, avgAge: 14.2, trend: 'down' },
  { source: 'Rent.com', reliability: 85, totalLeads: 220, enriched: 192, stale: 38, avgAge: 5.5, trend: 'flat' },
];

const missingFields: MissingFieldTrend[] = [
  { field: 'Owner Phone', missing: 412, pct: 13.2, change: +2.1 },
  { field: 'Owner Email', missing: 387, pct: 12.4, change: -0.8 },
  { field: 'Property Value', missing: 298, pct: 9.6, change: +1.4 },
  { field: 'Beds / Baths', missing: 201, pct: 6.5, change: -1.2 },
  { field: 'Regulation Status', missing: 178, pct: 5.7, change: +3.3 },
  { field: 'Last Contact Date', missing: 156, pct: 5.0, change: -0.4 },
  { field: 'Zip Code', missing: 89, pct: 2.9, change: +0.2 },
];

const freshnessSegments: FreshnessSegment[] = [
  { label: '< 24h', count: 487, color: '#22c55e' },
  { label: '1–3 days', count: 612, color: '#84cc16' },
  { label: '4–7 days', count: 431, color: '#eab308' },
  { label: '8–14 days', count: 298, color: '#f97316' },
  { label: '> 14 days', count: 537, color: '#ef4444' },
];

function genCompletenessHistory(): CompletenessPoint[] {
  const base = [72, 73, 74, 73, 75, 76, 77, 76, 78, 79, 80, 81, 80, 82, 83];
  return base.map((v, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (14 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      completeness: v,
      enriched: Math.round(v * 31.2),
    };
  });
}

const completenessHistory = genCompletenessHistory();

const staleLeads = [
  { id: 'L-1041', name: 'Marcus Webb', source: 'Craigslist', age: 22, completeness: 48, missing: ['Phone', 'Email', 'Value'] },
  { id: 'L-0887', name: 'Sandra Okafor', source: 'Dwellsy', age: 19, completeness: 55, missing: ['Phone', 'Regulation'] },
  { id: 'L-1203', name: 'Derek Huang', source: 'Craigslist', age: 17, completeness: 61, missing: ['Email', 'Value'] },
  { id: 'L-0654', name: 'Priya Nair', source: 'Apartments.com', age: 15, completeness: 67, missing: ['Phone'] },
  { id: 'L-1389', name: 'Tom Reeves', source: 'Dwellsy', age: 14, completeness: 59, missing: ['Email', 'Beds/Baths'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reliabilityColor(score: number) {
  if (score >= 90) return 'text-green-600 bg-green-50';
  if (score >= 75) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function reliabilityBar(score: number) {
  if (score >= 90) return 'bg-green-500';
  if (score >= 75) return 'bg-yellow-500';
  return 'bg-red-500';
}

function completenessColor(pct: number) {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadDataQualityPage() {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLastRefresh(new Date().toLocaleTimeString());
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastRefresh(new Date().toLocaleTimeString());
    }, 1200);
  };

  const totalLeads = sourcesData.reduce((s, r) => s + r.totalLeads, 0);
  const totalEnriched = sourcesData.reduce((s, r) => s + r.enriched, 0);
  const totalStale = sourcesData.reduce((s, r) => s + r.stale, 0);
  const overallCompleteness = Math.round((totalEnriched / totalLeads) * 100);
  const avgReliability = Math.round(sourcesData.reduce((s, r) => s + r.reliability, 0) / sourcesData.length);

  const filteredSources = sourceFilter === 'all' ? sourcesData : sourcesData.filter(s => s.source === sourceFilter);

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Lead Data Quality</h1>
              <p className="text-sm text-slate-500 mt-0.5">Monitor enrichment completeness, source reliability, freshness, and missing field trends</p>
            </div>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-slate-400">Refreshed {lastRefresh}</span>
              )}
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Overall Completeness', value: `${overallCompleteness}%`, sub: `${totalEnriched.toLocaleString()} / ${totalLeads.toLocaleString()} leads`, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Avg Source Reliability', value: `${avgReliability}%`, sub: `Across ${sourcesData.length} sources`, icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Stale Records', value: totalStale.toLocaleString(), sub: `> 14 days old`, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: 'Missing Field Alerts', value: missingFields.filter(f => f.change > 0).length.toString(), sub: 'Fields trending worse', icon: AlertOctagon, color: 'text-red-600', bg: 'bg-red-50' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <kpi.icon size={18} className={kpi.color} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Completeness Trend + Freshness Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Completeness Trend */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Enrichment Completeness — 15 Day Trend</h2>
                  <p className="text-xs text-slate-400 mt-0.5">% of leads with all required fields populated</p>
                </div>
                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">+11% this month</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={completenessHistory}>
                  <defs>
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[65, 90]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: number) => [`${v}%`, 'Completeness']}
                  />
                  <Area type="monotone" dataKey="completeness" stroke="#3b82f6" strokeWidth={2} fill="url(#compGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Freshness Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Data Freshness Age</h2>
              <p className="text-xs text-slate-400 mb-4">Days since last enrichment update</p>
              <div className="space-y-3">
                {freshnessSegments.map(seg => {
                  const pct = Math.round((seg.count / totalLeads) * 100);
                  return (
                    <div key={seg.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-600">{seg.label}</span>
                        <span className="text-xs font-medium text-slate-700">{seg.count.toLocaleString()} <span className="text-slate-400">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: seg.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-red-600">{freshnessSegments.find(s => s.label === '> 14 days')?.count}</span> records are stale and may waste agent time
                </p>
              </div>
            </div>
          </div>

          {/* Source Reliability Table */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Source Reliability Scores</h2>
                <p className="text-xs text-slate-400 mt-0.5">Reliability = enrichment success rate × data accuracy signal</p>
              </div>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none"
                >
                  <option value="all">All Sources</option>
                  {sourcesData.map(s => <option key={s.source} value={s.source}>{s.source}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium">Reliability</th>
                    <th className="text-right px-4 py-3 font-medium">Total Leads</th>
                    <th className="text-right px-4 py-3 font-medium">Enriched</th>
                    <th className="text-right px-4 py-3 font-medium">Stale</th>
                    <th className="text-right px-4 py-3 font-medium">Avg Age</th>
                    <th className="text-center px-4 py-3 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSources.map(row => (
                    <tr key={row.source} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-800">{row.source}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-20">
                            <div className={`h-full rounded-full ${reliabilityBar(row.reliability)}`} style={{ width: `${row.reliability}%` }} />
                          </div>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${reliabilityColor(row.reliability)}`}>{row.reliability}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.totalLeads.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-slate-700">{row.enriched.toLocaleString()}</span>
                        <span className="text-slate-400 text-xs ml-1">({Math.round(row.enriched / row.totalLeads * 100)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium ${row.stale > 100 ? 'text-red-600' : row.stale > 50 ? 'text-yellow-600' : 'text-slate-600'}`}>{row.stale}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.avgAge}d</td>
                      <td className="px-4 py-3 text-center">
                        {row.trend === 'up' && <TrendingUp size={14} className="text-green-500 inline" />}
                        {row.trend === 'down' && <TrendingDown size={14} className="text-red-500 inline" />}
                        {row.trend === 'flat' && <span className="text-slate-400 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Missing Field Trends + Stale Records */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Missing Field Trends */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Missing Field Trends</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Fields most commonly absent — week-over-week change</p>
                </div>
                <Layers size={16} className="text-slate-400" />
              </div>
              <div className="space-y-3">
                {missingFields.map(f => (
                  <div key={f.field} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-700">{f.field}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{f.missing.toLocaleString()} missing ({f.pct}%)</span>
                          <span className={`text-xs font-semibold ${f.change > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {f.change > 0 ? `+${f.change}%` : `${f.change}%`}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${f.pct > 10 ? 'bg-red-400' : f.pct > 5 ? 'bg-yellow-400' : 'bg-slate-300'}`}
                          style={{ width: `${Math.min(f.pct * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stale / Incomplete Records */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Stale / Incomplete Records</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Leads agents should skip until re-enriched</p>
                </div>
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{staleLeads.length} flagged</span>
              </div>
              <div className="space-y-2">
                {staleLeads.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">{lead.name}</span>
                        <span className="text-xs text-slate-400">{lead.id}</span>
                        <span className="text-xs text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">{lead.source}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${completenessColor(lead.completeness)}`} style={{ width: `${lead.completeness}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">{lead.completeness}%</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-orange-500">
                        <Clock size={12} />
                        <span className="text-xs font-medium">{lead.age}d old</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1 justify-end">
                        {lead.missing.map(m => (
                          <span key={m} className="text-xs bg-red-50 text-red-500 px-1 py-0.5 rounded">{m}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
