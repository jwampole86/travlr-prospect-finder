'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw, Globe, Database, MessageSquare, Mail, Webhook, Server, ChevronDown, ChevronUp, Activity, Shield, Zap } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

interface ServiceCheck {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: ServiceStatus;
  uptime30d: number | null;
  uptime90d: number | null;
  responseTime?: number;
  lastChecked: string;
  slaTarget: number;
}

interface IncidentEntry {
  id: string;
  title: string;
  service: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string;
  resolvedAt?: string;
  updates: { time: string; message: string }[];
}

interface UptimeBucket {
  date: string;
  status: ServiceStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: ServiceStatus) {
  if (s === 'operational') return 'bg-emerald-500';
  if (s === 'degraded') return 'bg-amber-400';
  if (s === 'outage') return 'bg-red-500';
  return 'bg-slate-400';
}

function statusTextColor(s: ServiceStatus) {
  if (s === 'operational') return 'text-emerald-600';
  if (s === 'degraded') return 'text-amber-600';
  if (s === 'outage') return 'text-red-600';
  return 'text-slate-500';
}

function statusBg(s: ServiceStatus) {
  if (s === 'operational') return 'bg-emerald-50 border-emerald-200';
  if (s === 'degraded') return 'bg-amber-50 border-amber-200';
  if (s === 'outage') return 'bg-red-50 border-red-200';
  return 'bg-slate-50 border-slate-200';
}

function statusLabel(s: ServiceStatus) {
  if (s === 'operational') return 'Operational';
  if (s === 'degraded') return 'Degraded';
  if (s === 'outage') return 'Outage';
  return 'Maintenance';
}

function slaClass(uptime: number | null, target: number) {
  if (uptime === null) return 'text-slate-500 font-semibold';
  if (uptime >= target) return 'text-emerald-600 font-semibold';
  if (uptime >= target - 0.5) return 'text-amber-600 font-semibold';
  return 'text-red-600 font-semibold';
}

function incidentSeverityBadge(s: IncidentEntry['severity']) {
  if (s === 'critical') return 'bg-red-100 text-red-700 border border-red-200';
  if (s === 'major') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-blue-100 text-blue-700 border border-blue-200';
}

