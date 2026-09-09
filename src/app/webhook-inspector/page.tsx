'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Webhook, RefreshCw, Search, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, AlertTriangle, RotateCcw,
  Copy, MessageSquare, Mail, FileText, Activity,
  Inbox, Play, Zap, Timer, Ban,
} from 'lucide-react';

import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type WebhookSource = 'twilio' | 'resend' | 'docusign';
type WebhookStatus = 'processed' | 'failed' | 'pending' | 'retrying' | 'dead_letter';

interface RetryAttempt {
  attempt: number;
  timestamp: string;
  status: 'success' | 'failed';
  error?: string;
  duration_ms: number;
  backoff_ms: number;
}

interface WebhookEvent {
  id: string;
  source: WebhookSource;
  event_type: string;
  received_at: string;
  status: WebhookStatus;
  processing_duration_ms: number;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  endpoint: string;
  payload: Record<string, unknown>;
  error_message?: string;
  retry_history: RetryAttempt[];
  lead_id?: string;
  lead_name?: string;
  dead_letter_reason?: string;
}

// ─── Exponential Backoff Helper ───────────────────────────────────────────────

function calcBackoff(attempt: number, baseMs = 1000, maxMs = 64000): number {
  // Exponential backoff: base * 2^attempt, capped at maxMs, with jitter
  return Math.min(baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 1000), maxMs);
}

