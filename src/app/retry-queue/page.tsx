'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Mail, MessageSquare, RefreshCw, RotateCcw, Search, ShieldAlert, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import { EnrichmentFailuresTable } from './components/EnrichmentFailuresTable';
import { MessagingFailuresTable } from './components/MessagingFailuresTable';
import { SyncFailuresTable } from './components/SyncFailuresTable';
import type { EnrichmentFailureItem, MessagingFailureItem, RetrySourceTab, RetrySummary, SyncFailureItem } from './types';
import { titleize } from './utils';

type SyncRow = {
  id: string;
  operation_type: string;
  operation_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  error_code: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type OutreachRow = {
  id: string;
  lead_id: string | null;
  channel: 'sms' | 'email';
  subject: string | null;
  body_preview: string | null;
  full_body: string | null;
  status: string;
  failure_reason: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  agent_id: string | null;
  metadata: Record<string, unknown> | null;
};

type EnrichmentRow = {
  id: string;
  lead_id: string;
  stage: string;
  error_code: string;
  error_message: string;
  api_provider: string | null;
  api_http_status: number | null;
  retry_count: number | null;
  last_retry_at: string | null;
  is_transient: boolean | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  owner_name: string | null;
  contact_phone: string | null;
  enrichment_status: string | null;
  enrichment_retry_count: number | null;
  sms_opted_out_at: string | null;
};

type EnrichmentGuardRow = {
  lead_id: string;
  do_not_contact: boolean | null;
};

const EMPTY_SUMMARY: RetrySummary = {
  syncFailures: 0,
  smsFailures: 0,
  emailFailures: 0,
  enrichmentFailures: 0,
  legacyQueueRows: 0,
};

function isUuidLike(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f-]{32,}$/i.test(value));
}

function leadLabel(lead?: LeadRow) {
  return lead?.contact_name || lead?.owner_name || 'Lead record';
}

function propertyLabel(lead?: LeadRow) {
  return [lead?.address, lead?.city, lead?.state].filter(Boolean).join(', ') || 'Property not saved';
}

