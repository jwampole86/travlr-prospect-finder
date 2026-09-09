'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,  } from 'recharts';
import { Activity, Zap, Database, Users, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, CheckCircle, XCircle, Monitor, Server, Wifi,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';



// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricPoint {
  time: string;
  value: number;
}

interface PerformanceMetric {
  id: string;
  label: string;
  unit: string;
  current: number;
  avg: number;
  p95: number;
  p99: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  trend: number; // % change vs previous period
  history: MetricPoint[];
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

interface SessionHealth {
  active: number;
  degraded: number;
  errored: number;
  avgDuration: number;
  bounceRate: number;
  p95LoadTime: number;
}

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

// ─── Mock Data Generators ─────────────────────────────────────────────────────

function generateHistory(base: number, variance: number, points = 20): MetricPoint[] {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(now - (points - 1 - i) * 3 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: Math.max(0, base + (Math.random() - 0.5) * variance * 2),
  }));
}

function generateMetrics(): PerformanceMetric[] {
  return [
    {
      id: 'page_load',
      label: 'Page Load Time',
      unit: 'ms',
      current: 842,
      avg: 780,
      p95: 1420,
      p99: 2100,
      threshold: 2000,
      status: 'healthy',
      trend: -4.2,
      history: generateHistory(800, 200),
      icon: Monitor,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 'render_latency',
      label: 'Component Render Latency',
      unit: 'ms',
      current: 38,
      avg: 32,
      p95: 95,
      p99: 180,
      threshold: 100,
      status: 'healthy',
      trend: 2.1,
      history: generateHistory(35, 15),
      icon: Zap,
      color: 'text-violet-600',
      bgColor: 'bg-violet-500/10',
    },
    {
      id: 'api_response',
      label: 'API Response Time',
      unit: 'ms',
      current: 312,
      avg: 290,
      p95: 680,
      p99: 1200,
      threshold: 1000,
      status: 'healthy',
      trend: -1.8,
      history: generateHistory(300, 100),
      icon: Server,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
    },
    {
      id: 'db_query',
      label: 'DB Query Latency',
      unit: 'ms',
      current: 145,
      avg: 120,
      p95: 380,
      p99: 720,
      threshold: 500,
      status: 'warning',
      trend: 12.4,
      history: generateHistory(130, 60),
      icon: Database,
      color: 'text-amber-600',
      bgColor: 'bg-amber-500/10',
    },
    {
      id: 'ttfb',
      label: 'Time to First Byte',
      unit: 'ms',
      current: 210,
      avg: 195,
      p95: 450,
      p99: 820,
      threshold: 600,
      status: 'healthy',
      trend: -2.5,
      history: generateHistory(200, 80),
      icon: Wifi,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-500/10',
    },
    {
      id: 'error_rate',
      label: 'JS Error Rate',
      unit: '%',
      current: 0.8,
      avg: 0.6,
      p95: 2.1,
      p99: 4.5,
      threshold: 2.0,
      status: 'healthy',
      trend: 5.3,
      history: generateHistory(0.7, 0.4),
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-500/10',
    },
  ];
}

function generateSessionHealth(): SessionHealth {
  return {
    active: 47,
    degraded: 3,
    errored: 1,
    avgDuration: 8.4,
    bounceRate: 12.3,
    p95LoadTime: 1420,
  };
}

function generateAlerts(): Alert[] {
  const now = Date.now();
  return [
    {
      id: 'a1',
      severity: 'warning',
      message: 'DB query latency elevated — p95 approaching threshold',
      metric: 'db_query',
      value: 380,
      threshold: 500,
      timestamp: new Date(now - 4 * 60000).toISOString(),
      acknowledged: false,
    },
    {
      id: 'a2',
      severity: 'info',
      message: 'JS error rate slightly above baseline — monitoring',
      metric: 'error_rate',
      value: 0.8,
      threshold: 2.0,
      timestamp: new Date(now - 18 * 60000).toISOString(),
      acknowledged: false,
    },
    {
      id: 'a3',
      severity: 'critical',
      message: 'API response spike detected on /api/sync/execute — 3 requests > 2s',
      metric: 'api_response',
      value: 2340,
      threshold: 1000,
      timestamp: new Date(now - 32 * 60000).toISOString(),
      acknowledged: true,
    },
  ];
}

