'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  GitCommit,
  History,
  Info,
  Search,
  Sparkles,
  User,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  StatGrid,
  StatusPill,
  buttonSecondary,
  inputClass,
} from '@/components/ops';

type AuditEntry = {
  id: string;
  sourceTable: 'activity_events' | 'lead_activity_log';
  timestamp: string;
  title: string;
  detail: string | null;
  eventType: string;
  actorName: string | null;
  leadId: string | null;
  leadAddress: string | null;
  leadState: string | null;
  metadata: Record<string, unknown>;
};

type SourceFilter = 'all' | 'activity_events' | 'lead_activity_log';

type Counts = {
  activityEvents: number;
  leadActivityLog: number;
  legacyLeadAuditTrail: number;
};

type LeadLookup = Record<string, { address: string | null; state: string | null }>;

function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateHeading(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function summarizeActivityData(value: Record<string, unknown>): string | null {
  const description = typeof value.description === 'string' ? value.description : null;
  if (description) return description;
  const title = typeof value.title === 'string' ? value.title : null;
  const body = typeof value.body === 'string' ? value.body : null;
  if (title && body) return `${title} — ${body}`;
  if (title) return title;
  return null;
}

function prettyLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [counts, setCounts] = useState<Counts>({ activityEvents: 0, leadActivityLog: 0, legacyLeadAuditTrail: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        activityCountRes,
        leadActivityCountRes,
        legacyCountRes,
        activityRes,
        leadActivityRes,
      ] = await Promise.all([
        supabase.from('activity_events').select('*', { count: 'exact', head: true }),
        supabase.from('lead_activity_log').select('*', { count: 'exact', head: true }),
        supabase.from('lead_audit_trail').select('*', { count: 'exact', head: true }),
        supabase
          .from('activity_events')
          .select('id,lead_id,lead_address,lead_state,event_type,description,detail,actor_email,metadata,event_timestamp,created_at')
          .order('event_timestamp', { ascending: false })
          .limit(150),
        supabase
          .from('lead_activity_log')
          .select('id,lead_id,activity_type,activity_data,performed_by_name,created_at')
          .order('created_at', { ascending: false })
          .limit(150),
      ]);

      if (activityCountRes.error) throw activityCountRes.error;
      if (leadActivityCountRes.error) throw leadActivityCountRes.error;
      if (legacyCountRes.error) throw legacyCountRes.error;
      if (activityRes.error) throw activityRes.error;
      if (leadActivityRes.error) throw leadActivityRes.error;

      const distinctLeadIds = Array.from(new Set(
        (leadActivityRes.data || []).map((row) => row.lead_id).filter(Boolean),
      ));

      let leadLookup: LeadLookup = {};
      if (distinctLeadIds.length > 0) {
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id,address,state')
          .in('id', distinctLeadIds);
        if (leadsError) throw leadsError;
        leadLookup = Object.fromEntries((leads || []).map((lead) => [lead.id, { address: lead.address, state: lead.state }]));
      }

      const activityEntries: AuditEntry[] = (activityRes.data || []).map((row) => ({
        id: row.id,
        sourceTable: 'activity_events',
        timestamp: row.event_timestamp || row.created_at,
        title: row.description || prettyLabel(row.event_type),
        detail: row.detail,
        eventType: row.event_type,
        actorName: row.actor_email || null,
        leadId: row.lead_id || null,
        leadAddress: row.lead_address || null,
        leadState: row.lead_state || null,
        metadata: (row.metadata as Record<string, unknown>) || {},
      }));

      const leadActivityEntries: AuditEntry[] = (leadActivityRes.data || []).map((row) => {
        const activityData = (row.activity_data as Record<string, unknown>) || {};
        const lead = row.lead_id ? leadLookup[row.lead_id] : undefined;
        return {
          id: row.id,
          sourceTable: 'lead_activity_log',
          timestamp: row.created_at,
          title: summarizeActivityData(activityData) || prettyLabel(row.activity_type),
          detail: typeof activityData.body === 'string' ? activityData.body : null,
          eventType: row.activity_type,
          actorName: row.performed_by_name || null,
          leadId: row.lead_id || null,
          leadAddress: lead?.address || null,
          leadState: lead?.state || null,
          metadata: activityData,
        };
      });

      setEntries([...activityEntries, ...leadActivityEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setCounts({
        activityEvents: activityCountRes.count || 0,
        leadActivityLog: leadActivityCountRes.count || 0,
        legacyLeadAuditTrail: legacyCountRes.count || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the audit trail.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.sourceTable !== sourceFilter) return false;
      if (!query) return true;
      return [
        entry.title,
        entry.detail || '',
        entry.eventType,
        entry.actorName || '',
        entry.leadAddress || '',
        entry.leadId || '',
        JSON.stringify(entry.metadata),
      ].join(' ').toLowerCase().includes(query);
    });
  }, [entries, search, sourceFilter]);

  const groupedEntries = useMemo(() => {
    return filteredEntries.reduce<Record<string, AuditEntry[]>>((acc, entry) => {
      const key = formatDateHeading(entry.timestamp);
      acc[key] = [...(acc[key] || []), entry];
      return acc;
    }, {});
  }, [filteredEntries]);

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={History}
          title="Lead Audit Trail"
          description="Reads the populated lead activity tables directly. The legacy lead_audit_trail table is currently empty, so this page uses activity_events and lead_activity_log instead."
          actions={<button className={buttonSecondary} onClick={() => void load()} disabled={loading}>Refresh</button>}
        />

        {error && <ErrorBanner message={error} onRetry={() => void load()} />}

        <StatGrid
          stats={[
            { label: 'activity_events rows', value: counts.activityEvents, hint: 'Lead creates + import summaries + timeline events', icon: GitCommit, tone: 'primary' },
            { label: 'lead_activity_log rows', value: counts.leadActivityLog, hint: 'Enrichment and lead-level activity records', icon: Activity, tone: 'success' },
            { label: 'Legacy lead_audit_trail', value: counts.legacyLeadAuditTrail, hint: counts.legacyLeadAuditTrail === 0 ? 'No rows recorded' : 'Legacy table still has data', icon: Database, tone: counts.legacyLeadAuditTrail === 0 ? 'warning' : 'default' },
            { label: 'Loaded into this view', value: entries.length, hint: 'Recent live rows from both active sources', icon: Sparkles, tone: 'default' },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Filter the live trail" icon={Search}>
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="Search address, actor, event type, metadata, or lead id"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ['all', `All (${entries.length})`],
                  ['activity_events', `activity_events (${entries.filter((entry) => entry.sourceTable === 'activity_events').length})`],
                  ['lead_activity_log', `lead_activity_log (${entries.filter((entry) => entry.sourceTable === 'lead_activity_log').length})`],
                ] as Array<[SourceFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSourceFilter(value)}
                    className={sourceFilter === value ? buttonSecondary.replace('bg-card', 'bg-primary').replace('text-foreground', 'text-primary-foreground').replace('border-border', 'border-primary') : buttonSecondary}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="What is actually populated" icon={Info}>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">activity_events</span> is currently populated mostly by lead creation and CSV/live-sync summary events.</p>
              <p><span className="font-medium text-foreground">lead_activity_log</span> currently contains enrichment and admin-style lead activity records.</p>
              <p><span className="font-medium text-foreground">lead_audit_trail</span> exists in schema but has {counts.legacyLeadAuditTrail} rows, so showing it here would be misleading.</p>
            </div>
          </Panel>
        </div>

        <Panel title="Recent lead audit timeline" icon={History}>
          {loading ? (
            <LoadingState label="Loading populated audit sources…" />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon={History}
              title="No audit rows match the current filters"
              hint="Try a broader search or switch back to all populated sources."
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEntries).map(([date, dayEntries]) => (
                <div key={date} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    {dayEntries.map((entry) => (
                      <div key={`${entry.sourceTable}-${entry.id}`} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill tone={entry.sourceTable === 'activity_events' ? 'primary' : 'success'}>{entry.sourceTable}</StatusPill>
                              <StatusPill tone="default">{prettyLabel(entry.eventType)}</StatusPill>
                              {entry.leadState && <StatusPill tone="default">{entry.leadState}</StatusPill>}
                            </div>
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">{entry.title}</h2>
                              <p className="text-xs text-muted-foreground">
                                {entry.leadAddress || entry.leadId || 'No lead id on this row'}
                              </p>
                            </div>
                            {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
                          </div>
                          <div className="space-y-2 text-xs text-muted-foreground lg:text-right">
                            <div>{formatRelativeTime(entry.timestamp)}</div>
                            <div>{new Date(entry.timestamp).toLocaleString()}</div>
                            {entry.actorName && (
                              <div className="inline-flex items-center gap-1 lg:justify-end">
                                <User size={12} />
                                <span>{entry.actorName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {Object.keys(entry.metadata).length > 0 && (
                          <details className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                            <summary className="cursor-pointer font-medium text-foreground">Show raw metadata</summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(entry.metadata, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AppLayout>
  );
}