export default function RetryQueuePage() {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<RetrySummary>(EMPTY_SUMMARY);
  const [syncItems, setSyncItems] = useState<SyncFailureItem[]>([]);
  const [messageItems, setMessageItems] = useState<MessagingFailureItem[]>([]);
  const [enrichmentItems, setEnrichmentItems] = useState<EnrichmentFailureItem[]>([]);
  const [activeTab, setActiveTab] = useState<RetrySourceTab>('sync');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        syncCountRes,
        smsCountRes,
        emailCountRes,
        enrichmentCountRes,
        legacyQueueCountRes,
        syncRes,
        messageRes,
        enrichmentRes,
      ] = await Promise.all([
        supabase.from('sync_events').select('id', { count: 'exact', head: true }).in('status', ['failed', 'retrying']),
        supabase.from('outreach_history').select('id', { count: 'exact', head: true }).eq('channel', 'sms').eq('status', 'failed'),
        supabase.from('outreach_history').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'failed'),
        supabase.from('enrichment_error_logs').select('id', { count: 'exact', head: true }).eq('resolved', false),
        supabase.from('retry_queue').select('id', { count: 'exact', head: true }),
        supabase
          .from('sync_events')
          .select('id, operation_type, operation_id, status, attempt_count, max_attempts, next_retry_at, last_error, error_code, payload, created_at, updated_at')
          .in('status', ['failed', 'retrying'])
          .order('updated_at', { ascending: false })
          .limit(60),
        supabase
          .from('outreach_history')
          .select('id, lead_id, channel, subject, body_preview, full_body, status, failure_reason, recipient_email, recipient_phone, sent_at, created_at, updated_at, agent_id, metadata')
          .eq('status', 'failed')
          .in('channel', ['sms', 'email'])
          .order('sent_at', { ascending: false })
          .limit(75),
        supabase
          .from('enrichment_error_logs')
          .select('id, lead_id, stage, error_code, error_message, api_provider, api_http_status, retry_count, last_retry_at, is_transient, created_at')
          .eq('resolved', false)
          .order('created_at', { ascending: false })
          .limit(75),
      ]);

      const syncError = syncRes.error || messageRes.error || enrichmentRes.error;
      const countError = syncCountRes.error || smsCountRes.error || emailCountRes.error || enrichmentCountRes.error || legacyQueueCountRes.error;
      if (syncError) throw syncError;
      if (countError) throw countError;

      const syncRows = (syncRes.data || []) as SyncRow[];
      const messageRows = (messageRes.data || []) as OutreachRow[];
      const enrichmentRows = (enrichmentRes.data || []) as EnrichmentRow[];
      const leadIds = Array.from(new Set([
        ...messageRows.map((row) => row.lead_id).filter(Boolean),
        ...enrichmentRows.map((row) => row.lead_id).filter(Boolean),
      ])) as string[];

      let leads = new Map<string, LeadRow>();
      let enrichmentGuards = new Map<string, EnrichmentGuardRow>();

      if (leadIds.length > 0) {
        const [leadRes, guardRes] = await Promise.all([
          supabase
            .from('leads')
            .select('id, address, city, state, contact_name, owner_name, contact_phone, enrichment_status, enrichment_retry_count, sms_opted_out_at')
            .in('id', leadIds),
          supabase
            .from('lead_enrichments')
            .select('lead_id, do_not_contact')
            .in('lead_id', leadIds),
        ]);

        if (leadRes.error) throw leadRes.error;
        if (guardRes.error) throw guardRes.error;

        leads = new Map((leadRes.data || []).map((lead) => [lead.id, lead as LeadRow]));
        enrichmentGuards = new Map((guardRes.data || []).map((row) => [row.lead_id, row as EnrichmentGuardRow]));
      }

      setSummary({
        syncFailures: syncCountRes.count || 0,
        smsFailures: smsCountRes.count || 0,
        emailFailures: emailCountRes.count || 0,
        enrichmentFailures: enrichmentCountRes.count || 0,
        legacyQueueRows: legacyQueueCountRes.count || 0,
      });

      setSyncItems(syncRows.map((row) => {
        const payload = row.payload || {};
        const sourceName = typeof payload.source === 'string' ? payload.source : typeof payload.source_name === 'string' ? payload.source_name : null;
        const portfolio = typeof payload.portfolio === 'string'
          ? payload.portfolio
          : row.operation_id.includes('Portfolio')
            ? row.operation_id
            : null;
        const stateCode = typeof payload.state_code === 'string' ? payload.state_code : null;

        let retryAction: SyncFailureItem['retryAction'] = null;
        if (row.operation_type === 'source_sync' && portfolio) {
          retryAction = { type: 'sync_execute', label: 'Run portfolio sync again', payload: { portfolio } };
        } else if (row.operation_type === 'source_sync' && sourceName === 'Trulia' && stateCode) {
          retryAction = { type: 'trulia_ingest', label: 'Retry Trulia import', payload: { stateCode } };
        } else if (row.operation_type === 'lead_enrichment' && isUuidLike(row.operation_id)) {
          retryAction = { type: 'lead_enrichment', label: 'Queue enrichment retry', payload: { leadId: row.operation_id } };
        }

        return {
          id: row.id,
          operationType: row.operation_type,
          operationId: row.operation_id,
          status: row.status,
          attemptCount: row.attempt_count,
          maxAttempts: row.max_attempts,
          nextRetryAt: row.next_retry_at,
          lastError: row.last_error,
          errorCode: row.error_code,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          portfolio,
          stateCode,
          sourceName,
          retryAction,
        };
      }));

      setMessageItems(messageRows.map((row) => {
        const lead = row.lead_id ? leads.get(row.lead_id) : undefined;
        const guard = row.lead_id ? enrichmentGuards.get(row.lead_id) : undefined;
        const metadata = row.metadata || {};
        const smsTo = typeof metadata.to === 'string' ? metadata.to : row.recipient_phone || lead?.contact_phone || null;
        const smsMessage = typeof metadata.original_message === 'string'
          ? metadata.original_message
          : typeof metadata.message === 'string'
            ? metadata.message
            : row.full_body || null;
        const emailMessage = row.full_body;
        const emailSubject = row.subject || 'TRAVLR Vacation Homes';
        const preview = row.body_preview || (typeof metadata.message === 'string' ? metadata.message : row.full_body) || 'No preview saved';
        const knownSmsBlock = !!lead?.sms_opted_out_at || guard?.do_not_contact === true;

        if (row.channel === 'sms' && row.lead_id && smsTo && smsMessage && !knownSmsBlock) {
          return {
            id: row.id,
            leadId: row.lead_id,
            leadLabel: leadLabel(lead),
            propertyLabel: propertyLabel(lead),
            channel: 'sms' as const,
            status: row.status,
            sentAt: row.sent_at,
            updatedAt: row.updated_at,
            preview,
            subject: row.subject,
            recipient: smsTo,
            errorCode: typeof metadata.twilio_error_code === 'string' ? metadata.twilio_error_code : typeof metadata.error === 'string' ? metadata.error : null,
            errorMessage: row.failure_reason || (typeof metadata.twilio_error_message === 'string' ? metadata.twilio_error_message : null),
            sequenceName: typeof metadata.campaign_name === 'string' ? metadata.campaign_name : typeof metadata.batch === 'string' ? metadata.batch : null,
            retryable: true,
            retryDisabledReason: null,
            retryPayload: {
              kind: 'sms',
              leadId: row.lead_id,
              to: smsTo,
              message: smsMessage,
              sequenceName: typeof metadata.sequence_name === 'string' ? metadata.sequence_name : null,
              agentId: row.agent_id,
              portfolio: typeof metadata.portfolio === 'string' ? metadata.portfolio : null,
              bulkBatch: Boolean(metadata.bulk_batch || metadata.builder),
            },
          } satisfies MessagingFailureItem;
        }

        if (row.channel === 'email' && row.lead_id && row.recipient_email && emailMessage) {
          return {
            id: row.id,
            leadId: row.lead_id,
            leadLabel: leadLabel(lead),
            propertyLabel: propertyLabel(lead),
            channel: 'email' as const,
            status: row.status,
            sentAt: row.sent_at,
            updatedAt: row.updated_at,
            preview,
            subject: emailSubject,
            recipient: row.recipient_email,
            errorCode: null,
            errorMessage: row.failure_reason || (typeof metadata.error === 'string' ? metadata.error : null),
            sequenceName: null,
            retryable: true,
            retryDisabledReason: null,
            retryPayload: {
              kind: 'email',
              leadId: row.lead_id,
              to: row.recipient_email,
              subject: emailSubject,
              message: emailMessage,
              agentId: row.agent_id,
              propertyAddress: lead?.address || null,
            },
          } satisfies MessagingFailureItem;
        }

        return {
          id: row.id,
          leadId: row.lead_id,
          leadLabel: leadLabel(lead),
          propertyLabel: propertyLabel(lead),
          channel: row.channel,
          status: row.status,
          sentAt: row.sent_at,
          updatedAt: row.updated_at,
          preview,
          subject: row.subject,
          recipient: row.channel === 'sms' ? smsTo : row.recipient_email,
          errorCode: typeof metadata.twilio_error_code === 'string' ? metadata.twilio_error_code : typeof metadata.error === 'string' ? metadata.error : null,
          errorMessage: row.failure_reason || (typeof metadata.twilio_error_message === 'string' ? metadata.twilio_error_message : null),
          sequenceName: typeof metadata.campaign_name === 'string' ? metadata.campaign_name : typeof metadata.batch === 'string' ? metadata.batch : null,
          retryable: false,
          retryDisabledReason: row.channel === 'sms'
            ? knownSmsBlock
              ? 'Lead is already opted out or marked Do Not Contact, so SMS retry stays disabled.'
              : 'Missing lead, phone, or original SMS body.'
            : 'Failed email rows without full_body cannot be safely resent.',
          retryPayload: null,
        } satisfies MessagingFailureItem;
      }));

      setEnrichmentItems(enrichmentRows.map((row) => {
        const lead = leads.get(row.lead_id);
        const enrichmentStatus = lead?.enrichment_status || null;
        const retryable = ['ERROR', 'NO_MATCH', 'PARTIAL'].includes(enrichmentStatus || '');
        return {
          id: row.id,
          leadId: row.lead_id,
          leadLabel: leadLabel(lead),
          propertyLabel: propertyLabel(lead),
          stage: row.stage,
          errorCode: row.error_code,
          errorMessage: row.error_message,
          apiProvider: row.api_provider,
          apiHttpStatus: row.api_http_status,
          retryCount: row.retry_count || 0,
          lastRetryAt: row.last_retry_at,
          isTransient: !!row.is_transient,
          createdAt: row.created_at,
          enrichmentStatus,
          retryable,
          retryDisabledReason: retryable ? null : `Lead is currently ${titleize(enrichmentStatus || 'unknown')} rather than ERROR, NO MATCH, or PARTIAL.`,
        } satisfies EnrichmentFailureItem;
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retry queues');
      setSyncItems([]);
      setMessageItems([]);
      setEnrichmentItems([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredSyncItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return syncItems;
    return syncItems.filter((item) => [item.operationType, item.operationId, item.portfolio, item.sourceName, item.lastError, item.stateCode].some((value) => value?.toLowerCase().includes(term)));
  }, [search, syncItems]);

  const filteredMessageItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messageItems;
    return messageItems.filter((item) => [item.leadLabel, item.propertyLabel, item.recipient, item.preview, item.errorMessage, item.sequenceName].some((value) => value?.toLowerCase().includes(term)));
  }, [messageItems, search]);

  const filteredEnrichmentItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return enrichmentItems;
    return enrichmentItems.filter((item) => [item.leadLabel, item.propertyLabel, item.stage, item.errorCode, item.errorMessage, item.apiProvider, item.enrichmentStatus].some((value) => value?.toLowerCase().includes(term)));
  }, [enrichmentItems, search]);

  async function handleSyncRetry(item: SyncFailureItem) {
    if (!item.retryAction) return;
    if (!window.confirm(`Retry ${item.operationId}? This will call the real server route for the underlying operation.`)) return;

    setActionKey(`sync:${item.id}`);
    try {
      let response: Response;
      if (item.retryAction.type === 'sync_execute') {
        response = await fetch('/api/sync/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portfolio: item.retryAction.payload.portfolio }),
        });
      } else if (item.retryAction.type === 'trulia_ingest') {
        response = await fetch('/api/trulia/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stateCode: item.retryAction.payload.stateCode, tier: 'all', triggeredBy: 'retry-queue' }),
        });
      } else {
        response = await fetch('/api/leads/retry-enrichment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadIds: [item.retryAction.payload.leadId] }),
        });
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Retry route failed');
      toast.success('Retry request sent. Refreshing live queues…');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionKey(null);
    }
  }

  async function handleMessageRetry(item: MessagingFailureItem) {
    if (!item.retryPayload) return;
    if (!window.confirm(`Retry this ${item.channel.toUpperCase()} through the real send route? SMS retries re-run the full opt-out and protected-contact guards.`)) return;

    setActionKey(`message:${item.id}`);
    try {
      const endpoint = item.retryPayload.kind === 'sms' ? '/api/sms/send' : '/api/send-homeowner-email';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.retryPayload),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || payload?.message || 'Retry send failed');
      toast.success(`${item.channel.toUpperCase()} retry submitted through ${endpoint}.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionKey(null);
    }
  }

  async function handleEnrichmentRetry(item: EnrichmentFailureItem) {
    if (!window.confirm(`Queue enrichment retry for ${item.leadLabel}?`)) return;
    setActionKey(`enrichment:${item.id}`);
    try {
      const response = await fetch('/api/leads/retry-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [item.leadId] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Retry failed');
      toast.success('Enrichment retry queued. Refreshing live queues…');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionKey(null);
    }
  }

  const visibleCount = activeTab === 'sync'
    ? filteredSyncItems.length
    : activeTab === 'messaging'
      ? filteredMessageItems.length
      : filteredEnrichmentItems.length;

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={RotateCcw}
          title="Retry Queue"
          description="Real retry surfaces from sync_events, failed outreach_history sends, and unresolved enrichment_error_logs. SMS retries re-enter /api/sms/send so the same opt-out and protected-contact checks still apply."
          actions={(
            <button onClick={() => void loadData()} className={buttonSecondary} disabled={loading || !!actionKey}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
            </button>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void loadData()} /> : null}

        <StatGrid
          columns={5}
          stats={[
            { label: 'Sync failures', value: summary.syncFailures, icon: Workflow, tone: 'danger', hint: 'failed or retrying sync_events rows' },
            { label: 'SMS failures', value: summary.smsFailures, icon: MessageSquare, tone: 'warning', hint: 'failed outreach_history SMS rows' },
            { label: 'Email failures', value: summary.emailFailures, icon: Mail, tone: 'default', hint: 'failed outreach_history email rows' },
            { label: 'Enrichment errors', value: summary.enrichmentFailures, icon: ShieldAlert, tone: 'danger', hint: 'unresolved enrichment_error_logs rows' },
            { label: 'Legacy retry_queue', value: summary.legacyQueueRows, icon: AlertTriangle, tone: 'default', hint: 'table exists but is not the live source of truth' },
          ]}
        />

        <Panel title="Guardrails" icon={AlertTriangle}>
          <div className="grid gap-3 lg:grid-cols-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">SMS retries stay guarded</p>
              <p className="mt-2">This page never updates SMS rows directly. It resubmits through <code>/api/sms/send</code>, which re-checks opt-outs, protected contacts, duplicate-send guardrails, and Twilio Lookup before any text goes out.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">Real tables only</p>
              <p className="mt-2">The dashboard reads live <code>sync_events</code>, <code>outreach_history</code>, and <code>enrichment_error_logs</code> rows. The old <code>retry_queue</code> table still exists in the database, but it is currently empty.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">Honest empty states</p>
              <p className="mt-2">When a retry route cannot be mapped safely — for example a failed email without <code>full_body</code> — the action stays disabled instead of fabricating a resend path.</p>
            </div>
          </div>
        </Panel>

        <Panel title="Filters" icon={Search}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
              placeholder="Search by lead, property, error code, route, or state"
              aria-label="Search retry items"
            />
            <SegmentedTabs
              tabs={[
                { key: 'sync', label: 'Sync', badge: summary.syncFailures },
                { key: 'messaging', label: 'Messaging', badge: summary.smsFailures + summary.emailFailures },
                { key: 'enrichment', label: 'Enrichment', badge: summary.enrichmentFailures },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Showing {visibleCount} row{visibleCount === 1 ? '' : 's'} in {activeTab}</span>
            {summary.legacyQueueRows === 0 ? <StatusPill>retry_queue empty</StatusPill> : null}
          </div>
        </Panel>

        {loading && !syncItems.length && !messageItems.length && !enrichmentItems.length ? <LoadingState label="Loading live retry queues…" /> : null}

        {!loading && summary.syncFailures + summary.smsFailures + summary.emailFailures + summary.enrichmentFailures === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No live retry work is currently queued"
            hint="The real source tables are empty right now, so this page shows an honest empty state instead of placeholder metrics."
          />
        ) : null}

        {activeTab === 'sync' ? <SyncFailuresTable items={filteredSyncItems} loading={loading} actionKey={actionKey} onRetry={handleSyncRetry} /> : null}
        {activeTab === 'messaging' ? <MessagingFailuresTable items={filteredMessageItems} loading={loading} actionKey={actionKey} onRetry={handleMessageRetry} /> : null}
        {activeTab === 'enrichment' ? <EnrichmentFailuresTable items={filteredEnrichmentItems} loading={loading} actionKey={actionKey} onRetry={handleEnrichmentRetry} /> : null}
      </div>
    </AppLayout>
  );
}
