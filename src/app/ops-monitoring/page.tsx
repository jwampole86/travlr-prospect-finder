'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, MessageSquare, Mail, Database, Zap, Server, Bell, BellOff, BarChart2, Wifi, Play, Pause, Webhook, Clock, ChevronRight, Info } from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar
} from 'recharts';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
type AlertSeverity = 'critical' | 'warning' | 'info';
type TabId = 'overview' | 'api' | 'delivery' | 'webhooks' | 'incidents';

interface MetricPoint { time: string; value: number; errors?: number; }

interface ServiceMetric {
  id: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  status: HealthStatus;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue?: string;
  secondaryLabel?: string;
  trend: 'up' | 'down' | 'flat';
  trendValue: string;
  trendGood: boolean;
  sparkline: MetricPoint[];
  lastChecked: string;
  alertMessage?: string;
}

interface ApiMetric {
  endpoint: string;
  method: string;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  rps: number;
  status: HealthStatus;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  service: string;
  status: HealthStatus;
  lastDelivery: string;
  successRate: number;
  failedLast24h: number;
  totalLast24h: number;
  avgLatency: number;
  lastError?: string;
}

interface IncidentEvent {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  title: string;
  service: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved';
  resolvedAt?: string;
  duration?: string;
}

interface ActiveAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  service: string;
  timestamp: string;
  acknowledged: boolean;
  metric?: string;
  threshold?: string;
  current?: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: 'success' | 'failed' | 'running' | 'skipped';
  duration_ms: number;
  runCount24h: number;
  failCount24h: number;
}

// ─── Mock Data Generators ─────────────────────────────────────────────────────

function genSparkline(base: number, variance: number, points = 20): MetricPoint[] {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(now - (points - 1 - i) * 3 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: Math.max(0, base + (Math.random() - 0.5) * variance * 2),
    errors: Math.max(0, Math.round((Math.random() - 0.8) * 5)),
  }));
}

function genLatencyHistory(): MetricPoint[] {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(now - (23 - i) * 3600000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: Math.max(80, 142 + (Math.random() - 0.5) * 80),
    errors: Math.max(0, Math.round(Math.random() * 8)),
  }));
}

function generateMetrics(): ServiceMetric[] {
  return [
    {
      id: 'api-latency', label: 'API Response Latency', icon: Server, iconColor: 'bg-slate-100 text-slate-600',
      status: 'healthy', primaryValue: '142ms', primaryLabel: 'avg p50', secondaryValue: '380ms', secondaryLabel: 'p95',
      trend: 'down', trendValue: '−18ms', trendGood: true, sparkline: genSparkline(142, 40),
      lastChecked: new Date(Date.now() - 30000).toISOString(),
    },
    {
      id: 'api-error-rate', label: 'API Error Rate', icon: AlertTriangle, iconColor: 'bg-red-100 text-red-500',
      status: 'healthy', primaryValue: '0.8%', primaryLabel: '5xx errors', secondaryValue: '2.1%', secondaryLabel: '4xx errors',
      trend: 'down', trendValue: '−0.3%', trendGood: true, sparkline: genSparkline(0.8, 0.5),
      lastChecked: new Date(Date.now() - 20000).toISOString(),
    },
    {
      id: 'twilio-delivery', label: 'SMS Delivery Rate', icon: MessageSquare, iconColor: 'bg-red-100 text-red-600',
      status: 'healthy', primaryValue: '97.2%', primaryLabel: 'delivery rate', secondaryValue: '1,284', secondaryLabel: 'sent today',
      trend: 'up', trendValue: '+0.4%', trendGood: true, sparkline: genSparkline(97, 3),
      lastChecked: new Date(Date.now() - 45000).toISOString(),
    },
    {
      id: 'resend-bounce', label: 'Email Bounce Rate', icon: Mail, iconColor: 'bg-blue-100 text-blue-600',
      status: 'degraded', primaryValue: '4.8%', primaryLabel: 'bounce rate', secondaryValue: '892', secondaryLabel: 'sent today',
      trend: 'up', trendValue: '+1.2%', trendGood: false, sparkline: genSparkline(4.8, 2),
      lastChecked: new Date(Date.now() - 60000).toISOString(),
      alertMessage: 'Bounce rate above 4% threshold — check domain reputation',
    },
    {
      id: 'enrichment-sync', label: 'Enrichment Sync Health', icon: RefreshCw, iconColor: 'bg-teal-100 text-teal-600',
      status: 'degraded', primaryValue: '3 failed', primaryLabel: 'last 24h', secondaryValue: '94.2%', secondaryLabel: 'success rate',
      trend: 'down', trendValue: '−2.1%', trendGood: false, sparkline: genSparkline(94, 4),
      lastChecked: new Date(Date.now() - 20000).toISOString(),
      alertMessage: '3 enrichment syncs failed — SalesGenie API timeout',
    },
    {
      id: 'supabase-db', label: 'Supabase DB', icon: Database, iconColor: 'bg-emerald-100 text-emerald-600',
      status: 'healthy', primaryValue: '8ms', primaryLabel: 'query latency', secondaryValue: '99.98%', secondaryLabel: 'uptime',
      trend: 'down', trendValue: '−2ms', trendGood: true, sparkline: genSparkline(8, 4),
      lastChecked: new Date(Date.now() - 15000).toISOString(),
    },
  ];
}