function generateCombinedTrend() {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => ({
    time: new Date(now - (29 - i) * 2 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    pageLoad: Math.max(200, 800 + (Math.random() - 0.5) * 400),
    apiResponse: Math.max(50, 300 + (Math.random() - 0.5) * 200),
    dbQuery: Math.max(20, 130 + (Math.random() - 0.5) * 100),
    renderLatency: Math.max(5, 35 + (Math.random() - 0.5) * 30),
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: 'healthy' | 'warning' | 'critical') {
  return {
    healthy: 'text-emerald-600',
    warning: 'text-amber-600',
    critical: 'text-red-600',
  }[status];
}

function statusBg(status: 'healthy' | 'warning' | 'critical') {
  return {
    healthy: 'bg-emerald-500/10 border-emerald-200',
    warning: 'bg-amber-500/10 border-amber-200',
    critical: 'bg-red-500/10 border-red-200',
  }[status];
}

function alertSeverityConfig(severity: 'critical' | 'warning' | 'info') {
  return {
    critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', icon: XCircle },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', icon: Activity },
  }[severity];
}

function fmt(n: number, unit: string) {
  if (unit === '%') return `${n.toFixed(1)}%`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ metric, onClick, selected }: { metric: PerformanceMetric; onClick: () => void; selected: boolean }) {
  const Icon = metric.icon;
  const isUp = metric.trend > 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  // For latency metrics, up is bad; for error rate, up is bad
  const trendBad = isUp;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/20'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${metric.bgColor}`}>
          <Icon size={15} className={metric.color} />
        </div>
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusBg(metric.status)} ${statusColor(metric.status)}`}>
          {metric.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground font-medium mb-1">{metric.label}</p>
      <p className="text-2xl font-bold text-foreground">{fmt(metric.current, metric.unit)}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">avg {fmt(metric.avg, metric.unit)}</span>
        <span className={`flex items-center gap-0.5 text-[10px] font-medium ${trendBad ? 'text-red-500' : 'text-emerald-600'}`}>
          <TrendIcon size={10} />
          {Math.abs(metric.trend)}%
        </span>
      </div>
      <div className="mt-2 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metric.history} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={metric.color.replace('text-', '#').replace('-600', '')}
              fill={metric.bgColor.replace('bg-', '#').replace('/10', '1a')}
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PerformanceDashboardPage() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [sessionHealth, setSessionHealth] = useState<SessionHealth | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [combinedTrend, setCombinedTrend] = useState<ReturnType<typeof generateCombinedTrend>>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('page_load');
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const AUTO_REFRESH_MS = 60 * 60 * 1000; // 1 hour

  const loadData = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setMetrics(generateMetrics());
      setSessionHealth(generateSessionHealth());
      setAlerts(generateAlerts());
      setCombinedTrend(generateCombinedTrend());
      setLastRefreshed(new Date());
      setLoading(false);
    }, 500);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(loadData, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadData, AUTO_REFRESH_MS]);

  const acknowledgeAlert = (id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
  };

  const activeAlerts = alerts.filter((a) => !a.acknowledged);
  const selected = metrics.find((m) => m.id === selectedMetric);

  const overallStatus = metrics.some((m) => m.status === 'critical')
    ? 'critical'
    : metrics.some((m) => m.status === 'warning')
    ? 'warning' :'healthy';

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Performance Dashboard</h1>
                <p className="text-xs text-muted-foreground">Real-time latency, render, API & session health via Mixpanel</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeAlerts.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                  <AlertTriangle size={12} />
                  {activeAlerts.length} active alert{activeAlerts.length !== 1 ? 's' : ''}
                </span>
              )}
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${statusBg(overallStatus)} ${statusColor(overallStatus)}`}>
                {overallStatus === 'healthy' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                System {overallStatus}
              </span>
              <button
                onClick={() => setAutoRefresh((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${autoRefresh ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}
              >
                <Activity size={12} className={autoRefresh ? 'animate-pulse' : ''} />
                {autoRefresh ? 'Auto (1h)' : 'Manual'}
              </button>
              <button
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Last refreshed: {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {autoRefresh && ' · Auto-refresh every 1 hour'}
          </p>
        </div>

        <div className="px-6 py-5 max-w-7xl mx-auto space-y-6">
          {/* Active Alerts */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                Active Alerts
              </h2>
              {activeAlerts.map((alert) => {
                const cfg = alertSeverityConfig(alert.severity);
                const AlertIcon = cfg.icon;
                return (
                  <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.bg}`}>
                    <AlertIcon size={14} className={`${cfg.text} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${cfg.text}`}>{alert.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Value: {alert.value}{alert.metric === 'error_rate' ? '%' : 'ms'} · Threshold: {alert.threshold}{alert.metric === 'error_rate' ? '%' : 'ms'} · {timeAgo(alert.timestamp)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground border border-border px-2 py-0.5 rounded-md transition-colors shrink-0"
                    >
                      Ack
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Metric Cards Grid */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Core Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {metrics.map((m) => (
                <MetricCard
                  key={m.id}
                  metric={m}
                  onClick={() => setSelectedMetric(m.id)}
                  selected={selectedMetric === m.id}
                />
              ))}
            </div>
          </div>

          {/* Selected Metric Detail */}
          {selected && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selected.bgColor}`}>
                    <selected.icon size={13} className={selected.color} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selected.label} — Detail</h3>
                    <p className="text-[10px] text-muted-foreground">Last 20 data points · 3-min intervals</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">Avg</p>
                    <p className="font-semibold text-foreground">{fmt(selected.avg, selected.unit)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">p95</p>
                    <p className="font-semibold text-foreground">{fmt(selected.p95, selected.unit)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">p99</p>
                    <p className="font-semibold text-foreground">{fmt(selected.p99, selected.unit)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Threshold</p>
                    <p className={`font-semibold ${statusColor(selected.status)}`}>{fmt(selected.threshold, selected.unit)}</p>
                  </div>
                </div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selected.history} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
                      formatter={(v: number) => [fmt(v, selected.unit), selected.label]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={selected.status === 'critical' ? '#ef4444' : selected.status === 'warning' ? '#f59e0b' : '#3b82f6'}
                      fill={selected.status === 'critical' ? '#fef2f2' : selected.status === 'warning' ? '#fffbeb' : '#eff6ff'}
                      strokeWidth={2}
                      dot={false}
                    />
                    {/* Threshold reference line */}
                    <CartesianGrid
                      horizontal={false}
                      strokeDasharray="6 3"
                      stroke="#ef4444"
                      strokeOpacity={0.4}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Combined Trend + Session Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Combined Trend Chart */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Combined Latency Trend (30 min)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedTrend} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" interval={4} />
                    <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
                      formatter={(v: number) => [`${Math.round(v)}ms`]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="pageLoad" name="Page Load" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="apiResponse" name="API Response" stroke="#10b981" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="dbQuery" name="DB Query" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="renderLatency" name="Render" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Session Health */}
            {sessionHealth && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Users size={14} className="text-muted-foreground" />
                  Session Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-200 rounded-lg">
                    <span className="text-xs text-muted-foreground">Active Sessions</span>
                    <span className="text-sm font-bold text-emerald-600">{sessionHealth.active}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-amber-500/5 border border-amber-200 rounded-lg">
                    <span className="text-xs text-muted-foreground">Degraded</span>
                    <span className="text-sm font-bold text-amber-600">{sessionHealth.degraded}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-red-500/5 border border-red-200 rounded-lg">
                    <span className="text-xs text-muted-foreground">Errored</span>
                    <span className="text-sm font-bold text-red-600">{sessionHealth.errored}</span>
                  </div>
                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Avg Session Duration</span>
                      <span className="font-semibold text-foreground">{sessionHealth.avgDuration}m</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Bounce Rate</span>
                      <span className="font-semibold text-foreground">{sessionHealth.bounceRate}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">p95 Load Time</span>
                      <span className="font-semibold text-foreground">{sessionHealth.p95LoadTime}ms</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Acknowledged Alerts */}
          {alerts.filter((a) => a.acknowledged).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Acknowledged Alerts</h3>
              <div className="space-y-2">
                {alerts.filter((a) => a.acknowledged).map((alert) => {
                  const cfg = alertSeverityConfig(alert.severity);
                  return (
                    <div key={alert.id} className="flex items-center gap-3 text-xs text-muted-foreground opacity-60">
                      <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                      <span className="flex-1">{alert.message}</span>
                      <span>{timeAgo(alert.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
