'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Webhook, RefreshCw, Search, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, Copy, Filter, User, MapPin, Phone, Mail, ArrowRight, Inbox,  } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookLog {
  id: string;
  source: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processing' | 'matched' | 'created' | 'error';
  lead_id: string | null;
  error_message: string | null;
  received_at: string;
  created_at: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  matched: { label: 'Matched', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800', icon: CheckCircle },
  created: { label: 'Created', color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800', icon: CheckCircle },
  error: { label: 'Error', color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800', icon: XCircle },
  processing: { label: 'Processing', color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800', icon: Clock },
  received: { label: 'Received', color: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/30 dark:border-slate-700', icon: Clock },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function extractContactInfo(payload: Record<string, unknown>) {
  return {
    name: [payload.first_name ?? payload.firstName, payload.last_name ?? payload.lastName]
      .filter(Boolean).join(' ') || (payload.email as string) || '—',
    email: (payload.email as string) || null,
    phone: (payload.phone as string) || null,
    address: (payload.address ?? payload.property_address ?? payload.propertyAddress) as string || null,
    smsConsent: payload.sms_consent === true || payload.smsConsent === true,
  };
}

// ─── Row Component ────────────────────────────────────────────────────────────

function SubmissionRow({ log }: { log: WebhookLog }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusCfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.received;
  const StatusIcon = statusCfg.icon;
  const contact = extractContactInfo(log.payload);

  function copyPayload() {
    navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card transition-all duration-150">
      {/* ── Summary Row ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.color} shrink-0`}>
          <StatusIcon size={11} />
          {statusCfg.label}
        </span>

        {/* Contact name + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{contact.name}</span>
            {contact.address && (
              <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <MapPin size={10} />
                {contact.address}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {contact.email && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail size={10} />
                {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone size={10} />
                {contact.phone}
              </span>
            )}
          </div>
        </div>

        {/* Lead ID link */}
        {log.lead_id && (
          <Link
            href={`/lead-record?id=${log.lead_id}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
          >
            <User size={11} />
            Lead
            <ExternalLink size={10} />
          </Link>
        )}

        {/* Timestamp */}
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs font-medium text-foreground">{timeAgo(log.received_at)}</div>
          <div className="text-[10px] text-muted-foreground">{formatTimestamp(log.received_at)}</div>
        </div>

        {/* Expand toggle */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* ── Expanded Detail ── */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {/* Error message */}
          {log.error_message && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
              <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400 font-mono">{log.error_message}</p>
            </div>
          )}

          {/* Meta row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-0.5">Submission ID</div>
              <div className="font-mono text-foreground truncate">{log.id.slice(0, 8)}…</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Source</div>
              <div className="font-medium text-foreground">{log.source}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">SMS Consent</div>
              <div className={`font-medium ${contact.smsConsent ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {contact.smsConsent ? 'Yes' : 'No'}
              </div>
            </div>
            {log.lead_id && (
              <div>
                <div className="text-muted-foreground mb-0.5">Lead ID</div>
                <Link
                  href={`/lead-record?id=${log.lead_id}`}
                  className="font-mono text-primary hover:underline flex items-center gap-1"
                >
                  {log.lead_id.slice(0, 8)}…
                  <ArrowRight size={10} />
                </Link>
              </div>
            )}
          </div>

          {/* Raw payload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Raw Payload</span>
              <button
                onClick={copyPayload}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy size={11} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-background border border-border rounded-md p-3 overflow-x-auto text-foreground leading-relaxed max-h-48">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Base44SubmissionsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('source', 'base44_estimate')
      .order('received_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      setLogs(data as WebhookLog[]);
    }
    setLoading(false);
    if (showSpinner) setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchLogs();

    // Real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel('base44-submissions-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webhook_logs',
        filter: 'source=eq.base44_estimate',
      }, () => {
        fetchLogs();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'webhook_logs',
        filter: 'source=eq.base44_estimate',
      }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLogs]);

  // ── Filtered logs ──
  const filtered = logs.filter((log) => {
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const contact = extractContactInfo(log.payload);
    return (
      contact.name.toLowerCase().includes(q) ||
      (contact.email ?? '').toLowerCase().includes(q) ||
      (contact.address ?? '').toLowerCase().includes(q) ||
      (log.lead_id ?? '').toLowerCase().includes(q) ||
      log.id.toLowerCase().includes(q)
    );
  });

  // ── Status counts ──
  const counts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-xl mx-auto space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Webhook size={18} className="text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Base44 Submissions</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              All incoming webhook submissions from the Base44 estimate form — with status, lead linkage, and raw payload.
            </p>
          </div>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Status Summary Chips ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              statusFilter === 'all' ?'bg-foreground text-background border-foreground' :'bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground'
            }`}
          >
            All ({logs.length})
          </button>
          {(['matched', 'created', 'error', 'processing', 'received'] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const count = counts[s] ?? 0;
            if (count === 0 && statusFilter !== s) return null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s ? cfg.color : 'bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground'
                }`}
              >
                <cfg.icon size={11} />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, address, or lead ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* ── Log List ── */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-3">
              <Inbox size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {logs.length === 0 ? 'No submissions yet' : 'No results match your filter'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {logs.length === 0
                ? 'Submissions from the Base44 estimate form will appear here in real time.'
                : 'Try adjusting your search or status filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Filter size={11} />
              Showing {filtered.length} of {logs.length} submission{logs.length !== 1 ? 's' : ''}
            </div>
            {filtered.map((log) => (
              <SubmissionRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