function generateApiMetrics(): ApiMetric[] {
  return [
    { endpoint: '/api/sms/send', method: 'POST', p50: 210, p95: 580, p99: 1200, errorRate: 1.2, rps: 4.2, status: 'healthy' },
    { endpoint: '/api/enrichment/salesgenie', method: 'POST', p50: 1840, p95: 4200, p99: 8100, errorRate: 12.5, rps: 0.8, status: 'degraded' },
    { endpoint: '/api/ai/chat-completion', method: 'POST', p50: 1100, p95: 3400, p99: 6200, errorRate: 0.4, rps: 2.1, status: 'healthy' },
    { endpoint: '/api/cadence/run', method: 'POST', p50: 320, p95: 890, p99: 1800, errorRate: 0.2, rps: 1.4, status: 'healthy' },
    { endpoint: '/api/docusign/create-envelope', method: 'POST', p50: 0, p95: 0, p99: 0, errorRate: 100, rps: 0, status: 'down' },
    { endpoint: '/api/sync/execute', method: 'POST', p50: 4200, p95: 9800, p99: 18000, errorRate: 3.8, rps: 0.3, status: 'degraded' },
    { endpoint: '/api/twilio/voice/call', method: 'POST', p50: 180, p95: 420, p99: 800, errorRate: 0.6, rps: 1.8, status: 'healthy' },
    { endpoint: '/api/track/[token]', method: 'GET', p50: 45, p95: 120, p99: 280, errorRate: 0.1, rps: 12.4, status: 'healthy' },
  ];
}

function generateWebhooks(): WebhookEndpoint[] {
  const now = Date.now();
  return [
    {
      id: 'wh-twilio-status', name: 'Twilio SMS Status', url: '/api/sms/status', service: 'Twilio',
      status: 'healthy', lastDelivery: new Date(now - 2 * 60000).toISOString(),
      successRate: 99.1, failedLast24h: 3, totalLast24h: 342, avgLatency: 88,
    },
    {
      id: 'wh-twilio-inbound', name: 'Twilio Inbound SMS', url: '/api/sms/inbound', service: 'Twilio',
      status: 'healthy', lastDelivery: new Date(now - 8 * 60000).toISOString(),
      successRate: 100, failedLast24h: 0, totalLast24h: 47, avgLatency: 62,
    },
    {
      id: 'wh-docusign', name: 'DocuSign Envelope Events', url: '/api/docusign/webhook', service: 'DocuSign',
      status: 'down', lastDelivery: new Date(now - 72 * 3600000).toISOString(),
      successRate: 0, failedLast24h: 0, totalLast24h: 0, avgLatency: 0,
      lastError: 'DocuSign credentials not configured — webhook HMAC validation failing',
    },
    {
      id: 'wh-cadence-escalation', name: 'Cadence Escalation', url: '/api/cadence/notify-escalation', service: 'Internal',
      status: 'healthy', lastDelivery: new Date(now - 15 * 60000).toISOString(),
      successRate: 97.8, failedLast24h: 2, totalLast24h: 91, avgLatency: 145,
    },
    {
      id: 'wh-stripe', name: 'Stripe Connect Events', url: '/api/stripe/connect', service: 'Stripe',
      status: 'unknown', lastDelivery: new Date(now - 48 * 3600000).toISOString(),
      successRate: 0, failedLast24h: 0, totalLast24h: 0, avgLatency: 0,
      lastError: 'Stripe not configured — no events received',
    },
    {
      id: 'wh-twilio-recording', name: 'Twilio Recording Status', url: '/api/twilio/voice/recording-status', service: 'Twilio',
      status: 'degraded', lastDelivery: new Date(now - 25 * 60000).toISOString(),
      successRate: 82.4, failedLast24h: 11, totalLast24h: 63, avgLatency: 320,
      lastError: 'High latency on recording callbacks — Twilio webhook timeout (>300ms)',
    },
  ];
}

