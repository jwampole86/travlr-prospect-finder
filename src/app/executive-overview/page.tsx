'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import { ACTIVE_PIPELINE_STAGES } from '@/lib/kpiDefinitions';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import {
  Users, TrendingUp, DollarSign, Send, CheckCircle, AlertCircle,
  RefreshCw, Loader2, Building2, ArrowUpRight, ArrowDownRight, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioHealth {
  key: string;
  label: string;
  abbr: string;
  color: string;
  totalLeads: number;
  activeLeads: number;
  healthPct: number;
  trend: 'up' | 'down' | 'flat';
}

interface MonthlyRevenueTrend {
  month: string;
  revenue: number;
}

interface KPISummary {
  totalLeads: number;
  totalOutreach: number;
  deliveryRate: number;
  slaStatus: 'on_track' | 'at_risk' | 'breached';
  avgDeliveryRate: number;
}

// ─── Query cache ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 90_000; // 90 seconds for executive overview
interface CacheEntry<T> { data: T; ts: number }
const execCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = execCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { execCache.delete(key); return null; }
  return entry.data;
}
function setCache<T>(key: string, data: T): void {
  execCache.set(key, { data, ts: Date.now() });
}

// ─── SLA threshold ────────────────────────────────────────────────────────────
const SLA_TARGET = 85;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slaColor(status: KPISummary['slaStatus']) {
  if (status === 'on_track') return 'text-emerald-600';
  if (status === 'at_risk') return 'text-amber-500';
  return 'text-red-500';
}
function slaBg(status: KPISummary['slaStatus']) {
  if (status === 'on_track') return 'bg-emerald-500/10 border-emerald-500/20';
  if (status === 'at_risk') return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}