function fmtBackoff(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

function generateMockWebhooks(): WebhookEvent[] {
  const now = Date.now();
  return [
    {
      id: 'wh-001',
      source: 'twilio',
      event_type: 'InboundSMS',
      received_at: new Date(now - 2 * 60000).toISOString(),
      status: 'processed',
      processing_duration_ms: 142,
      retry_count: 0,
      max_retries: 5,
      endpoint: '/api/sms/inbound',
      lead_id: 'lead-42',
      lead_name: 'James Whitfield',
      payload: {
        MessageSid: 'SM1234567890abcdef',
        From: '+15125551234',
        To: '+15125559999',
        Body: 'Yes, I am interested in listing my property.',
        NumMedia: '0',
        AccountSid: 'AC***masked***',
        SmsStatus: 'received',
        FromCity: 'AUSTIN',
        FromState: 'TX',
      },
      retry_history: [],
    },
    {
      id: 'wh-002',
      source: 'resend',
      event_type: 'email.bounced',
      received_at: new Date(now - 8 * 60000).toISOString(),
      status: 'failed',
      processing_duration_ms: 0,
      retry_count: 2,
      max_retries: 5,
      next_retry_at: new Date(now + calcBackoff(2)).toISOString(),
      endpoint: '/api/sms/status',
      lead_id: 'lead-17',
      lead_name: 'Sandra Okafor',
      error_message: 'Supabase update failed: lead_id not found in leads table',
      payload: {
        type: 'email.bounced',
        created_at: new Date(now - 8 * 60000).toISOString(),
        data: {
          email_id: 're_abc123xyz',
          from: 'outreach@travlrpro.com',
          to: ['sandra.okafor@example.com'],
          subject: 'Your property listing opportunity',
          bounce: { type: 'hard', subtype: 'NoEmail', message: 'The email account does not exist.' },
        },
      },
      retry_history: [
        { attempt: 1, timestamp: new Date(now - 7 * 60000).toISOString(), status: 'failed', error: 'DB timeout', duration_ms: 5001, backoff_ms: calcBackoff(0) },
        { attempt: 2, timestamp: new Date(now - 5 * 60000).toISOString(), status: 'failed', error: 'lead_id not found', duration_ms: 320, backoff_ms: calcBackoff(1) },
      ],
    },
    {
      id: 'wh-003',
      source: 'docusign',
      event_type: 'envelope-completed',
      received_at: new Date(now - 15 * 60000).toISOString(),
      status: 'processed',
      processing_duration_ms: 287,
      retry_count: 0,
      max_retries: 5,
      endpoint: '/api/docusign/webhook',
      lead_id: 'lead-88',
      lead_name: 'Robert Tanaka',
      payload: {
        event: 'envelope-completed',
        apiVersion: 'v2.1',
        data: {
          accountId: '***masked***',
          envelopeId: 'env-uuid-001',
          envelopeSummary: {
            status: 'completed',
            emailSubject: 'Property Management Agreement - Robert Tanaka',
            completedDateTime: new Date(now - 15 * 60000).toISOString(),
          },
        },
      },
      retry_history: [],
    },
    {
      id: 'wh-004',
      source: 'twilio',
      event_type: 'MessageStatus',
      received_at: new Date(now - 22 * 60000).toISOString(),
      status: 'processed',
      processing_duration_ms: 98,
      retry_count: 0,
      max_retries: 5,
      endpoint: '/api/sms/status',
      lead_id: 'lead-55',
      lead_name: 'Maria Chen',
      payload: {
        MessageSid: 'SM9876543210fedcba',
        MessageStatus: 'delivered',
        To: '+15125557890',
        From: '+15125559999',
        AccountSid: 'AC***masked***',
      },
      retry_history: [],
    },
    {
      id: 'wh-005',
      source: 'resend',
      event_type: 'email.opened',
      received_at: new Date(now - 35 * 60000).toISOString(),
      status: 'processed',
      processing_duration_ms: 201,
      retry_count: 0,
      max_retries: 5,
      endpoint: '/api/sms/status',
      lead_id: 'lead-29',
      lead_name: 'David Park',
      payload: {
        type: 'email.opened',
        created_at: new Date(now - 35 * 60000).toISOString(),
        data: {
          email_id: 're_def456uvw',
          from: 'outreach@travlrpro.com',
          to: ['david.park@example.com'],
          subject: 'Revenue estimate for your Austin property',
        },
      },
      retry_history: [],
    },
    {
      id: 'wh-006',
      source: 'docusign',
      event_type: 'envelope-sent',
      received_at: new Date(now - 48 * 60000).toISOString(),
      status: 'retrying',
      processing_duration_ms: 0,
      retry_count: 1,
      max_retries: 5,
      next_retry_at: new Date(now + calcBackoff(1)).toISOString(),
      endpoint: '/api/docusign/webhook',
      lead_id: 'lead-71',
      lead_name: 'Lisa Monroe',
      error_message: 'Network timeout connecting to Supabase',
      payload: {
        event: 'envelope-sent',
        apiVersion: 'v2.1',
        data: {
          envelopeId: 'env-uuid-002',
          envelopeSummary: {
            status: 'sent',
            emailSubject: 'Property Management Agreement - Lisa Monroe',
            sentDateTime: new Date(now - 48 * 60000).toISOString(),
          },
        },
      },
      retry_history: [
        { attempt: 1, timestamp: new Date(now - 45 * 60000).toISOString(), status: 'failed', error: 'Network timeout', duration_ms: 30000, backoff_ms: calcBackoff(0) },
      ],
    },
    // Dead letter queue events
    {
      id: 'wh-dlq-001',
      source: 'twilio',
      event_type: 'InboundSMS',
      received_at: new Date(now - 3 * 3600000).toISOString(),
      status: 'dead_letter',
      processing_duration_ms: 0,
      retry_count: 5,
      max_retries: 5,
      endpoint: '/api/sms/inbound',
      lead_id: 'lead-99',
      lead_name: 'Kevin Walsh',
      error_message: 'Max retries (5) exhausted. Last error: Supabase RLS policy violation — user not authorized.',
      dead_letter_reason: 'Max retries exhausted after exponential backoff (1s → 2s → 4s → 8s → 16s)',
      payload: {
        MessageSid: 'SMaabbccdd11223344',
        From: '+15125554321',
        To: '+15125559999',
        Body: 'STOP',
        NumMedia: '0',
        AccountSid: 'AC***masked***',
        SmsStatus: 'received',
      },
      retry_history: [
        { attempt: 1, timestamp: new Date(now - 3 * 3600000 + 1000).toISOString(), status: 'failed', error: 'RLS policy violation', duration_ms: 450, backoff_ms: 1000 },
        { attempt: 2, timestamp: new Date(now - 3 * 3600000 + 3000).toISOString(), status: 'failed', error: 'RLS policy violation', duration_ms: 380, backoff_ms: 2000 },
        { attempt: 3, timestamp: new Date(now - 3 * 3600000 + 7000).toISOString(), status: 'failed', error: 'RLS policy violation', duration_ms: 410, backoff_ms: 4000 },
        { attempt: 4, timestamp: new Date(now - 3 * 3600000 + 15000).toISOString(), status: 'failed', error: 'RLS policy violation', duration_ms: 390, backoff_ms: 8000 },
        { attempt: 5, timestamp: new Date(now - 3 * 3600000 + 31000).toISOString(), status: 'failed', error: 'RLS policy violation', duration_ms: 420, backoff_ms: 16000 },
      ],
    },
    {
      id: 'wh-dlq-002',
      source: 'resend',
      event_type: 'email.delivery_delayed',
      received_at: new Date(now - 5 * 3600000).toISOString(),
      status: 'dead_letter',
      processing_duration_ms: 0,
      retry_count: 5,
      max_retries: 5,
      endpoint: '/api/sms/status',
      lead_id: 'lead-66',
      lead_name: 'Priya Sharma',
      error_message: 'Max retries exhausted. Last error: Invalid lead_id format in payload.',
      dead_letter_reason: 'Max retries exhausted after exponential backoff (1s → 2s → 4s → 8s → 16s)',
      payload: {
        type: 'email.delivery_delayed',
        created_at: new Date(now - 5 * 3600000).toISOString(),
        data: {
          email_id: 're_ghi789rst',
          from: 'outreach@travlrpro.com',
          to: ['priya.sharma@example.com'],
          subject: 'Follow-up on your property',
        },
      },
      retry_history: [
        { attempt: 1, timestamp: new Date(now - 5 * 3600000 + 1000).toISOString(), status: 'failed', error: 'Invalid lead_id', duration_ms: 210, backoff_ms: 1000 },
        { attempt: 2, timestamp: new Date(now - 5 * 3600000 + 3000).toISOString(), status: 'failed', error: 'Invalid lead_id', duration_ms: 195, backoff_ms: 2000 },
        { attempt: 3, timestamp: new Date(now - 5 * 3600000 + 7000).toISOString(), status: 'failed', error: 'Invalid lead_id', duration_ms: 220, backoff_ms: 4000 },
        { attempt: 4, timestamp: new Date(now - 5 * 3600000 + 15000).toISOString(), status: 'failed', error: 'Invalid lead_id', duration_ms: 205, backoff_ms: 8000 },
        { attempt: 5, timestamp: new Date(now - 5 * 3600000 + 31000).toISOString(), status: 'failed', error: 'Invalid lead_id', duration_ms: 230, backoff_ms: 16000 },
      ],
    },
    {
      id: 'wh-008',
      source: 'resend',
      event_type: 'email.delivery_delayed',
      received_at: new Date(now - 120 * 60000).toISOString(),
      status: 'pending',
      processing_duration_ms: 0,
      retry_count: 0,
      max_retries: 5,
      endpoint: '/api/sms/status',
      lead_id: 'lead-66',
      lead_name: 'Priya Sharma',
      payload: {
        type: 'email.delivery_delayed',
        created_at: new Date(now - 120 * 60000).toISOString(),
        data: {
          email_id: 're_ghi789rst',
          from: 'outreach@travlrpro.com',
          to: ['priya.sharma@example.com'],
          subject: 'Follow-up on your property',
          delay: { reason: 'ISP throttling', retry_after: new Date(now + 30 * 60000).toISOString() },
        },
      },
      retry_history: [],
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<WebhookSource, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  twilio: { label: 'Twilio', color: 'text-red-700', bg: 'bg-red-500/10 border-red-200', icon: MessageSquare },
  resend: { label: 'Resend', color: 'text-blue-700', bg: 'bg-blue-500/10 border-blue-200', icon: Mail },
  docusign: { label: 'DocuSign', color: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-200', icon: FileText },
};

const STATUS_CONFIG: Record<WebhookStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  processed: { label: 'Processed', color: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-200', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-500/10 border-red-200', icon: XCircle },
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-200', icon: Clock },
  retrying: { label: 'Retrying', color: 'text-blue-700', bg: 'bg-blue-500/10 border-blue-200', icon: RotateCcw },
  dead_letter: { label: 'Dead Letter', color: 'text-gray-700', bg: 'bg-gray-500/10 border-gray-300', icon: Ban },
};

function SourceBadge({ source }: { source: WebhookSource }) {
  const cfg = SOURCE_CONFIG[source];
  const Ic = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Ic size={10} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: WebhookStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Ic = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Ic size={10} className={status === 'retrying' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

function JsonViewer({ data }: { data: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
      >
        <Copy size={10} />
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed max-h-72 overflow-y-auto">
        {json}
      </pre>
    </div>
  );
}

function RetryHistory({ retries }: { retries: RetryAttempt[] }) {
  if (retries.length === 0) {
    return <p className="text-xs text-gray-400 italic">No retry attempts recorded.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Timer size={12} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Exponential Backoff: 1s → 2s → 4s → 8s → 16s → 32s (max 64s)</span>
      </div>
      {retries.map((r) => (
        <div key={r.attempt} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
          <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {r.attempt}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium ${r.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {r.status === 'success' ? 'Succeeded' : 'Failed'}
              </span>
              <span className="text-xs text-gray-400">{fmtTime(r.timestamp)}</span>
              <span className="text-xs text-gray-400">{r.duration_ms}ms</span>
              <span className="text-xs text-blue-500 font-medium">backoff: {fmtBackoff(r.backoff_ms)}</span>
            </div>
            {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhookRow({
  event,
  onManualRetry,
}: {
  event: WebhookEvent;
  onManualRetry: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'payload' | 'retries'>('payload');
  const [retrying, setRetrying] = useState(false);

  const canRetry = event.status === 'failed' || event.status === 'dead_letter' || event.status === 'pending';

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    setTimeout(() => {
      setRetrying(false);
      onManualRetry(event.id);
    }, 1200);
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors ${event.status === 'dead_letter' ? 'border-gray-300 bg-gray-50' : 'border-gray-200'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3"
      >
        <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3">
          <SourceBadge source={event.source} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 truncate">{event.event_type}</span>
              {event.lead_name && (
                <span className="text-xs text-gray-500 truncate hidden sm:block">— {event.lead_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400 font-mono">{event.endpoint}</span>
            </div>
          </div>
          <StatusBadge status={event.status} />
          <span className="text-xs text-gray-400 hidden md:block whitespace-nowrap">
            {event.processing_duration_ms > 0 ? `${event.processing_duration_ms}ms` : '—'}
          </span>
          {event.retry_count > 0 && (
            <span className="text-xs text-orange-600 font-medium whitespace-nowrap hidden sm:block">
              {event.retry_count}/{event.max_retries} retries
            </span>
          )}
          <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(event.received_at)}</span>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              title="Manually trigger retry"
            >
              {retrying ? (
                <RefreshCw size={10} className="animate-spin" />
              ) : (
                <Play size={10} />
              )}
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
          <div className="text-gray-400">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {event.dead_letter_reason && (
            <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-gray-100 border border-gray-300">
              <Ban size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-0.5">Dead Letter Queue</p>
                <p className="text-xs text-gray-600">{event.dead_letter_reason}</p>
              </div>
            </div>
          )}
          {event.error_message && !event.dead_letter_reason && (
            <div className="mb-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{event.error_message}</p>
            </div>
          )}
          {event.next_retry_at && event.status !== 'dead_letter' && (
            <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
              <Timer size={12} className="text-blue-600 shrink-0" />
              <p className="text-xs text-blue-700">
                Next auto-retry scheduled: <span className="font-semibold">{fmtTime(event.next_retry_at)}</span>
                {' '}(backoff: {fmtBackoff(calcBackoff(event.retry_count))})
              </p>
            </div>
          )}

          <div className="flex items-center gap-1 mb-3 border-b border-gray-100 pb-2">
            <button
              onClick={() => setActiveTab('payload')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'payload' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Full Payload
            </button>
            <button
              onClick={() => setActiveTab('retries')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'retries' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Retry History ({event.retry_history.length})
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
              <span>Received: {fmtTime(event.received_at)}</span>
              {event.lead_id && <span className="text-gray-300">|</span>}
              {event.lead_id && <span>Lead: {event.lead_id}</span>}
            </div>
          </div>

          {activeTab === 'payload' && <JsonViewer data={event.payload} />}
          {activeTab === 'retries' && <RetryHistory retries={event.retry_history} />}
        </div>
      )}
    </div>
  );
}

// ─── Dead Letter Queue Section ────────────────────────────────────────────────

function DeadLetterQueue({
  events,
  onRetryAll,
  onRetryOne,
}: {
  events: WebhookEvent[];
  onRetryAll: () => void;
  onRetryOne: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (events.length === 0) return null;

  return (
    <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-gray-50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Inbox size={15} className="text-gray-600" />
          <span className="text-sm font-bold text-gray-800">Dead Letter Queue</span>
          <span className="bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{events.length}</span>
          <span className="text-xs text-gray-500">— max retries exhausted, manual intervention required</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRetryAll(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-white hover:bg-gray-900 transition-colors"
          >
            <Zap size={11} />
            Retry All ({events.length})
          </button>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>
      {expanded && (
        <div className="p-3 space-y-2">
          {events.map((event) => (
            <WebhookRow key={event.id} event={event} onManualRetry={onRetryOne} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WebhookInspectorPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<WebhookSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<WebhookStatus | 'all' | 'active'>('active');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const load = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setEvents(generateMockWebhooks());
      setLastRefreshed(new Date());
      setLoading(false);
    }, 400);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const handleManualRetry = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              status: 'retrying' as WebhookStatus,
              retry_count: e.retry_count + 1,
              next_retry_at: new Date(Date.now() + calcBackoff(e.retry_count)).toISOString(),
              retry_history: [
                ...e.retry_history,
                {
                  attempt: e.retry_count + 1,
                  timestamp: new Date().toISOString(),
                  status: 'failed' as const,
                  error: 'Manual retry triggered — processing…',
                  duration_ms: 0,
                  backoff_ms: calcBackoff(e.retry_count),
                },
              ],
            }
          : e
      )
    );
    toast.success('Manual retry triggered', {
      description: `Event ${id} queued for retry with exponential backoff`,
    });
  }, []);

  const handleRetryAll = useCallback(() => {
    const dlqEvents = events.filter((e) => e.status === 'dead_letter');
    dlqEvents.forEach((e) => handleManualRetry(e.id));
    toast.success(`Retrying ${dlqEvents.length} dead letter event${dlqEvents.length !== 1 ? 's' : ''}`, {
      description: 'All events queued with exponential backoff',
    });
  }, [events, handleManualRetry]);

  const deadLetterEvents = events.filter((e) => e.status === 'dead_letter');

  const activeEvents = events.filter((e) => {
    if (e.status === 'dead_letter') return false;
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
    if (statusFilter === 'active') {
      // active = not dead_letter
    } else if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.lead_name?.toLowerCase().includes(q) ||
        e.endpoint.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filtered = activeEvents.filter((e) => {
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
    if (statusFilter !== 'all' && statusFilter !== 'active' && e.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.lead_name?.toLowerCase().includes(q) ||
        e.endpoint.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    total: events.filter((e) => e.status !== 'dead_letter').length,
    processed: events.filter((e) => e.status === 'processed').length,
    failed: events.filter((e) => e.status === 'failed').length,
    retrying: events.filter((e) => e.status === 'retrying').length,
    pending: events.filter((e) => e.status === 'pending').length,
    dead_letter: deadLetterEvents.length,
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                <Webhook size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Webhook Inspector</h1>
                <p className="text-xs text-gray-500">Twilio SMS · Resend · DocuSign — dead letter queue + exponential backoff retry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${autoRefresh ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <Activity size={12} className={autoRefresh ? 'animate-pulse' : ''} />
                {autoRefresh ? 'Live' : 'Auto-refresh'}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: 'Active', value: counts.total, color: 'text-gray-900', bg: 'bg-white' },
              { label: 'Processed', value: counts.processed, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Failed', value: counts.failed, color: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Retrying', value: counts.retrying, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Pending', value: counts.pending, color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Dead Letter', value: counts.dead_letter, color: 'text-gray-700', bg: 'bg-gray-100', highlight: counts.dead_letter > 0 },
            ].map((k) => (
              <div key={k.label} className={`${k.bg} border ${(k as any).highlight ? 'border-gray-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-center`}>
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Dead Letter Queue */}
          <DeadLetterQueue
            events={deadLetterEvents}
            onRetryAll={handleRetryAll}
            onRetryOne={handleManualRetry}
          />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search event type, lead, endpoint…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as WebhookSource | 'all')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value="all">All Sources</option>
              <option value="twilio">Twilio</option>
              <option value="resend">Resend</option>
              <option value="docusign">DocuSign</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WebhookStatus | 'all' | 'active')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value="active">Active (excl. DLQ)</option>
              <option value="all">All Statuses</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
              <option value="retrying">Retrying</option>
              <option value="pending">Pending</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">
              Last refreshed {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Event List */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-white border border-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Webhook size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No webhook events match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((event) => (
                <WebhookRow key={event.id} event={event} onManualRetry={handleManualRetry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
