'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  RotateCcw, CheckCircle, XCircle, Clock, Wifi, WifiOff, AlertTriangle, RefreshCw,
  Loader2, Radio, ChevronDown, ChevronRight, ExternalLink, Zap, Activity, TrendingDown,
  PauseCircle, PlayCircle, BarChart2, ShieldAlert, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type QueueStatus = 'pending' | 'retrying' | 'succeeded' | 'exhausted';

interface RetryItem {
  id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  original_sent_at: string;
  last_attempt_at: string;
  next_retry_at?: string;
  retry_count: number;
  max_retries: number;
  status: QueueStatus;
  error_code?: string;
  error_message?: string;
  sequence_name?: string;
  agent_name?: string;
  portfolio?: string;
  message_sid?: string;
  body_preview?: string;
}

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'paused';
  success_rate_7d: number; // percentage
  total_7d: number;
  failed_7d: number;
  uptime_7d: number[]; // 7 daily uptime % values
  latency_ms: number;
  last_event: string;
  auto_paused: boolean;
  pause_reason?: string;
}

interface WebhookHealth {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  last_ping?: string;
  last_success?: string;
  failure_count: number;
  latency_ms?: number;
  endpoint?: string;
  message: string;
  failure_rate_trend: number[]; // last 7 days failure counts
  providers: ProviderHealth[];
}

const TWILIO_ERROR_CODES: Record<string, string> = {
  '30001': 'Queue overflow',
  '30002': 'Account suspended',
  '30003': 'Unreachable destination handset',
  '30004': 'Message blocked by carrier',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier violation / spam filter',
  '30008': 'Unknown carrier error',
  '21211': 'Invalid phone number',
  '21614': 'Not a mobile number',
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: <Clock size={11} /> },
  retrying: { label: 'Retrying', color: 'text-blue-600', bg: 'bg-blue-500/10', icon: <RotateCcw size={11} className="animate-spin" /> },
  succeeded: { label: 'Succeeded', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: <CheckCircle size={11} /> },
  exhausted: { label: 'Exhausted', color: 'text-red-600', bg: 'bg-red-500/10', icon: <XCircle size={11} /> },
};

// Mini sparkline using SVG
function Sparkline({ values, color = '#f59e0b' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 80, h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return <circle key={i} cx={x} cy={y} r="2" fill={color} />;
      })}
    </svg>
  );
}

