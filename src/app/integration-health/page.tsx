'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Clock, Activity, Shield, Phone, Mail, FileText, Database, TrendingUp, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type ApiStatus = 'operational' | 'degraded' | 'down' | 'unknown';

interface ErrorEntry {
  id: string;
  timestamp: string;
  message: string;
  code?: string;
}

interface FallbackHealth {
  enabled: boolean;
  mode: 'simulation' | 'cache' | 'none';
  lastFallbackAt: string | null;
  fallbackCount24h: number;
}

interface ApiIntegration {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  status: ApiStatus;
  lastSyncAt: string | null;
  lastSyncDurationMs: number | null;
  errorCount24h: number;
  errorCount7d: number;
  successRate7d: number;
  avgLatencyMs: number;
  recentErrors: ErrorEntry[];
  fallback: FallbackHealth;
  envKeySet: boolean;
  endpoint: string;
  notes: string;
}

// ─── Static metadata (cosmetic only — real status comes from /api/integration-health/status) ──

interface IntegrationMeta {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  fallbackEnabled: boolean;
  fallbackMode: FallbackHealth['mode'];
  endpoint: string;
  notes: string;
}

const INTEGRATION_META: IntegrationMeta[] = [
  {
    id: 'batchdata',
    name: 'BatchData',
    category: 'Data Enrichment',
    icon: Database,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    fallbackEnabled: true,
    fallbackMode: 'simulation',
    endpoint: '/api/enrichment/batchdata',
    notes: 'Stage 1 owner lookup. Runs on every new lead intake. Falls back to deterministic simulation when key is unset.',
  },
  {
    id: 'pdl',
    name: 'People Data Labs',
    category: 'Contact Enrichment',
    icon: TrendingUp,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    fallbackEnabled: true,
    fallbackMode: 'simulation',
    endpoint: '/api/enrichment/pdl-auto-enrich',
    notes: 'Stage 2 contact enrichment for leads scoring ≥70. Requires PDL_API_KEY. Currently in simulation mode.',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'SMS & Voice',
    icon: Phone,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    fallbackEnabled: false,
    fallbackMode: 'none',
    endpoint: '/api/sms/send',
    notes: 'SMS outreach and voice calls. Requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.',
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'Email Delivery',
    icon: Mail,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    fallbackEnabled: false,
    fallbackMode: 'none',
    endpoint: '/api/send-workflow-step',
    notes: 'Transactional email for cadence sequences and homeowner notifications. RESEND_API_KEY is configured.',
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    category: 'Document Signing',
    icon: FileText,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    fallbackEnabled: false,
    fallbackMode: 'none',
    endpoint: '/api/docusign/create-envelope',
    notes: 'Embedded signing for agreements. Requires DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY, DOCUSIGN_TEMPLATE_ID.',
  },
];

