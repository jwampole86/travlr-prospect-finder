'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, AreaChart, Area,  } from 'recharts';
import { TrendingUp, Target, Users, Filter, RefreshCw, ArrowUp, ArrowDown, Minus, Award, Flame, Zap, BarChart2,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface CloseRateRow {
  label: string;
  actual: number;
  predicted: number;
  delta: number;
  total: number;
  closed: number;
}

interface TimeframePoint {
  period: string;
  actual: number;
  predicted: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deltaColor(delta: number) {
  if (delta > 3) return 'text-emerald-600';
  if (delta < -3) return 'text-red-500';
  return 'text-amber-500';
}

function deltaBg(delta: number) {
  if (delta > 3) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (delta < -3) return 'bg-red-50 border-red-200 text-red-700';
  return 'bg-amber-50 border-amber-200 text-amber-700';
}

function TrendIcon({ v }: { v: number }) {
  if (v > 2) return <ArrowUp size={12} className="text-emerald-500" />;
  if (v < -2) return <ArrowDown size={12} className="text-red-500" />;
  return <Minus size={12} className="text-muted-foreground" />;
}

function KPICard({
  label, value, sub, delta, icon: Icon, iconBg, iconColor,
}: {
  label: string; value: string; sub?: string; delta?: number;
  icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={13} className={iconColor} />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground leading-none">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {delta !== undefined && <TrendIcon v={delta} />}
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConversionAnalyticsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'30d' | '60d' | '90d' | 'all'>('90d');
  const [groupBy, setGroupBy] = useState<'source' | 'band' | 'agent'>('band');
  const [bySource, setBySource] = useState<CloseRateRow[]>([]);
  const [byBand, setByBand] = useState<CloseRateRow[]>([]);
  const [byAgent, setByAgent] = useState<CloseRateRow[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeframePoint[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalClosed, setTotalClosed] = useState(0);
  const [overallActual, setOverallActual] = useState(0);
  const [overallPredicted, setOverallPredicted] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('id, source, confidence_band, assigned_agent, pipeline_status, prospect_score, created_at');

      if (timeframe !== 'all') {
        const days = timeframe === '30d' ? 30 : timeframe === '60d' ? 60 : 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        query = query.gte('created_at', cutoff.toISOString());
      }

      const { data: leads } = await query.limit(5000);
      const all = leads || [];

      setTotalLeads(all.length);
      const closed = all.filter(l => l.pipeline_status === 'signed').length;
      setTotalClosed(closed);
      const overallActualRate = all.length > 0 ? (closed / all.length) * 100 : 0;
      setOverallActual(Math.round(overallActualRate * 10) / 10);
      const avgScore = all.length > 0 ? all.reduce((s, l) => s + (l.prospect_score || 0), 0) / all.length : 0;
      setOverallPredicted(Math.round(avgScore * 0.4 * 10) / 10);

      // By source
      const sourceMap = new Map<string, { total: number; closed: number; scores: number[] }>();
      for (const l of all) {
        const key = l.source || 'Unknown';
        if (!sourceMap.has(key)) sourceMap.set(key, { total: 0, closed: 0, scores: [] });
        const e = sourceMap.get(key)!;
        e.total++;
        if (l.pipeline_status === 'signed') e.closed++;
        e.scores.push(l.prospect_score || 0);
      }
      const sourceRows: CloseRateRow[] = Array.from(sourceMap.entries())
        .filter(([, v]) => v.total >= 3)
        .map(([label, v]) => {
          const actual = v.total > 0 ? (v.closed / v.total) * 100 : 0;
          const avgS = v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
          const predicted = avgS * 0.4;
          return {
            label,
            actual: Math.round(actual * 10) / 10,
            predicted: Math.round(predicted * 10) / 10,
            delta: Math.round((actual - predicted) * 10) / 10,
            total: v.total,
            closed: v.closed,
          };
        })
        .sort((a, b) => b.actual - a.actual)
        .slice(0, 12);
      setBySource(sourceRows);

      // By band
      const bandMap = new Map<string, { total: number; closed: number; scores: number[] }>();
      for (const l of all) {
        const key = l.confidence_band || (l.prospect_score >= 80 ? 'hot' : l.prospect_score >= 60 ? 'warm' : 'cold');
        if (!bandMap.has(key)) bandMap.set(key, { total: 0, closed: 0, scores: [] });
        const e = bandMap.get(key)!;
        e.total++;
        if (l.pipeline_status === 'signed') e.closed++;
        e.scores.push(l.prospect_score || 0);
      }
      const bandOrder = ['hot', 'warm', 'cold'];
      const bandRows: CloseRateRow[] = Array.from(bandMap.entries())
        .map(([label, v]) => {
          const actual = v.total > 0 ? (v.closed / v.total) * 100 : 0;
          const avgS = v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
          const predicted = avgS * 0.4;
          return {
            label,
            actual: Math.round(actual * 10) / 10,
            predicted: Math.round(predicted * 10) / 10,
            delta: Math.round((actual - predicted) * 10) / 10,
            total: v.total,
            closed: v.closed,
          };
        })
        .sort((a, b) => bandOrder.indexOf(a.label) - bandOrder.indexOf(b.label));
      setByBand(bandRows);

      // By agent
      const agentMap = new Map<string, { total: number; closed: number; scores: number[] }>();
      for (const l of all) {
        const key = l.assigned_agent || 'Unassigned';
        if (key === 'Unassigned') continue;
        if (!agentMap.has(key)) agentMap.set(key, { total: 0, closed: 0, scores: [] });
        const e = agentMap.get(key)!;
        e.total++;
        if (l.pipeline_status === 'signed') e.closed++;
        e.scores.push(l.prospect_score || 0);
      }
      const agentRows: CloseRateRow[] = Array.from(agentMap.entries())
        .filter(([, v]) => v.total >= 2)
        .map(([label, v]) => {
          const actual = v.total > 0 ? (v.closed / v.total) * 100 : 0;
          const avgS = v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
          const predicted = avgS * 0.4;
          return {
            label,
            actual: Math.round(actual * 10) / 10,
            predicted: Math.round(predicted * 10) / 10,
            delta: Math.round((actual - predicted) * 10) / 10,
            total: v.total,
            closed: v.closed,
          };
        })
        .sort((a, b) => b.actual - a.actual)
        .slice(0, 10);
      setByAgent(agentRows);

      // Time series: weekly actual vs predicted
      const weekMap = new Map<string, { total: number; closed: number; scores: number[] }>();
      for (const l of all) {
        const d = new Date(l.created_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        if (!weekMap.has(key)) weekMap.set(key, { total: 0, closed: 0, scores: [] });
        const e = weekMap.get(key)!;
        e.total++;
        if (l.pipeline_status === 'signed') e.closed++;
        e.scores.push(l.prospect_score || 0);
      }
      const timeSeries: TimeframePoint[] = Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([period, v]) => {
          const actual = v.total > 0 ? (v.closed / v.total) * 100 : 0;
          const avgS = v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
          return {
            period: period.slice(5),
            actual: Math.round(actual * 10) / 10,
            predicted: Math.round(avgS * 0.4 * 10) / 10,
          };
        });
      setTimeSeriesData(timeSeries);
    } catch (err) {
      console.error('ConversionAnalytics load error', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, timeframe]);

  useEffect(() => { load(); }, [load]);

  const activeRows = groupBy === 'source' ? bySource : groupBy === 'band' ? byBand : byAgent;
  const scoreDelta = overallActual - overallPredicted;

  const bandLabelColor = (label: string) => {
    if (label === 'hot') return '#dc2626';
    if (label === 'warm') return '#d97706';
    return '#6366f1';
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 size={24} className="text-primary" />
              Conversion Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Actual close rates vs predicted band scores · Identify top-performing sources, bands, and agents
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Timeframe */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['30d', '60d', '90d', 'all'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    timeframe === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'all' ? 'All Time' : t}
                </button>
              ))}
            </div>
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

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Total Leads" value={totalLeads.toLocaleString()}
            sub={`in ${timeframe === 'all' ? 'all time' : timeframe}`}
            icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600"
          />
          <KPICard
            label="Total Closed" value={totalClosed.toLocaleString()}
            sub="pipeline_status = signed"
            icon={Award} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          />
          <KPICard
            label="Actual Close Rate" value={`${overallActual}%`}
            sub="closed / total leads"
            delta={scoreDelta}
            icon={Target} iconBg="bg-amber-50" iconColor="text-amber-600"
          />
          <KPICard
            label="Predicted Rate" value={`${overallPredicted}%`}
            sub={`delta: ${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)}%`}
            delta={scoreDelta}
            icon={TrendingUp} iconBg="bg-purple-50" iconColor="text-purple-600"
          />
        </div>

        {/* Time Series Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" />
            Weekly Actual vs Predicted Close Rate
          </h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : timeSeriesData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No time series data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="predictedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} fill="url(#actualGrad)" name="Actual Close %" />
                <Area type="monotone" dataKey="predicted" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" fill="url(#predictedGrad)" name="Predicted %" />
                <ReferenceLine y={overallActual} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Group-By Breakdown */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Filter size={14} className="text-primary" />
              Close Rate Breakdown
            </h2>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['band', 'source', 'agent'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                    groupBy === g ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  By {g}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading breakdown...</div>
          ) : activeRows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No data available for this grouping. Leads need pipeline_status = &apos;signed&apos; for close rate calculation.
            </div>
          ) : (
            <>
              {/* Bar Chart */}
              <div className="p-5 border-b border-border">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={activeRows} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v}
                    />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v}%`, name]}
                      labelFormatter={l => `${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="actual" name="Actual Close %" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="predicted" name="Predicted %" fill="#6366f1" radius={[3, 3, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground capitalize">{groupBy}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Closed</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-600">Actual %</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-indigo-500">Predicted %</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Delta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row, i) => (
                      <tr key={row.label} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {i < 3 && <Award size={12} className={i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-orange-500'} />}
                            {groupBy === 'band' && (
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ background: bandLabelColor(row.label) }}
                              />
                            )}
                            <span className="font-medium text-foreground text-xs capitalize">{row.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">{row.total.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600">{row.closed}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-sm text-foreground">{row.actual}%</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">{row.predicted}%</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${deltaColor(row.delta)}`}>
                            {row.delta > 0 ? '+' : ''}{row.delta}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deltaBg(row.delta)}`}>
                            {row.delta > 3 ? 'Outperforming' : row.delta < -3 ? 'Underperforming' : 'On Target'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Band Confidence Insight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {byBand.map(row => (
            <div
              key={row.label}
              className={`rounded-xl border p-4 ${
                row.label === 'hot' ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' :
                row.label === 'warm'? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' : 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {row.label === 'hot' && <Flame size={16} className="text-red-600" />}
                {row.label === 'warm' && <Zap size={16} className="text-amber-600" />}
                {row.label === 'cold' && <Target size={16} className="text-indigo-600" />}
                <span className={`text-sm font-bold uppercase ${
                  row.label === 'hot' ? 'text-red-700' : row.label === 'warm' ? 'text-amber-700' : 'text-indigo-700'
                }`}>{row.label} Band</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Leads</span>
                  <span className="font-semibold text-foreground">{row.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Actual Close</span>
                  <span className="font-bold text-foreground">{row.actual}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Predicted</span>
                  <span className="text-muted-foreground">{row.predicted}%</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-current/10">
                  <span className="text-muted-foreground">Score Delta</span>
                  <span className={`font-bold ${deltaColor(row.delta)}`}>
                    {row.delta > 0 ? '+' : ''}{row.delta}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