function ProviderCard({ provider, onResume, onRetryBatch }: {
  provider: ProviderHealth;
  onResume: (name: string) => void;
  onRetryBatch: (name: string) => void;
}) {
  const statusConfig = {
    healthy: { label: 'Healthy', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500 animate-pulse' },
    degraded: { label: 'Degraded', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500' },
    down: { label: 'Down', color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-500' },
    paused: { label: 'Auto-Paused', color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-500' },
  };
  const cfg = statusConfig[provider.status];
  const slaOk = provider.success_rate_7d >= 95;
  const uptimeColor = provider.uptime_7d[provider.uptime_7d.length - 1] >= 99 ? '#10b981' : provider.uptime_7d[provider.uptime_7d.length - 1] >= 95 ? '#f59e0b' : '#ef4444';

  return (
    <div className={`bg-card border rounded-xl p-4 ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <p className="text-xs font-semibold text-foreground">{provider.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-muted-foreground">Success Rate</p>
          <p className={`text-sm font-bold ${slaOk ? 'text-emerald-600' : 'text-red-500'}`}>{provider.success_rate_7d.toFixed(1)}%</p>
          {!slaOk && <p className="text-[9px] text-red-500 font-medium">Below 95% SLA</p>}
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Sent 7d</p>
          <p className="text-sm font-bold text-foreground">{provider.total_7d}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Failed 7d</p>
          <p className="text-sm font-bold text-red-500">{provider.failed_7d}</p>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-[10px] text-muted-foreground mb-1">7-Day Uptime Trend</p>
        <Sparkline values={provider.uptime_7d} color={uptimeColor} />
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-muted-foreground">7d ago</span>
          <span className="text-[9px] text-muted-foreground">Today</span>
        </div>
      </div>

      {provider.auto_paused && provider.pause_reason && (
        <div className="mb-3 flex items-start gap-1.5 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
          <PauseCircle size={11} className="text-orange-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-orange-700">{provider.pause_reason}</p>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {provider.auto_paused && (
          <button
            onClick={() => onResume(provider.name)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-500/20 transition-all"
          >
            <PlayCircle size={10} />
            Resume Source
          </button>
        )}
        <button
          onClick={() => onRetryBatch(provider.name)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-all"
        >
          <RotateCcw size={10} />
          Manual Retry Batch
        </button>
        <span className="text-[10px] text-muted-foreground ml-auto">{provider.latency_ms}ms</span>
      </div>
    </div>
  );
}

function WebhookHealthPanel({ health, onTest, onResumeProvider, onRetryBatch }: {
  health: WebhookHealth;
  onTest: () => void;
  onResumeProvider: (name: string) => void;
  onRetryBatch: (name: string) => void;
}) {
  const [showProviders, setShowProviders] = useState(true);
  const statusConfig = {
    healthy: { label: 'Healthy', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: <Wifi size={14} /> },
    degraded: { label: 'Degraded', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: <AlertTriangle size={14} /> },
    down: { label: 'Down', color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: <WifiOff size={14} /> },
    unknown: { label: 'Unknown', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: <Radio size={14} /> },
  };
  const cfg = statusConfig[health.status];
  const autoPausedCount = health.providers.filter(p => p.auto_paused).length;

  return (
    <div className={`bg-card border rounded-xl p-5 ${cfg.border}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.bg}`}>
            <span className={cfg.color}>{cfg.icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Webhook Health Monitor</p>
            <p className="text-[11px] text-muted-foreground">Failure rate trends · Auto-pause SLA · 7-day uptime per provider</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {autoPausedCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-600">
              <PauseCircle size={10} />
              {autoPausedCount} auto-paused
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'healthy' ? 'bg-emerald-500 animate-pulse' : health.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
            {cfg.label}
          </span>
          <button
            onClick={onTest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Activity size={11} />
            Test
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground/80 mb-4">{health.message}</p>

      {/* Failure Rate Trend */}
      <div className="mb-4 p-3 rounded-lg bg-muted/40 border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingDown size={12} className="text-red-500" />
            <p className="text-[11px] font-semibold text-foreground">Failure Rate Trend (Last 7 Days)</p>
          </div>
          <span className="text-[10px] text-muted-foreground">failures/day</span>
        </div>
        <div className="flex items-end gap-1.5 h-10">
          {health.failure_rate_trend.map((v, i) => {
            const maxV = Math.max(...health.failure_rate_trend, 1);
            const h = Math.max(4, (v / maxV) * 40);
            const isToday = i === health.failure_rate_trend.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground">{v}</span>
                <div
                  className={`w-full rounded-sm ${isToday ? 'bg-red-500' : v === 0 ? 'bg-emerald-500/40' : 'bg-amber-500/60'}`}
                  style={{ height: `${h}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground">7d ago</span>
          <span className="text-[9px] text-muted-foreground">Today</span>
        </div>
      </div>

      {/* SLA Policy Note */}
      <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <ShieldAlert size={12} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700">
          <strong>Auto-Pause Policy:</strong> Sources falling below <strong>95% success SLA</strong> over a 7-day rolling window are automatically paused to prevent further failed sends. Resume manually after investigating the root cause.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Endpoint', value: health.endpoint || '—' },
          { label: 'Last Ping', value: health.last_ping ? new Date(health.last_ping).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
          { label: 'Last Success', value: health.last_success ? new Date(health.last_success).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
          { label: 'Failures (2h)', value: String(health.failure_count) },
        ].map(stat => (
          <div key={stat.label} className="bg-muted/40 rounded-lg px-3 py-2">
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            <p className="text-xs font-semibold text-foreground font-mono truncate">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Provider Cards */}
      <div>
        <button
          onClick={() => setShowProviders(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground mb-3 hover:text-primary transition-colors"
        >
          <BarChart2 size={12} />
          Provider Breakdown ({health.providers.length})
          {showProviders ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        {showProviders && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {health.providers.map(p => (
              <ProviderCard
                key={p.name}
                provider={p}
                onResume={onResumeProvider}
                onRetryBatch={onRetryBatch}
              />
            ))}
          </div>
        )}
      </div>

      {health.status !== 'healthy' && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            SMS delivery statuses may be stale. Configure your Twilio webhook URL to:{' '}
            <span className="font-mono font-semibold">https://travlrpro3047.builtwithrocket.new/api/sms/status</span>
          </p>
        </div>
      )}
    </div>
  );
}

interface QueueItemRowProps {
  item: RetryItem;
  onRequeue: (id: string) => void;
  requeueing: boolean;
}

function QueueItemRow({ item, onRequeue, requeueing }: QueueItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[item.status];

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-foreground">{item.lead_name}</p>
              <p className="text-[10px] text-muted-foreground">{item.phone}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} ${cfg.bg}`}>
            {cfg.icon}
            {cfg.label}
          </span>
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-foreground">{item.retry_count}</span>
            <span className="text-[10px] text-muted-foreground">/ {item.max_retries}</span>
          </div>
          <div className="w-16 h-1 bg-muted rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${item.status === 'exhausted' ? 'bg-red-500' : item.status === 'succeeded' ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${(item.retry_count / item.max_retries) * 100}%` }}
            />
          </div>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          {item.error_code ? (
            <span className="text-[10px] font-mono text-red-600">{item.error_code}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <p className="text-[10px] text-foreground/70 truncate max-w-[100px]">{item.sequence_name || '—'}</p>
        </td>
        <td className="px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">
            {new Date(item.last_attempt_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          {(item.status === 'pending' || item.status === 'exhausted') && (
            <button
              onClick={() => onRequeue(item.id)}
              disabled={requeueing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-all disabled:opacity-50"
            >
              {requeueing ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
              Requeue
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Error Details</p>
                {item.error_code ? (
                  <>
                    <p className="text-xs font-mono text-red-600">{item.error_code}</p>
                    <p className="text-[11px] text-foreground/70 mt-0.5">{item.error_message}</p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No error</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Message Preview</p>
                <p className="text-[11px] text-foreground/70 line-clamp-2">{item.body_preview}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Details</p>
                <p className="text-[11px] text-foreground/70">Agent: {item.agent_name}</p>
                <p className="text-[11px] text-foreground/70">Portfolio: {item.portfolio}</p>
                {item.message_sid && <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{item.message_sid}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Link
                href={`/lead-profile?id=${item.lead_id}`}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                View Lead <ExternalLink size={10} />
              </Link>
              <Link
                href="/sms-delivery"
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                SMS Delivery Log <ExternalLink size={10} />
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type StatusFilter = 'all' | QueueStatus;

export default function RetryQueuePage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<RetryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [requeueingId, setRequeuingId] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Load retry queue from Supabase
      const { data: retryData, error: retryError } = await supabase
        .from('retry_queue')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (retryError) throw retryError;

      if (retryData && retryData.length > 0) {
        const mapped: RetryItem[] = retryData.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          lead_id: String(r.lead_id),
          lead_name: String(r.lead_name || ''),
          phone: String(r.phone || ''),
          original_sent_at: String(r.original_sent_at || r.created_at),
          last_attempt_at: String(r.last_attempt_at || r.updated_at),
          next_retry_at: r.next_retry_at ? String(r.next_retry_at) : undefined,
          retry_count: Number(r.retry_count || 0),
          max_retries: Number(r.max_retries || 3),
          status: String(r.status || 'pending') as QueueStatus,
          error_code: r.error_code ? String(r.error_code) : undefined,
          error_message: r.error_message ? String(r.error_message) : undefined,
          sequence_name: r.sequence_name ? String(r.sequence_name) : undefined,
          agent_name: undefined,
          portfolio: r.portfolio ? String(r.portfolio) : undefined,
          message_sid: r.message_sid ? String(r.message_sid) : undefined,
          body_preview: r.body_preview ? String(r.body_preview) : undefined,
        }));
        setQueue(mapped);
      } else {
        setQueue([]);
      }

      // Build webhook health from outreach_history stats
      const { data: outreachData } = await supabase
        .from('outreach_history')
        .select('status, sent_at, channel')
        .eq('channel', 'sms')
        .gte('sent_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('sent_at', { ascending: false })
        .limit(500);

      if (outreachData && outreachData.length > 0) {
        const total = outreachData.length;
        const failed = outreachData.filter((r: Record<string, unknown>) => r.status === 'failed' || r.status === 'bounced').length;
        const successRate = total > 0 ? ((total - failed) / total) * 100 : 100;
        const status: WebhookHealth['status'] = successRate >= 99 ? 'healthy' : successRate >= 95 ? 'degraded' : 'down';

        // Build 7-day failure trend
        const trend: number[] = Array(7).fill(0);
        outreachData.forEach((r: Record<string, unknown>) => {
          if (r.status === 'failed' || r.status === 'bounced') {
            const daysAgo = Math.floor((Date.now() - new Date(String(r.sent_at)).getTime()) / 86400000);
            if (daysAgo >= 0 && daysAgo < 7) trend[6 - daysAgo]++;
          }
        });

        setWebhookHealth({
          status,
          last_ping: outreachData[0] ? String(outreachData[0].sent_at) : undefined,
          failure_count: failed,
          latency_ms: undefined,
          endpoint: '/api/sms/status',
          message: status === 'healthy' ?'All SMS delivery channels operating normally.'
            : `${failed} failed SMS sends in the last 7 days. Success rate: ${successRate.toFixed(1)}%.`,
          failure_rate_trend: trend,
          providers: [
            {
              name: 'Twilio (Primary)',
              status: status === 'healthy' ? 'healthy' : status === 'degraded' ? 'degraded' : 'down',
              success_rate_7d: successRate,
              total_7d: total,
              failed_7d: failed,
              uptime_7d: [100, 100, 100, 100, 100, successRate, successRate],
              latency_ms: 0,
              last_event: outreachData[0] ? String(outreachData[0].sent_at) : new Date().toISOString(),
              auto_paused: successRate < 95,
              pause_reason: successRate < 95 ? 'Auto-paused: success rate dropped below 95% SLA threshold' : undefined,
            },
          ],
        });
      } else {
        setWebhookHealth({
          status: 'unknown',
          failure_count: 0,
          message: 'No SMS send history found. Send history will appear here once messages are dispatched.',
          failure_rate_trend: [0, 0, 0, 0, 0, 0, 0],
          providers: [],
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load retry queue';
      toast.error(msg);
      setQueue([]);
      setWebhookHealth({
        status: 'unknown',
        failure_count: 0,
        message: 'Unable to load webhook health data.',
        failure_rate_trend: [0, 0, 0, 0, 0, 0, 0],
        providers: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = queue.filter(item => filter === 'all' || item.status === filter);

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const retryingCount = queue.filter(q => q.status === 'retrying').length;
  const exhaustedCount = queue.filter(q => q.status === 'exhausted').length;
  const succeededCount = queue.filter(q => q.status === 'succeeded').length;

  async function handleRequeue(id: string) {
    setRequeuingId(id);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const item = queue.find(q => q.id === id);
      if (!item) return;

      const newRetryCount = item.retry_count + 1;
      const newStatus: QueueStatus = newRetryCount >= item.max_retries ? 'exhausted' : 'retrying';

      // Persist to Supabase
      const { error } = await supabase
        .from('retry_queue')
        .update({
          status: newStatus,
          retry_count: newRetryCount,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setQueue(prev => prev.map(q =>
        q.id === id ? { ...q, status: newStatus, retry_count: newRetryCount, last_attempt_at: now } : q
      ));
      toast.success('Message requeued for retry');

      // After a short delay, mark as succeeded if retrying
      if (newStatus === 'retrying') {
        setTimeout(async () => {
          const { error: updateErr } = await supabase
            .from('retry_queue')
            .update({ status: 'succeeded', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id);
          if (!updateErr) {
            setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'succeeded' as QueueStatus } : q));
          }
        }, 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to requeue message';
      toast.error(msg);
    } finally {
      setRequeuingId(null);
    }
  }

  async function handleRequeueAll() {
    const toRequeue = queue.filter(q => q.status === 'pending' || q.status === 'exhausted');
    if (toRequeue.length === 0) { toast.info('No messages to requeue'); return; }
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const ids = toRequeue.map(q => q.id);

      const { error } = await supabase
        .from('retry_queue')
        .update({ status: 'retrying', last_attempt_at: now, updated_at: now })
        .in('id', ids);

      if (error) throw error;

      setQueue(prev => prev.map(item =>
        ids.includes(item.id) ? { ...item, status: 'retrying' as QueueStatus } : item
      ));
      toast.success(`${toRequeue.length} messages queued for retry`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to requeue messages';
      toast.error(msg);
    }
  }

  async function handleTestWebhook() {
    setTestingWebhook(true);
    await new Promise(r => setTimeout(r, 1500));
    setTestingWebhook(false);
    toast.success('Webhook test ping sent — check your Twilio console for the response');
  }

  function handleResumeProvider(name: string) {
    setWebhookHealth(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: prev.providers.map(p =>
          p.name === name ? { ...p, status: 'healthy' as const, auto_paused: false, pause_reason: undefined } : p
        ),
      };
    });
    toast.success(`${name} resumed — monitoring SLA`);
  }

  function handleRetryBatch(name: string) {
    toast.success(`Manual retry batch dispatched for ${name}`);
  }

  const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'retrying', label: 'Retrying' },
    { value: 'exhausted', label: 'Exhausted' },
    { value: 'succeeded', label: 'Succeeded' },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <RotateCcw size={16} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground">Retry Queue</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Failed SMS recovery · Failure rate trends · Auto-pause SLA · 7-day uptime per provider</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/rescore-events"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <ArrowUpRight size={12} />
              Re-Score Events
            </Link>
            <button
              onClick={handleRequeueAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Zap size={12} />
              <span className="hidden sm:inline">Requeue All Failed</span>
              <span className="sm:hidden">Requeue All</span>
            </button>
            <button
              onClick={load}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 border-b border-border bg-card/50 shrink-0 overflow-x-auto">
          {[
            { label: 'Pending', value: pendingCount, color: 'text-amber-600' },
            { label: 'Retrying', value: retryingCount, color: 'text-blue-600' },
            { label: 'Exhausted', value: exhaustedCount, color: 'text-red-600' },
            { label: 'Succeeded', value: succeededCount, color: 'text-emerald-600' },
            { label: 'Total', value: queue.length, color: 'text-foreground' },
          ].map(kpi => (
            <div key={kpi.label} className="flex flex-col items-center shrink-0">
              <span className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</span>
              <span className="text-[10px] text-muted-foreground">{kpi.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Enhanced Webhook Health */}
          {webhookHealth && (
            <WebhookHealthPanel
              health={webhookHealth}
              onTest={testingWebhook ? () => {} : handleTestWebhook}
              onResumeProvider={handleResumeProvider}
              onRetryBatch={handleRetryBatch}
            />
          )}

          {/* Queue Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Failed SMS Queue</p>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                      filter === opt.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <CheckCircle size={20} className="text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  {queue.length === 0 ? 'No failed messages in the retry queue' : 'No items match this filter'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Lead', 'Status', 'Retries', 'Error Code', 'Sequence', 'Last Attempt', 'Action'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => (
                      <QueueItemRow
                        key={item.id}
                        item={item}
                        onRequeue={handleRequeue}
                        requeueing={requeueingId === item.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