function buildInitialIntegrations(): ApiIntegration[] {
  return INTEGRATION_META.map(meta => ({
    ...meta,
    status: 'unknown',
    lastSyncAt: null,
    lastSyncDurationMs: null,
    errorCount24h: 0,
    errorCount7d: 0,
    successRate7d: 0,
    avgLatencyMs: 0,
    recentErrors: [],
    fallback: { enabled: meta.fallbackEnabled, mode: meta.fallbackMode, lastFallbackAt: null, fallbackCount24h: 0 },
    envKeySet: false,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(s: ApiStatus) {
  if (s === 'operational') return 'Operational';
  if (s === 'degraded') return 'Degraded';
  if (s === 'down') return 'Down';
  return 'Unknown';
}

function statusColor(s: ApiStatus) {
  if (s === 'operational') return 'text-emerald-500';
  if (s === 'degraded') return 'text-amber-500';
  if (s === 'down') return 'text-red-500';
  return 'text-slate-400';
}

function statusBg(s: ApiStatus) {
  if (s === 'operational') return 'bg-emerald-500/10 border-emerald-500/20';
  if (s === 'degraded') return 'bg-amber-500/10 border-amber-500/20';
  if (s === 'down') return 'bg-red-500/10 border-red-500/20';
  return 'bg-slate-500/10 border-slate-500/20';
}

function StatusIcon({ status, size = 16 }: { status: ApiStatus; size?: number }) {
  if (status === 'operational') return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === 'degraded') return <AlertTriangle size={size} className="text-amber-500" />;
  if (status === 'down') return <XCircle size={size} className="text-red-500" />;
  return <AlertCircle size={size} className="text-slate-400" />;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function LatencyBar({ ms, max = 1000 }: { ms: number; max?: number }) {
  const pct = Math.min((ms / max) * 100, 100);
  const color = ms < 300 ? 'bg-emerald-500' : ms < 700 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">{ms}ms</span>
    </div>
  );
}

function SuccessRateBar({ rate }: { rate: number }) {
  const color = rate >= 99 ? 'bg-emerald-500' : rate >= 95 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">{rate.toFixed(1)}%</span>
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────

function IntegrationCard({ integration, onPing }: { integration: ApiIntegration; onPing: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [pinging, setPinging] = useState(false);

  const handlePing = async () => {
    setPinging(true);
    await new Promise(r => setTimeout(r, 1200));
    setPinging(false);
    onPing(integration.id);
  };

  const Icon = integration.icon;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${statusBg(integration.status)}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${integration.iconBg}`}>
              <Icon size={20} className={integration.iconColor} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-sm">{integration.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{integration.category}</span>
                {!integration.envKeySet && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">Key not set</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{integration.notes}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium ${statusBg(integration.status)} ${statusColor(integration.status)}`}>
              <StatusIcon status={integration.status} size={12} />
              {statusLabel(integration.status)}
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Sync</p>
            <div className="flex items-center gap-1">
              <Clock size={11} className="text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{relativeTime(integration.lastSyncAt)}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Errors 24h</p>
            <span className={`text-xs font-bold ${integration.errorCount24h > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {integration.errorCount24h}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Success 7d</p>
            {integration.successRate7d > 0 ? (
              <SuccessRateBar rate={integration.successRate7d} />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg Latency</p>
            {integration.avgLatencyMs > 0 ? (
              <LatencyBar ms={integration.avgLatencyMs} />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Fallback health */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {integration.fallback.enabled ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield size={11} className="text-blue-400" />
                <span>Fallback: <span className="text-blue-400 font-medium">{integration.fallback.mode}</span></span>
                {integration.fallback.fallbackCount24h > 0 && (
                  <span className="text-amber-500">({integration.fallback.fallbackCount24h} triggers today)</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield size={11} className="text-slate-400" />
                <span>No fallback configured</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePing}
              disabled={pinging}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={pinging ? 'animate-spin' : ''} />
              {pinging ? 'Pinging…' : 'Ping'}
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Less' : 'Details'}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded error log */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 p-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Endpoint</p>
            <code className="text-[11px] font-mono text-foreground bg-muted px-2 py-0.5 rounded">{integration.endpoint}</code>
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Error Log</p>
          {integration.recentErrors.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <AlertCircle size={13} />
              Error-rate tracking is not implemented yet — status above reflects a live configuration/reachability check only.
            </div>
          ) : (
            <div className="space-y-2">
              {integration.recentErrors.map(err => (
                <div key={err.id} className="flex items-start gap-2 bg-red-500/5 border border-red-500/10 rounded-lg p-2.5">
                  <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] text-foreground">{err.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{relativeTime(err.timestamp)}</span>
                      {err.code && <span className="text-[10px] font-mono bg-muted px-1 rounded text-muted-foreground">code: {err.code}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {integration.fallback.lastFallbackAt && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-500">
              <RotateCcw size={11} />
              Last fallback triggered: {relativeTime(integration.fallback.lastFallbackAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationHealthPage() {
  const [integrations, setIntegrations] = useState<ApiIntegration[]>(buildInitialIntegrations);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ApiStatus | 'all'>('all');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/integration-health/status', { cache: 'no-store' });
      const data = await res.json();
      const live = data.integrations || {};
      const checkedAt = data.checkedAt || new Date().toISOString();
      setIntegrations(prev => prev.map(i => {
        const result = live[i.id];
        if (!result) return i;
        return {
          ...i,
          status: result.status as ApiStatus,
          envKeySet: Boolean(result.configured),
          lastSyncAt: checkedAt,
          recentErrors: result.status === 'operational' ? [] : [
            { id: `${i.id}-live`, timestamp: checkedAt, message: result.message },
          ],
        };
      }));
      setLastRefreshed(new Date(checkedAt));
    } catch {
      // leave existing state on failure
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { handleRefresh(); }, [handleRefresh]);

  const handlePing = useCallback((id: string) => {
    handleRefresh();
  }, [handleRefresh]);

  const filtered = filter === 'all' ? integrations : integrations.filter(i => i.status === filter);

  const counts = {
    operational: integrations.filter(i => i.status === 'operational').length,
    degraded: integrations.filter(i => i.status === 'degraded').length,
    down: integrations.filter(i => i.status === 'down').length,
    unknown: integrations.filter(i => i.status === 'unknown').length,
  };

  const totalErrors24h = integrations.reduce((s, i) => s + i.errorCount24h, 0);
  const totalErrors7d = integrations.reduce((s, i) => s + i.errorCount7d, 0);
  const avgSuccess = integrations.filter(i => i.successRate7d > 0).reduce((s, i, _, a) => s + i.successRate7d / a.length, 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Integration Health</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live configuration and reachability checks for outreach integrations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              Refreshed {lastRefreshed ? relativeTime(lastRefreshed.toISOString()) : 'Never'}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh All'}
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Operational</span>
            </div>
            <p className="text-2xl font-bold text-emerald-500">{counts.operational}</p>
            <p className="text-[10px] text-muted-foreground">of {integrations.length} integrations</p>
          </div>
          <div className="bg-card border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Degraded</span>
            </div>
            <p className="text-2xl font-bold text-amber-500">{counts.degraded}</p>
            <p className="text-[10px] text-muted-foreground">needs attention</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={16} className="text-red-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Errors 24h</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalErrors24h}</p>
            <p className="text-[10px] text-muted-foreground">{totalErrors7d} in last 7 days</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-blue-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Success</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{avgSuccess > 0 ? avgSuccess.toFixed(1) + '%' : '—'}</p>
            <p className="text-[10px] text-muted-foreground">7-day rolling average</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'operational', 'degraded', 'down', 'unknown'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? `All (${integrations.length})` : `${statusLabel(f as ApiStatus)} (${counts[f as keyof typeof counts] ?? 0})`}
            </button>
          ))}
        </div>

        {/* Integration cards */}
        <div className="space-y-3">
          {filtered.map(integration => (
            <IntegrationCard key={integration.id} integration={integration} onPing={handlePing} />
          ))}
        </div>

        {/* Legend */}
        <div className="bg-muted/30 border border-border rounded-xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status Legend</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { status: 'operational' as ApiStatus, desc: 'API responding normally, no recent errors' },
              { status: 'degraded' as ApiStatus, desc: 'API key missing or elevated error rate' },
              { status: 'down' as ApiStatus, desc: 'API unreachable or returning 5xx errors' },
              { status: 'unknown' as ApiStatus, desc: 'No calls made yet — credentials not configured' },
            ].map(({ status, desc }) => (
              <div key={status} className="flex items-start gap-2">
                <StatusIcon status={status} size={14} />
                <div>
                  <p className={`text-[11px] font-medium ${statusColor(status)}`}>{statusLabel(status)}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