function generateIncidents(): IncidentEvent[] {
  const now = Date.now();
  return [
    {
      id: 'inc-001', timestamp: new Date(now - 12 * 60000).toISOString(), severity: 'warning',
      title: 'Email Bounce Rate Elevated', service: 'Resend',
      description: 'Bounce rate climbed from 2.1% to 4.8% over 30 minutes. Domain reputation check triggered. No action taken yet.',
      status: 'investigating',
    },
    {
      id: 'inc-002', timestamp: new Date(now - 45 * 60000).toISOString(), severity: 'critical',
      title: 'Enrichment Sync Failures — SalesGenie Timeout', service: 'Enrichment',
      description: 'SalesGenie API returning 504 Gateway Timeout on 3 consecutive batch jobs. 47 leads pending enrichment.',
      status: 'open',
    },
    {
      id: 'inc-003', timestamp: new Date(now - 2 * 3600000).toISOString(), severity: 'warning',
      title: 'DocuSign Webhook Not Receiving Events', service: 'DocuSign',
      description: 'DocuSign credentials not configured. Envelope status webhooks inactive. Signing portal non-functional.',
      status: 'open',
    },
    {
      id: 'inc-004', timestamp: new Date(now - 4 * 3600000).toISOString(), severity: 'warning',
      title: 'Twilio Recording Callback Latency Spike', service: 'Twilio',
      description: 'Recording status callbacks averaging 320ms vs normal 88ms. 11 callbacks failed in last 24h.',
      status: 'investigating',
    },
    {
      id: 'inc-005', timestamp: new Date(now - 8 * 3600000).toISOString(), severity: 'info',
      title: 'Score Recalculation Cron Recovered', service: 'Cron',
      description: 'Score recalculation job failed twice due to DB timeout. Auto-recovered after 3rd attempt. Root cause: slow query on leads table.',
      status: 'resolved', resolvedAt: new Date(now - 6 * 3600000).toISOString(), duration: '2h 14m',
    },
    {
      id: 'inc-006', timestamp: new Date(now - 24 * 3600000).toISOString(), severity: 'critical',
      title: 'API Latency Spike — p95 exceeded 2s', service: 'API',
      description: 'p95 latency hit 2,100ms for 18 minutes. Traced to N+1 query in lead enrichment endpoint. Fixed with index.',
      status: 'resolved', resolvedAt: new Date(now - 23 * 3600000).toISOString(), duration: '18m',
    },
  ];
}

function generateAlerts(): ActiveAlert[] {
  const now = Date.now();
  return [
    { id: 'a-1', severity: 'critical', message: 'Enrichment sync failure rate 12.5% — SalesGenie API timeout', service: 'Enrichment', timestamp: new Date(now - 45 * 60000).toISOString(), acknowledged: false, metric: 'error_rate', threshold: '5%', current: '12.5%' },
    { id: 'a-2', severity: 'warning', message: 'Email bounce rate exceeded 4% threshold (currently 4.8%)', service: 'Resend', timestamp: new Date(now - 12 * 60000).toISOString(), acknowledged: false, metric: 'bounce_rate', threshold: '4%', current: '4.8%' },
    { id: 'a-3', severity: 'critical', message: 'DocuSign webhook inactive — 0 events in 72h', service: 'DocuSign', timestamp: new Date(now - 72 * 3600000).toISOString(), acknowledged: false, metric: 'webhook_health', threshold: '1 event/hr', current: '0' },
    { id: 'a-4', severity: 'warning', message: 'Twilio recording callback latency 320ms (threshold: 200ms)', service: 'Twilio', timestamp: new Date(now - 25 * 60000).toISOString(), acknowledged: false, metric: 'webhook_latency', threshold: '200ms', current: '320ms' },
    { id: 'a-5', severity: 'info', message: 'Lead Sync had 1 failure in last 24h — auto-recovered', service: 'Sync', timestamp: new Date(now - 4 * 3600000).toISOString(), acknowledged: true },
  ];
}

