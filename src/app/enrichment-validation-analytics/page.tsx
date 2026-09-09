'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, TrendingUp, BarChart2, Activity, Database, Clock, Zap, Shield, Eye, ChevronDown, ChevronUp,  } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  cacheHits: number;
  passRate: number;
  avgOverallConfidence: number;
  avgOwnershipConfidence: number;
  avgMarketCompConfidence: number;
}

interface SourceBreakdown {
  source: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgConfidence: number;
  cacheHits: number;
  lastValidated: string | null;
}

interface FieldConfidenceDist {
  field: string;
  avgConfidence: number;
  low: number;    // < 60
  medium: number; // 60-79
  high: number;   // >= 80
  total: number;
}

interface AnomalyEntry {
  anomaly: string;
  count: number;
}

interface TrendPoint {
  date: string;
  passed: number;
  failed: number;
  passRate: number;
  avgConfidence: number;
}

interface RecentEvent {
  id: string;
  lead_id: string;
  source: string;
  passed: boolean;
  overall_confidence: number | null;
  ownership_confidence: number | null;
  market_comp_confidence: number | null;
  recommendation: string | null;
  cache_hit: boolean;
  anomalies: string[] | null;
  created_at: string;
}

const CONF_COLORS = ['#ef4444', '#f59e0b', '#22c55e'];
const PASS_COLORS = ['#22c55e', '#ef4444'];
const SOURCE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#3b82f6'];

function confidenceBadge(score: number | null) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>;
  const cls = score >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : score >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{score}</span>;
}