function slaLabel(status: KPISummary['slaStatus']) {
  if (status === 'on_track') return 'On Track';
  if (status === 'at_risk') return 'At Risk';
  return 'Breached';
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExecutiveOverviewPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<KPISummary | null>(null);
  const [portfolioHealth, setPortfolioHealth] = useState<PortfolioHealth[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<MonthlyRevenueTrend[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Batch timer for real-time subscription
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const BATCH_DEBOUNCE_MS = 3000;

  const load = useCallback(async (bypassCache = false) => {
    const CACHE_KEY = 'exec_overview_data';

    if (!bypassCache) {
      const cached = getCached<{ kpi: KPISummary; portfolioHealth: PortfolioHealth[]; revenueTrend: MonthlyRevenueTrend[] }>(CACHE_KEY);
      if (cached) {
        setKpi(cached.kpi);
        setPortfolioHealth(cached.portfolioHealth);
        setRevenueTrend(cached.revenueTrend);
        setFromCache(true);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setFromCache(false);
    const fetchStart = Date.now();

    try {
      // Batch both queries in parallel
      const [leadsResult, outreachResult] = await Promise.all([
        supabase.from('leads').select('state, stage').not('state', 'is', null),
        supabase.from('outreach_history').select('status, sent_at, lead:leads(estimated_net_monthly)').order('sent_at', { ascending: true }),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (outreachResult.error) throw outreachResult.error;

      const leadsData = leadsResult.data || [];
      const outreachData = outreachResult.data || [];

      setQueryMs(Date.now() - fetchStart);

      // ── Portfolio health ──────────────────────────────────────────────────
      const portfolioRows = PORTFOLIOS.filter((p) => p.key !== 'all');
      const healthList: PortfolioHealth[] = portfolioRows.map((p) => {
        const stateLeads = leadsData.filter((l) => l.state === p.stateCode);
        const total = stateLeads.length;
        const active = stateLeads.filter((l) =>
          ACTIVE_PIPELINE_STAGES.includes(l.stage as (typeof ACTIVE_PIPELINE_STAGES)[number])
        ).length;
        const healthPct = total > 0 ? Math.round((active / total) * 100) : 0;
        return {
          key: p.key,
          label: p.label,
          abbr: p.abbr,
          color: p.color,
          totalLeads: total,
          activeLeads: active,
          healthPct,
          trend: healthPct >= 40 ? 'up' : healthPct >= 20 ? 'flat' : 'down',
        };
      }).sort((a, b) => b.totalLeads - a.totalLeads);

      // ── KPI summary ───────────────────────────────────────────────────────
      const totalLeads = leadsData.length;
      const totalOutreach = outreachData.length;
      const delivered = outreachData.filter((o) => o.status === 'delivered').length;
      const deliveryRate = totalOutreach > 0 ? Math.round((delivered / totalOutreach) * 100) : 0;
      const slaStatus: KPISummary['slaStatus'] =
        deliveryRate >= SLA_TARGET ? 'on_track' : deliveryRate >= SLA_TARGET - 10 ? 'at_risk' : 'breached';

      const kpiData: KPISummary = { totalLeads, totalOutreach, deliveryRate, slaStatus, avgDeliveryRate: deliveryRate };

      // ── Monthly revenue trend (last 6 months) ─────────────────────────────
      const monthMap: Record<string, number> = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.toLocaleString('default', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;
        monthMap[key] = 0;
      }
      outreachData.forEach((o) => {
        if (!o.sent_at) return;
        const d = new Date(o.sent_at);
        const key = `${d.toLocaleString('default', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;
        const estimatedRevenue = Number(o.lead?.estimated_net_monthly ?? 0);
        if (key in monthMap) monthMap[key] += estimatedRevenue;
      });
      const trend: MonthlyRevenueTrend[] = Object.entries(monthMap).map(([month, revenue]) => ({
        month,
        revenue: Math.round(revenue),
      }));

      // Cache the result
      setCache(CACHE_KEY, { kpi: kpiData, portfolioHealth: healthList, revenueTrend: trend });

      setKpi(kpiData);
      setPortfolioHealth(healthList);
      setRevenueTrend(trend);
      setLastRefreshed(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load executive data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();

    // Real-time subscription with batching
    const channel = supabase
      .channel('exec-overview-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(() => load(true), BATCH_DEBOUNCE_MS);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach_history' }, () => {
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(() => load(true), BATCH_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [load]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Executive Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              High-level metrics across all portfolios — for stakeholders &amp; leadership
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Query performance indicator */}
            {queryMs !== null && (
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${
                queryMs > 2000
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : queryMs > 800
                  ? 'bg-amber-50 border-amber-200 text-amber-600' :'bg-emerald-50 border-emerald-200 text-emerald-600'
              }`}>
                <Zap size={11} />
                {fromCache ? 'Cached' : `${queryMs}ms`}
              </div>
            )}
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* KPI Strip */}
        {loading && !kpi ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : kpi ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Leads */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Leads</span>
                <Users size={15} className="text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.totalLeads.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Across all portfolios</p>
            </div>

            {/* Team Outreach Volume */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outreach Volume</span>
                <Send size={15} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.totalOutreach.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total messages sent</p>
            </div>

            {/* Delivery Rate */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Rate</span>
                <CheckCircle size={15} className="text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.deliveryRate}%</p>
              <p className="text-xs text-muted-foreground">SLA target: {SLA_TARGET}%</p>
            </div>

            {/* SLA Status */}
            <div className={`rounded-xl border p-4 flex flex-col gap-2 ${slaBg(kpi.slaStatus)}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SLA Status</span>
                <TrendingUp size={15} className={slaColor(kpi.slaStatus)} />
              </div>
              <p className={`text-2xl font-bold ${slaColor(kpi.slaStatus)}`}>{slaLabel(kpi.slaStatus)}</p>
              <p className="text-xs text-muted-foreground">Delivery rate SLA</p>
            </div>
          </div>
        ) : null}

        {/* Main grid: Portfolio Health + Revenue Trend */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Portfolio Health Bars — spans 3 cols */}
          <div className="xl:col-span-3 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Portfolio Health</h2>
              <span className="ml-auto text-xs text-muted-foreground">Active / Total leads</span>
            </div>
            {loading && portfolioHealth.length === 0 ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : portfolioHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No portfolio data available</p>
            ) : (
              <div className="space-y-3">
                {portfolioHealth.map((p) => (
                  <div key={p.key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-semibold ${p.color} shrink-0`}>{p.abbr}</span>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">{p.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{p.activeLeads} / {p.totalLeads}</span>
                        <span className="text-xs font-medium text-foreground w-9 text-right">{p.healthPct}%</span>
                        {p.trend === 'up' ? (
                          <ArrowUpRight size={12} className="text-emerald-500" />
                        ) : p.trend === 'down' ? (
                          <ArrowDownRight size={12} className="text-red-400" />
                        ) : (
                          <span className="w-3 h-0.5 bg-muted-foreground/40 rounded inline-block" />
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          p.healthPct >= 40 ? 'bg-emerald-500' : p.healthPct >= 20 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${Math.max(p.healthPct, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Revenue Trend — spans 2 cols */}
          <div className="xl:col-span-2 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={15} className="text-emerald-500" />
              <h2 className="text-sm font-semibold text-foreground">Monthly Revenue Trend</h2>
            </div>
            {loading && revenueTrend.length === 0 ? (
              <div className="h-48 rounded-lg bg-muted animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenueTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Outreach Volume by Portfolio bar chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Send size={15} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-foreground">Lead Volume by Portfolio</h2>
          </div>
          {loading && portfolioHealth.length === 0 ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : portfolioHealth.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={portfolioHealth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="abbr" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="totalLeads" name="Total Leads" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="activeLeads" name="Active Leads" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