function generateCronJobs(): CronJob[] {
  const now = Date.now();
  return [
    { id: 'cron-cadence', name: 'Cadence Engine', schedule: 'Every 5 min', lastRun: new Date(now - 3 * 60000).toISOString(), nextRun: new Date(now + 2 * 60000).toISOString(), status: 'success', duration_ms: 1240, runCount24h: 288, failCount24h: 0 },
    { id: 'cron-lead-sync', name: 'Lead Sync', schedule: 'Every 15 min', lastRun: new Date(now - 8 * 60000).toISOString(), nextRun: new Date(now + 7 * 60000).toISOString(), status: 'success', duration_ms: 4820, runCount24h: 96, failCount24h: 1 },
    { id: 'cron-enrichment', name: 'Enrichment Batch', schedule: 'Every 60 min', lastRun: new Date(now - 22 * 60000).toISOString(), nextRun: new Date(now + 38 * 60000).toISOString(), status: 'failed', duration_ms: 0, runCount24h: 24, failCount24h: 3 },
    { id: 'cron-score', name: 'Score Recalculation', schedule: 'Every 4 hrs', lastRun: new Date(now - 90 * 60000).toISOString(), nextRun: new Date(now + 150 * 60000).toISOString(), status: 'success', duration_ms: 8400, runCount24h: 6, failCount24h: 0 },
    { id: 'cron-export', name: 'Scheduled Exports', schedule: 'Every 30 min', lastRun: new Date(now - 15 * 60000).toISOString(), nextRun: new Date(now + 15 * 60000).toISOString(), status: 'success', duration_ms: 2100, runCount24h: 48, failCount24h: 0 },
    { id: 'cron-retry', name: 'SMS Retry Queue', schedule: 'Every 10 min', lastRun: new Date(now - 5 * 60000).toISOString(), nextRun: new Date(now + 5 * 60000).toISOString(), status: 'running', duration_ms: 0, runCount24h: 144, failCount24h: 0 },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function timeUntil(d: string) {
  const diff = new Date(d).getTime() - Date.now();
  if (diff <= 0) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  return `${Math.floor(diff / 60000)}m`;
}

const STATUS_COLORS: Record<HealthStatus, { dot: string; label: string; text: string; bg: string; border: string }> = {
  healthy:  { dot: 'bg-emerald-500', label: 'Healthy',  text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  degraded: { dot: 'bg-amber-500',   label: 'Degraded', text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200' },
  down:     { dot: 'bg-red-500',     label: 'Down',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200' },
  unknown:  { dot: 'bg-gray-400',    label: 'Unknown',  text: 'text-gray-500',    bg: 'bg-gray-50',     border: 'border-gray-200' },
};

const CRON_STATUS: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  success: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle },
  failed:  { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: XCircle },
  running: { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: Play },
  skipped: { color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',       icon: Pause },
};

const ALERT_CONFIG: Record<AlertSeverity, { color: string; bg: string; border: string; icon: React.ElementType; dot: string }> = {
  critical: { color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: XCircle,       dot: 'bg-red-500' },
  warning:  { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: AlertTriangle, dot: 'bg-amber-500' },
  info:     { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: Info,          dot: 'bg-blue-500' },
};

const INCIDENT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open:          { label: 'Open',          color: 'text-red-700',     bg: 'bg-red-100' },
  investigating: { label: 'Investigating', color: 'text-amber-700',   bg: 'bg-amber-100' },
  resolved:      { label: 'Resolved',      color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ metric }: { metric: ServiceMetric }) {
  const statusCfg = STATUS_COLORS[metric.status];
  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;
  const Icon = metric.icon;
  return (
    <div className={`bg-white border rounded-2xl p-4 flex flex-col gap-3 ${metric.alertMessage ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${metric.iconColor}`}>
            <Icon size={15} />
          </div>
          <span className="text-sm font-semibold text-gray-800">{metric.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${statusCfg.dot} ${metric.status === 'healthy' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-medium ${statusCfg.text}`}>{statusCfg.label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">{metric.primaryValue}</div>
          <div className="text-xs text-gray-400">{metric.primaryLabel}</div>
          {metric.secondaryValue && (
            <div className="text-xs text-gray-500 mt-0.5">
              <span className="font-medium">{metric.secondaryValue}</span> {metric.secondaryLabel}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${metric.trendGood ? 'text-emerald-600' : 'text-red-600'}`}>
          <TrendIcon size={12} />{metric.trendValue}
        </div>
      </div>
      <div className="h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metric.sparkline} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metric.status === 'degraded' ? '#f59e0b' : metric.status === 'down' ? '#ef4444' : '#10b981'} stopOpacity={0.2} />
                <stop offset="95%" stopColor={metric.status === 'degraded' ? '#f59e0b' : metric.status === 'down' ? '#ef4444' : '#10b981'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke={metric.status === 'degraded' ? '#f59e0b' : metric.status === 'down' ? '#ef4444' : '#10b981'} strokeWidth={1.5} fill={`url(#grad-${metric.id})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {metric.alertMessage && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">{metric.alertMessage}</p>
        </div>
      )}
      <div className="text-xs text-gray-300">Checked {timeAgo(metric.lastChecked)}</div>
    </div>
  );
}

function AlertRow({ alert, onAck }: { alert: ActiveAlert; onAck: (id: string) => void }) {
  const cfg = ALERT_CONFIG[alert.severity];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${alert.acknowledged ? 'opacity-50' : ''} ${cfg.bg} ${cfg.border}`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot} ${!alert.acknowledged ? 'animate-pulse' : ''}`} />
      <Icon size={14} className={`${cfg.color} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{alert.severity}</span>
          <span className="text-xs text-gray-500 font-medium">{alert.service}</span>
          <span className="text-xs text-gray-400">{timeAgo(alert.timestamp)}</span>
          {alert.metric && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 font-mono">
              {alert.metric}: {alert.current} (threshold: {alert.threshold})
            </span>
          )}
        </div>
        <p className="text-sm text-gray-800 mt-0.5">{alert.message}</p>
      </div>
      {!alert.acknowledged && (
        <button onClick={() => onAck(alert.id)} className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          Ack
        </button>
      )}
    </div>
  );
}

function CronJobRow({ job }: { job: CronJob }) {
  const cfg = CRON_STATUS[job.status];
  const Icon = cfg.icon;
  const failRate = job.runCount24h > 0 ? ((job.failCount24h / job.runCount24h) * 100).toFixed(1) : '0.0';
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
        <Icon size={10} className={job.status === 'running' ? 'animate-pulse' : ''} />{job.status}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{job.name}</span>
          <span className="text-xs text-gray-400">{job.schedule}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
          <span>Last: {timeAgo(job.lastRun)}</span>
          <span>Next: {timeUntil(job.nextRun)}</span>
          {job.duration_ms > 0 && <span>{job.duration_ms}ms</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-semibold text-gray-800">{job.runCount24h} runs</div>
        <div className={`text-xs ${job.failCount24h > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          {job.failCount24h} failed ({failRate}%)
        </div>
      </div>
    </div>
  );
}

// ─── API Metrics Tab ──────────────────────────────────────────────────────────

function ApiMetricsTab({ apiMetrics }: { apiMetrics: ApiMetric[] }) {
  const latencyHistory = genLatencyHistory();
  return (
    <div className="space-y-5">
      {/* Latency Chart */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server size={15} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900">API Latency — Last 24h</h2>
          <span className="ml-auto text-xs text-gray-400">p50 avg · error count overlay</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={latencyHistory} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} name="Latency (ms)" />
              <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Errors" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Endpoint Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart2 size={14} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-900">Endpoint Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Endpoint</th>
                <th className="text-right px-3 py-2.5 text-gray-500 font-medium">p50</th>
                <th className="text-right px-3 py-2.5 text-gray-500 font-medium">p95</th>
                <th className="text-right px-3 py-2.5 text-gray-500 font-medium">p99</th>
                <th className="text-right px-3 py-2.5 text-gray-500 font-medium">Error %</th>
                <th className="text-right px-3 py-2.5 text-gray-500 font-medium">RPS</th>
                <th className="text-center px-3 py-2.5 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apiMetrics.map(m => {
                const sc = STATUS_COLORS[m.status];
                return (
                  <tr key={m.endpoint} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-800">{m.endpoint}</span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold">{m.method}</span>
                    </td>
                    <td className="text-right px-3 py-3 font-mono text-gray-700">{m.p50 > 0 ? `${m.p50}ms` : '—'}</td>
                    <td className="text-right px-3 py-3 font-mono text-gray-700">{m.p95 > 0 ? `${m.p95}ms` : '—'}</td>
                    <td className="text-right px-3 py-3 font-mono text-gray-700">{m.p99 > 0 ? `${m.p99}ms` : '—'}</td>
                    <td className={`text-right px-3 py-3 font-mono font-semibold ${m.errorRate > 5 ? 'text-red-600' : m.errorRate > 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {m.errorRate.toFixed(1)}%
                    </td>
                    <td className="text-right px-3 py-3 font-mono text-gray-600">{m.rps.toFixed(1)}</td>
                    <td className="text-center px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sc.bg} ${sc.border} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Tab ─────────────────────────────────────────────────────────────

function DeliveryTab() {
  const deliveryData = Array.from({ length: 12 }, (_, i) => ({
    time: `${(i + 8) % 24}:00`,
    sms: Math.round(80 + Math.random() * 40),
    email: Math.round(60 + Math.random() * 50),
    sms_fail: Math.round(Math.random() * 5),
    email_fail: Math.round(Math.random() * 8),
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'SMS Sent Today', value: '1,284', sub: '97.2% delivered', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'SMS Failed', value: '36', sub: '2.8% failure rate', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Emails Sent Today', value: '892', sub: '95.2% delivered', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Email Bounced', value: '43', sub: '4.8% bounce rate', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={14} className="text-red-500" />
          <h2 className="text-sm font-semibold text-gray-900">Delivery Volume — Last 12h</h2>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />SMS</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />Email</span>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deliveryData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="sms" fill="#f87171" radius={[3, 3, 0, 0]} name="SMS Sent" />
              <Bar dataKey="email" fill="#60a5fa" radius={[3, 3, 0, 0]} name="Email Sent" />
              <Bar dataKey="sms_fail" fill="#dc2626" radius={[3, 3, 0, 0]} name="SMS Failed" />
              <Bar dataKey="email_fail" fill="#d97706" radius={[3, 3, 0, 0]} name="Email Bounced" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Enrichment Sync Status */}
      <div className="bg-white border border-amber-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={14} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">Failed Enrichment Syncs</h2>
          <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">3 failed</span>
        </div>
        <div className="space-y-2">
          {[
            { id: 'enr-001', lead: 'Lead #4821 — 123 Oak St, Austin TX', error: 'SalesGenie 504 Gateway Timeout', time: '22m ago', retries: 3 },
            { id: 'enr-002', lead: 'Lead #4819 — 456 Maple Ave, Denver CO', error: 'SalesGenie 504 Gateway Timeout', time: '37m ago', retries: 3 },
            { id: 'enr-003', lead: 'Lead #4815 — 789 Pine Rd, Miami FL', error: 'SalesGenie API rate limit exceeded', time: '58m ago', retries: 2 },
          ].map(f => (
            <div key={f.id} className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
              <XCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{f.lead}</p>
                <p className="text-[11px] text-red-600 mt-0.5 font-mono">{f.error}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] text-gray-400">{f.time}</div>
                <div className="text-[10px] text-red-500">{f.retries} retries</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Webhooks Tab ─────────────────────────────────────────────────────────────

function WebhooksTab({ webhooks }: { webhooks: WebhookEndpoint[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Webhooks', value: webhooks.length, color: 'text-gray-800', bg: 'bg-white border-gray-200' },
          { label: 'Healthy', value: webhooks.filter(w => w.status === 'healthy').length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'Degraded / Down', value: webhooks.filter(w => w.status === 'degraded' || w.status === 'down').length, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Failed (24h)', value: webhooks.reduce((a, w) => a + w.failedLast24h, 0), color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Webhook size={14} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-900">Webhook Endpoint Health</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {webhooks.map(wh => {
            const sc = STATUS_COLORS[wh.status];
            return (
              <div key={wh.id} className={`px-5 py-4 ${wh.status === 'down' ? 'bg-red-50/40' : wh.status === 'degraded' ? 'bg-amber-50/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${sc.dot} ${wh.status === 'healthy' ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{wh.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{wh.service}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${sc.bg} ${sc.border} ${sc.text}`}>{sc.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span className="font-mono text-gray-500">{wh.url}</span>
                      {wh.totalLast24h > 0 && (
                        <>
                          <span>·</span>
                          <span>{wh.totalLast24h} deliveries (24h)</span>
                          <span>·</span>
                          <span className={wh.failedLast24h > 0 ? 'text-red-500 font-medium' : 'text-emerald-600'}>{wh.failedLast24h} failed</span>
                          <span>·</span>
                          <span>{wh.successRate.toFixed(1)}% success</span>
                          {wh.avgLatency > 0 && <><span>·</span><span>{wh.avgLatency}ms avg</span></>}
                        </>
                      )}
                      <span>·</span>
                      <span>Last: {timeAgo(wh.lastDelivery)}</span>
                    </div>
                    {wh.lastError && (
                      <div className="mt-1.5 flex items-start gap-1.5 p-2 bg-red-50 border border-red-100 rounded-lg">
                        <AlertTriangle size={10} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-red-700">{wh.lastError}</p>
                      </div>
                    )}
                  </div>
                  {wh.successRate > 0 && (
                    <div className="text-right flex-shrink-0">
                      <div className={`text-lg font-bold ${wh.successRate >= 95 ? 'text-emerald-600' : wh.successRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                        {wh.successRate.toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-gray-400">success</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Incidents Tab ────────────────────────────────────────────────────────────

function IncidentsTab({ incidents }: { incidents: IncidentEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const openCount = incidents.filter(i => i.status !== 'resolved').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Open Incidents', value: incidents.filter(i => i.status === 'open').length, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Investigating', value: incidents.filter(i => i.status === 'investigating').length, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
          { label: 'Resolved (24h)', value: incidents.filter(i => i.status === 'resolved').length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl px-4 py-3 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {openCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertTriangle size={13} />
          <span className="font-semibold">{openCount} active incident{openCount > 1 ? 's' : ''} require attention</span>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Clock size={14} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-900">Incident Timeline</h2>
          <span className="ml-auto text-xs text-gray-400">{incidents.length} events</span>
        </div>
        <div className="divide-y divide-gray-50">
          {incidents.map(incident => {
            const sevCfg = ALERT_CONFIG[incident.severity];
            const statusCfg = INCIDENT_STATUS[incident.status];
            const SevIcon = sevCfg.icon;
            const isExpanded = expandedId === incident.id;

            return (
              <div key={incident.id} className={`${incident.status !== 'resolved' ? `${sevCfg.bg} border-l-4 ${sevCfg.border}` : ''}`}>
                <div
                  className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                >
                  <SevIcon size={15} className={`${sevCfg.color} mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{incident.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${sevCfg.color} ${sevCfg.bg} border ${sevCfg.border}`}>{incident.severity}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="font-medium text-gray-600">{incident.service}</span>
                      <span>·</span>
                      <span>{timeAgo(incident.timestamp)}</span>
                      {incident.duration && <><span>·</span><span>Duration: {incident.duration}</span></>}
                      {incident.resolvedAt && <><span>·</span><span className="text-emerald-600">Resolved {timeAgo(incident.resolvedAt)}</span></>}
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-gray-400 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="ml-6 p-3 bg-white border border-gray-200 rounded-xl">
                      <p className="text-xs text-gray-700 leading-relaxed">{incident.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                        <span>ID: <span className="font-mono">{incident.id}</span></span>
                        <span>Started: <span className="font-mono">{new Date(incident.timestamp).toISOString()}</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpsMonitoringPage() {
  const [metrics, setMetrics] = useState<ServiceMetric[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiMetric[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [incidents, setIncidents] = useState<IncidentEvent[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const load = useCallback(() => {
    setMetrics(generateMetrics());
    setApiMetrics(generateApiMetrics());
    setWebhooks(generateWebhooks());
    setIncidents(generateIncidents());
    setCronJobs(generateCronJobs());
    setAlerts(generateAlerts());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const now = new Date();
    setLastRefreshed(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, [metrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const handleAck = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));

  const unackedAlerts = alerts.filter(a => !a.acknowledged);
  const criticalCount = unackedAlerts.filter(a => a.severity === 'critical').length;
  const degradedCount = metrics.filter(m => m.status === 'degraded' || m.status === 'down').length;
  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const webhookIssues = webhooks.filter(w => w.status !== 'healthy' && w.status !== 'unknown').length;

  const TABS: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'api', label: 'API Metrics', icon: Server },
    { id: 'delivery', label: 'Delivery & Enrichment', icon: MessageSquare },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook, badge: webhookIssues },
    { id: 'incidents', label: 'Incident Timeline', icon: Clock, badge: openIncidents },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Real-Time Ops Dashboard</h1>
                <p className="text-xs text-gray-500">API health · delivery rates · enrichment syncs · webhook health · incident timeline</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {criticalCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  <AlertTriangle size={12} />{criticalCount} critical alert{criticalCount > 1 ? 's' : ''}
                </div>
              )}
              <button
                onClick={() => setAlertsMuted(!alertsMuted)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${alertsMuted ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {alertsMuted ? <BellOff size={12} /> : <Bell size={12} />}
                {alertsMuted ? 'Muted' : 'Alerts on'}
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${autoRefresh ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Wifi size={12} className={autoRefresh ? 'animate-pulse' : ''} />
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors">
                <RefreshCw size={12} />Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 -mb-4">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <Icon size={12} />
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">{tab.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">

          {/* Status Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Services Healthy', value: `${metrics.filter(m => m.status === 'healthy').length}/${metrics.length}`, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Degraded / Down', value: degradedCount, color: degradedCount > 0 ? 'text-amber-700' : 'text-gray-400', bg: degradedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200' },
              { label: 'Open Incidents', value: openIncidents, color: openIncidents > 0 ? 'text-red-700' : 'text-gray-400', bg: openIncidents > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200' },
              { label: 'Webhook Issues', value: webhookIssues, color: webhookIssues > 0 ? 'text-orange-700' : 'text-gray-400', bg: webhookIssues > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200' },
              { label: 'Unacked Alerts', value: unackedAlerts.length, color: unackedAlerts.length > 0 ? 'text-red-700' : 'text-gray-400', bg: unackedAlerts.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200' },
            ].map(k => (
              <div key={k.label} className={`border rounded-xl px-4 py-3 ${k.bg}`}>
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Active Alerts */}
          {unackedAlerts.length > 0 && !alertsMuted && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-orange-500" />
                <h2 className="text-sm font-semibold text-gray-900">Active Severity Alerts</h2>
                <span className="ml-auto text-xs text-gray-400">{unackedAlerts.length} unacknowledged</span>
              </div>
              <div className="space-y-2">
                {unackedAlerts.map(alert => <AlertRow key={alert.id} alert={alert} onAck={handleAck} />)}
              </div>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <>
              {/* Service Metrics Grid */}
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BarChart2 size={14} />Service Metrics
                  {lastRefreshed && <span className="text-xs text-gray-400 font-normal ml-auto">Last refreshed {lastRefreshed}</span>}
                </h2>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-44 bg-white border border-gray-200 rounded-2xl animate-pulse" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {metrics.map(metric => <MetricCard key={metric.id} metric={metric} />)}
                  </div>
                )}
              </div>

              {/* Cron Jobs */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={15} className="text-violet-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Cron Job Status</h2>
                  <span className="text-xs text-gray-400 ml-auto">{cronJobs.filter(j => j.status === 'running').length} running now</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {cronJobs.map(job => <CronJobRow key={job.id} job={job} />)}
                </div>
              </div>

              {/* Acknowledged Alerts */}
              {alerts.filter(a => a.acknowledged).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={14} className="text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-500">Acknowledged Alerts</h2>
                  </div>
                  <div className="space-y-2">
                    {alerts.filter(a => a.acknowledged).map(alert => <AlertRow key={alert.id} alert={alert} onAck={handleAck} />)}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'api' && <ApiMetricsTab apiMetrics={apiMetrics} />}
          {activeTab === 'delivery' && <DeliveryTab />}
          {activeTab === 'webhooks' && <WebhooksTab webhooks={webhooks} />}
          {activeTab === 'incidents' && <IncidentsTab incidents={incidents} />}

        </div>
      </div>
    </AppLayout>
  );
}