function recBadge(rec: string | null) {
  if (!rec) return null;
  const map: Record<string, string> = {
    accept: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    reject: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[rec] ?? ''}`}>
      {rec}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnrichmentValidationAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('7d');
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown[]>([]);
  const [fieldDist, setFieldDist] = useState<FieldConfidenceDist[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEntry[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const supabase = createClient();

  const getStartDate = useCallback(() => {
    const now = new Date();
    if (timeframe === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (timeframe === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }, [timeframe]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = getStartDate();

      const { data: events } = await supabase
        .from('enrichment_validation_events')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      const rows = (events ?? []) as RecentEvent[];

      // ── Summary ───────────────────────────────────────────────────────────
      const total = rows.length;
      const passed = rows.filter(r => r.passed).length;
      const failed = total - passed;
      const cacheHits = rows.filter(r => r.cache_hit).length;
      const avgOverall = total > 0
        ? Math.round(rows.reduce((s, r) => s + (r.overall_confidence ?? 0), 0) / total)
        : 0;
      const avgOwnership = total > 0
        ? Math.round(rows.filter(r => r.ownership_confidence !== null).reduce((s, r) => s + (r.ownership_confidence ?? 0), 0) / Math.max(1, rows.filter(r => r.ownership_confidence !== null).length))
        : 0;
      const avgMarket = total > 0
        ? Math.round(rows.filter(r => r.market_comp_confidence !== null).reduce((s, r) => s + (r.market_comp_confidence ?? 0), 0) / Math.max(1, rows.filter(r => r.market_comp_confidence !== null).length))
        : 0;

      setSummary({
        total,
        passed,
        failed,
        cacheHits,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
        avgOverallConfidence: avgOverall,
        avgOwnershipConfidence: avgOwnership,
        avgMarketCompConfidence: avgMarket,
      });

      // ── Source breakdown ──────────────────────────────────────────────────
      const srcMap: Record<string, RecentEvent[]> = {};
      for (const r of rows) {
        const src = r.source || 'Unknown';
        if (!srcMap[src]) srcMap[src] = [];
        srcMap[src].push(r);
      }
      const srcBreakdown: SourceBreakdown[] = Object.entries(srcMap).map(([src, evts]) => {
        const t = evts.length;
        const p = evts.filter(e => e.passed).length;
        return {
          source: src,
          total: t,
          passed: p,
          failed: t - p,
          passRate: t > 0 ? Math.round((p / t) * 100) : 0,
          avgConfidence: t > 0 ? Math.round(evts.reduce((s, e) => s + (e.overall_confidence ?? 0), 0) / t) : 0,
          cacheHits: evts.filter(e => e.cache_hit).length,
          lastValidated: evts[0]?.created_at ?? null,
        };
      }).sort((a, b) => b.total - a.total);
      setSourceBreakdown(srcBreakdown);

      // ── Field confidence distribution ─────────────────────────────────────
      const fieldMap: Record<string, { total: number; sumConf: number; low: number; med: number; high: number }> = {};
      for (const r of rows) {
        const scores = (r.field_confidence_scores as any[]) ?? [];
        for (const fs of scores) {
          if (!fs?.field) continue;
          if (!fieldMap[fs.field]) fieldMap[fs.field] = { total: 0, sumConf: 0, low: 0, med: 0, high: 0 };
          const c = fs.confidence ?? 0;
          fieldMap[fs.field].total++;
          fieldMap[fs.field].sumConf += c;
          if (c < 60) fieldMap[fs.field].low++;
          else if (c < 80) fieldMap[fs.field].med++;
          else fieldMap[fs.field].high++;
        }
      }
      const fieldDistArr: FieldConfidenceDist[] = Object.entries(fieldMap).map(([field, d]) => ({
        field,
        avgConfidence: d.total > 0 ? Math.round(d.sumConf / d.total) : 0,
        low: d.low,
        medium: d.med,
        high: d.high,
        total: d.total,
      })).sort((a, b) => b.total - a.total).slice(0, 12);
      setFieldDist(fieldDistArr);

      // ── Anomaly frequency ─────────────────────────────────────────────────
      const anomalyMap: Record<string, number> = {};
      for (const r of rows) {
        for (const a of r.anomalies ?? []) {
          anomalyMap[a] = (anomalyMap[a] ?? 0) + 1;
        }
      }
      const anomalyArr: AnomalyEntry[] = Object.entries(anomalyMap)
        .map(([anomaly, count]) => ({ anomaly, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setAnomalies(anomalyArr);

      // ── Trend by day ──────────────────────────────────────────────────────
      const dayMap: Record<string, { passed: number; failed: number; sumConf: number; count: number }> = {};
      for (const r of rows) {
        const day = r.created_at.slice(0, 10);
        if (!dayMap[day]) dayMap[day] = { passed: 0, failed: 0, sumConf: 0, count: 0 };
        if (r.passed) dayMap[day].passed++;
        else dayMap[day].failed++;
        dayMap[day].sumConf += r.overall_confidence ?? 0;
        dayMap[day].count++;
      }
      const trendArr: TrendPoint[] = Object.entries(dayMap)
        .map(([date, d]) => ({
          date,
          passed: d.passed,
          failed: d.failed,
          passRate: d.count > 0 ? Math.round((d.passed / d.count) * 100) : 0,
          avgConfidence: d.count > 0 ? Math.round(d.sumConf / d.count) : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setTrends(trendArr);

      // ── Recent events ─────────────────────────────────────────────────────
      setRecentEvents(rows.slice(0, 50));
    } catch (err) {
      console.error('[enrichment-validation-analytics]', err);
    } finally {
      setLoading(false);
    }
  }, [getStartDate, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const passFailData = summary
    ? [{ name: 'Passed', value: summary.passed }, { name: 'Failed', value: summary.failed }]
    : [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-500" />
              Enrichment Validation Analytics
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Pass/fail rates, field confidence distribution, flagged anomalies, and data freshness by source
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(['24h', '7d', '30d'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    timeframe === t
                      ? 'bg-indigo-600 text-white' :'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {loading && !summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Validations</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{summary?.total ?? 0}</div>
                <div className="text-xs text-gray-400 mt-1">{summary?.cacheHits ?? 0} cache hits</div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pass Rate</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{summary?.passRate ?? 0}%</div>
                <div className="text-xs text-gray-400 mt-1">{summary?.passed ?? 0} passed / {summary?.failed ?? 0} failed</div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Confidence</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{summary?.avgOverallConfidence ?? 0}</div>
                <div className="text-xs text-gray-400 mt-1">Ownership: {summary?.avgOwnershipConfidence ?? 0} · Comps: {summary?.avgMarketCompConfidence ?? 0}</div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cache Efficiency</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {summary && summary.total > 0 ? Math.round((summary.cacheHits / summary.total) * 100) : 0}%
                </div>
                <div className="text-xs text-gray-400 mt-1">{summary?.cacheHits ?? 0} API calls saved (7-day cache)</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pass/Fail Trend */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  Validation Pass/Fail Trend
                </h3>
                {trends.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(val: number, name: string) => [val, name === 'passed' ? 'Passed' : 'Failed']}
                      />
                      <Area type="monotone" dataKey="passed" stroke="#22c55e" fill="url(#passGrad)" strokeWidth={2} name="passed" />
                      <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="url(#failGrad)" strokeWidth={2} name="failed" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Pass/Fail Pie */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Overall Pass/Fail
                </h3>
                {passFailData.every(d => d.value === 0) ? (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={passFailData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {passFailData.map((_, i) => (
                          <Cell key={i} fill={PASS_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Field Confidence Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                Field-Level Confidence Distribution
              </h3>
              {fieldDist.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No field data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={fieldDist} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="field" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="high" name="High (≥80)" stackId="a" fill="#22c55e" />
                    <Bar dataKey="medium" name="Medium (60-79)" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="low" name="Low (<60)" stackId="a" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Source Breakdown + Anomalies */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Source Breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-500" />
                  Data Freshness & Pass Rate by Source
                </h3>
                {sourceBreakdown.length === 0 ? (
                  <div className="text-gray-400 text-sm py-8 text-center">No source data for this period</div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {sourceBreakdown.map((src, i) => (
                      <div key={src.source} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          onClick={() => setExpandedSource(expandedSource === src.source ? null : src.source)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{src.source}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`text-xs font-semibold ${src.passRate >= 80 ? 'text-emerald-600' : src.passRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                              {src.passRate}% pass
                            </span>
                            <span className="text-xs text-gray-400">{src.total} runs</span>
                            {expandedSource === src.source ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                          </div>
                        </button>
                        {expandedSource === src.source && (
                          <div className="px-3 pb-3 pt-1 bg-gray-50 dark:bg-gray-700/30 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <div className="text-gray-400">Avg Confidence</div>
                              <div className="font-semibold text-gray-700 dark:text-gray-300">{src.avgConfidence}</div>
                            </div>
                            <div>
                              <div className="text-gray-400">Cache Hits</div>
                              <div className="font-semibold text-gray-700 dark:text-gray-300">{src.cacheHits}</div>
                            </div>
                            <div>
                              <div className="text-gray-400">Last Validated</div>
                              <div className="font-semibold text-gray-700 dark:text-gray-300">
                                {src.lastValidated ? new Date(src.lastValidated).toLocaleDateString() : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-400">Passed</div>
                              <div className="font-semibold text-emerald-600">{src.passed}</div>
                            </div>
                            <div>
                              <div className="text-gray-400">Failed</div>
                              <div className="font-semibold text-red-600">{src.failed}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Flagged Anomalies */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Top Flagged Anomalies
                </h3>
                {anomalies.length === 0 ? (
                  <div className="text-gray-400 text-sm py-8 text-center">No anomalies flagged in this period</div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {anomalies.map((a, i) => {
                      const maxCount = anomalies[0]?.count ?? 1;
                      const pct = Math.round((a.count / maxCount) * 100);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{a.anomaly}</span>
                              <span className="text-xs font-semibold text-gray-500 ml-2 flex-shrink-0">{a.count}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-400"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Validation Events */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-500" />
                Recent Validation Events
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Source</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Overall</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ownership</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Comps</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Rec</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cache</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {recentEvents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-gray-400 text-sm">No validation events in this period</td>
                      </tr>
                    ) : recentEvents.map(evt => (
                      <tr key={evt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(evt.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300 max-w-[120px] truncate">{evt.source || '—'}</td>
                        <td className="py-2 px-3">
                          {evt.passed
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Pass</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle className="w-3.5 h-3.5" />Fail</span>
                          }
                        </td>
                        <td className="py-2 px-3">{confidenceBadge(evt.overall_confidence)}</td>
                        <td className="py-2 px-3">{confidenceBadge(evt.ownership_confidence)}</td>
                        <td className="py-2 px-3">{confidenceBadge(evt.market_comp_confidence)}</td>
                        <td className="py-2 px-3">{recBadge(evt.recommendation)}</td>
                        <td className="py-2 px-3">
                          {evt.cache_hit
                            ? <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium"><Zap className="w-3 h-3" />Hit</span>
                            : <span className="text-xs text-gray-400">Miss</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