function incidentStatusBadge(s: IncidentEntry['status']) {
  if (s === 'resolved') return 'bg-emerald-100 text-emerald-700';
  if (s === 'monitoring') return 'bg-blue-100 text-blue-700';
  if (s === 'identified') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function genUptimeBuckets(baseStatus: ServiceStatus): UptimeBucket[] {
  const buckets: UptimeBucket[] = [];
  const now = Date.now();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    let status: ServiceStatus = 'operational';
    if (baseStatus === 'degraded' && i < 3) status = 'degraded';
    if (baseStatus === 'outage' && i === 0) status = 'outage';
    if (i === 14 || i === 31) status = 'degraded';
    if (i === 45) status = 'outage';
    buckets.push({ date: label, status });
  }
  return buckets;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SERVICES: ServiceCheck[] = [
  {
    id: 'api', name: 'REST API', description: 'Core application API endpoints',
    icon: Server, status: 'operational', uptime30d: 99.94, uptime90d: 99.87,
    responseTime: 142, lastChecked: new Date(Date.now() - 30000).toISOString(), slaTarget: 99.9,
  },
  {
    id: 'database', name: 'Database', description: 'Supabase PostgreSQL — read/write operations',
    icon: Database, status: 'operational', uptime30d: 99.98, uptime90d: 99.96,
    responseTime: 8, lastChecked: new Date(Date.now() - 15000).toISOString(), slaTarget: 99.9,
  },
  {
    id: 'sms', name: 'SMS Delivery', description: 'Twilio SMS send & status webhooks',
    icon: MessageSquare, status: 'operational', uptime30d: 99.72, uptime90d: 99.61,
    responseTime: 210, lastChecked: new Date(Date.now() - 45000).toISOString(), slaTarget: 99.5,
  },
  {
    id: 'email', name: 'Email Delivery', description: 'Resend transactional email service',
    icon: Mail, status: 'degraded', uptime30d: 98.84, uptime90d: 99.21,
    responseTime: 380, lastChecked: new Date(Date.now() - 60000).toISOString(), slaTarget: 99.5,
  },
  {
    id: 'webhooks', name: 'Webhook Endpoints', description: 'Inbound webhooks — Twilio, DocuSign, Cadence',
    icon: Webhook, status: 'degraded', uptime30d: 97.40, uptime90d: 98.10,
    responseTime: 88, lastChecked: new Date(Date.now() - 20000).toISOString(), slaTarget: 99.0,
  },
  {
    id: 'enrichment', name: 'Enrichment Sync', description: 'SalesGenie & third-party data enrichment',
    icon: Zap, status: 'operational', uptime30d: 99.10, uptime90d: 98.90,
    responseTime: 1840, lastChecked: new Date(Date.now() - 90000).toISOString(), slaTarget: 99.0,
  },
];

const INCIDENTS: IncidentEntry[] = [
  {
    id: 'inc-001',
    title: 'Email bounce rate elevated — Resend domain reputation',
    service: 'Email Delivery',
    severity: 'major',
    status: 'monitoring',
    startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    updates: [
      { time: new Date(Date.now() - 2 * 3600000).toISOString(), message: 'Investigating elevated bounce rates (4.8%) on outbound email campaigns.' },
      { time: new Date(Date.now() - 90 * 60000).toISOString(), message: 'Identified: sending domain reputation flagged by Gmail. Resend support engaged.' },
      { time: new Date(Date.now() - 30 * 60000).toISOString(), message: 'Monitoring: domain warm-up initiated. Bounce rate trending down to 3.2%.' },
    ],
  },
  {
    id: 'inc-002',
    title: 'DocuSign webhook HMAC validation failures',
    service: 'Webhook Endpoints',
    severity: 'major',
    status: 'identified',
    startedAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    updates: [
      { time: new Date(Date.now() - 72 * 3600000).toISOString(), message: 'DocuSign envelope event webhooks returning 401 — HMAC secret mismatch.' },
      { time: new Date(Date.now() - 48 * 3600000).toISOString(), message: 'Root cause identified: DocuSign credentials not configured in production environment.' },
    ],
  },
  {
    id: 'inc-003',
    title: 'SalesGenie API timeout — enrichment sync degraded',
    service: 'Enrichment Sync',
    severity: 'minor',
    status: 'resolved',
    startedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    resolvedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    updates: [
      { time: new Date(Date.now() - 5 * 86400000).toISOString(), message: 'SalesGenie API returning 504 timeouts on batch enrichment requests.' },
      { time: new Date(Date.now() - 4.5 * 86400000).toISOString(), message: 'SalesGenie confirmed infrastructure maintenance window.' },
      { time: new Date(Date.now() - 4 * 86400000).toISOString(), message: 'Resolved: SalesGenie maintenance complete. Enrichment sync restored to normal.' },
    ],
  },
  {
    id: 'inc-004',
    title: 'Database connection pool exhaustion — brief query latency spike',
    service: 'Database',
    severity: 'minor',
    status: 'resolved',
    startedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    resolvedAt: new Date(Date.now() - 14 * 86400000 + 45 * 60000).toISOString(),
    updates: [
      { time: new Date(Date.now() - 14 * 86400000).toISOString(), message: 'Query latency spiked to 480ms avg — connection pool at 100% utilization.' },
      { time: new Date(Date.now() - 14 * 86400000 + 20 * 60000).toISOString(), message: 'Pool size increased from 20 to 40 connections. Latency recovering.' },
      { time: new Date(Date.now() - 14 * 86400000 + 45 * 60000).toISOString(), message: 'Resolved: query latency returned to baseline (8ms avg).' },
    ],
  },
];

// ─── Uptime Bar Component ─────────────────────────────────────────────────────

function UptimeBar({ buckets }: { buckets: UptimeBucket[] }) {
  return (
    <div className="flex gap-px items-end h-6">
      {buckets.map((b, i) => (
        <div
          key={i}
          title={`${b.date}: ${statusLabel(b.status)}`}
          className={`flex-1 rounded-sm h-full ${statusColor(b.status)} opacity-80 hover:opacity-100 transition-opacity cursor-default`}
        />
      ))}
    </div>
  );
}

// ─── Service Row ──────────────────────────────────────────────────────────────

function ServiceRow({ svc }: { svc: ServiceCheck }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = svc.icon;
  const buckets = genUptimeBuckets(svc.status);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${statusBg(svc.status)}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/5 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-white/80 border border-white flex items-center justify-center shrink-0 shadow-sm">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{svc.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              svc.status === 'operational' ? 'bg-emerald-100 text-emerald-700' :
              svc.status === 'degraded'? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>
              {statusLabel(svc.status)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{svc.description}</p>
        </div>
        <div className="hidden sm:flex items-center gap-6 shrink-0">
          <div className="text-right">
            <p className={`text-sm ${slaClass(svc.uptime30d, svc.slaTarget)}`}>{svc.uptime30d === null ? 'Not tracked' : `${svc.uptime30d.toFixed(2)}%`}</p>
            <p className="text-[10px] text-slate-400">30d uptime</p>
          </div>
          <div className="text-right">
            <p className={`text-sm ${slaClass(svc.uptime90d, svc.slaTarget)}`}>{svc.uptime90d === null ? 'Not tracked' : `${svc.uptime90d.toFixed(2)}%`}</p>
            <p className="text-[10px] text-slate-400">90d uptime</p>
          </div>
          {svc.responseTime !== undefined && (
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{svc.responseTime}ms</p>
              <p className="text-[10px] text-slate-400">response</p>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-white/60">
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">90-day uptime history</span>
              <span className="text-xs text-slate-400">SLA target: {svc.slaTarget}%</span>
            </div>
            {svc.uptime90d === null ? (
              <p className="text-xs text-slate-500 bg-white/70 rounded-lg p-3 border border-white">Historical uptime is not available yet. Current status is based on the latest live check.</p>
            ) : <UptimeBar buckets={buckets} />}
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">90 days ago</span>
              <span className="text-[10px] text-slate-400">Today</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/70 rounded-lg p-3 border border-white">
              <p className={`text-base font-bold ${slaClass(svc.uptime30d, svc.slaTarget)}`}>{svc.uptime30d === null ? 'Not tracked' : `${svc.uptime30d.toFixed(2)}%`}</p>
              <p className="text-[10px] text-slate-500">30-day uptime</p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 border border-white">
              <p className={`text-base font-bold ${slaClass(svc.uptime90d, svc.slaTarget)}`}>{svc.uptime90d === null ? 'Not tracked' : `${svc.uptime90d.toFixed(2)}%`}</p>
              <p className="text-[10px] text-slate-500">90-day uptime</p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 border border-white">
              <p className="text-base font-bold text-slate-700">{svc.slaTarget}%</p>
              <p className="text-[10px] text-slate-500">SLA target</p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 border border-white">
              <p className={`text-base font-bold ${svc.uptime30d === null ? 'text-slate-500' : svc.uptime30d >= svc.slaTarget ? 'text-emerald-600' : 'text-red-600'}`}>
                {svc.uptime30d === null ? 'Not tracked' : svc.uptime30d >= svc.slaTarget ? 'Met' : 'Breached'}
              </p>
              <p className="text-[10px] text-slate-500">SLA status</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Incident Card ────────────────────────────────────────────────────────────

function IncidentCard({ inc }: { inc: IncidentEntry }) {
  const [expanded, setExpanded] = useState(inc.status !== 'resolved');

  function fmt(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="mt-0.5 shrink-0">
          {inc.status === 'resolved'
            ? <CheckCircle size={16} className="text-emerald-500" />
            : inc.severity === 'critical'
            ? <XCircle size={16} className="text-red-500" />
            : <AlertTriangle size={16} className="text-amber-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{inc.title}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${incidentSeverityBadge(inc.severity)}`}>
              {inc.severity.toUpperCase()}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${incidentStatusBadge(inc.status)}`}>
              {inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-slate-500">{inc.service}</span>
            <span className="text-xs text-slate-400">Started {fmt(inc.startedAt)}</span>
            {inc.resolvedAt && <span className="text-xs text-emerald-600">Resolved {fmt(inc.resolvedAt)}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0 mt-1" /> : <ChevronDown size={14} className="text-slate-400 shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <div className="mt-4 space-y-3">
            {inc.updates.map((u, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                  {i < inc.updates.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-[10px] text-slate-400 mb-0.5">{fmt(u.time)}</p>
                  <p className="text-xs text-slate-700">{u.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [lastRefresh, setLastRefresh] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [services, setServices] = useState<ServiceCheck[]>([]);
  const [incidents] = useState<IncidentEntry[]>([]);

  useEffect(() => {
    void handleRefresh();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/system/health', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      const result = await response.json() as { checkedAt: string; checks: Record<string, { status: ServiceStatus; responseTime: number | null }> };
      setServices(SERVICES.map((definition) => ({
        ...definition,
        status: result.checks[definition.id]?.status ?? 'maintenance',
        responseTime: result.checks[definition.id]?.responseTime ?? undefined,
        uptime30d: null,
        uptime90d: null,
        lastChecked: result.checkedAt,
      })));
      setLastRefresh(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      setServices(SERVICES.map((definition) => ({ ...definition, status: 'outage', uptime30d: null, uptime90d: null, responseTime: undefined })));
    } finally {
      setRefreshing(false);
    }
  }

  const displayedServices = services.length > 0 ? services : SERVICES.map((service) => ({ ...service, status: 'maintenance' as ServiceStatus, uptime30d: null, uptime90d: null }));
  const overallStatus: ServiceStatus = displayedServices.some(s => s.status === 'outage')
    ? 'outage'
    : displayedServices.some(s => s.status === 'degraded')
    ? 'degraded' :'operational';

  const activeIncidents = incidents.filter(i => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter(i => i.status === 'resolved');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className={`border-b ${overallStatus === 'operational' ? 'bg-emerald-600' : overallStatus === 'degraded' ? 'bg-amber-500' : 'bg-red-600'}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Activity size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">TRAVLR System Status</h1>
                <p className="text-sm text-white/80">Real-time service health &amp; uptime</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
                <div className={`w-2.5 h-2.5 rounded-full ${overallStatus === 'operational' ? 'bg-white animate-pulse' : 'bg-white'}`} />
                <span className="text-sm font-semibold text-white">
                  {overallStatus === 'operational' ? 'All Systems Operational' : overallStatus === 'degraded' ? 'Partial Degradation' : 'Service Outage'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Refresh bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={12} />
            {lastRefresh && <span>Last updated {lastRefresh}</span>}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Active incidents banner */}
        {activeIncidents.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{activeIncidents.length} Active Incident{activeIncidents.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-700 mt-0.5">Some services are experiencing issues. See incident details below.</p>
            </div>
          </div>
        )}

        {/* SLA Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'API Status', service: 'api' },
            { label: 'Database Status', service: 'database' },
            { label: 'SMS Configuration', service: 'sms' },
            { label: 'Email Configuration', service: 'email' },
          ].map((m) => {
            const service = displayedServices.find((item) => item.id === m.service);
            const ok = service?.status === 'operational';
            const value = service ? statusLabel(service.status) : 'Checking…';
            return (
            <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className={`text-lg font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
              <div className={`mt-2 flex items-center gap-1 text-[10px] font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                <Shield size={10} />
                {ok ? 'Current check passed' : 'Requires attention'}
              </div>
            </div>
            );
          })}
        </div>

        {/* Services */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Services</h2>
          <div className="space-y-2">
            {displayedServices.map(svc => <ServiceRow key={svc.id} svc={svc} />)}
          </div>
        </div>

        {/* Active Incidents */}
        {activeIncidents.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Active Incidents</h2>
            <div className="space-y-3">
              {activeIncidents.map(inc => <IncidentCard key={inc.id} inc={inc} />)}
            </div>
          </div>
        )}

        {/* Incident History */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Incident History</h2>
          {resolvedIncidents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No resolved incidents in the past 90 days.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {resolvedIncidents.map(inc => <IncidentCard key={inc.id} inc={inc} />)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span>Operational</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /><span>Degraded</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /><span>Outage</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-400" /><span>Maintenance</span></div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Globe size={11} />
            <span>status.travlr.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
