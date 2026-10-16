'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, CheckCircle2, Download, MessageSquarePlus, Phone, RefreshCw, Rows4, Signal, Users } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import {
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import LeadQueueTable from './components/LeadQueueTable';
import LogEntryModal from './components/LogEntryModal';
import OutreachActivityTable from './components/OutreachActivityTable';
import {
  COMM_TYPE_OPTIONS,
  OUTREACH_STATUS_OPTIONS,
  RESPONSE_STATUSES,
  STAGE_OPTIONS,
  exportOutreachCsv,
  formatDateTime,
  getLeadDisplayName,
  getLeadStageLabel,
  type LeadOption,
  type OutreachDashboardStats,
  type OutreachLead,
  type OutreachLog,
} from './lib';

type Tab = 'queue' | 'activity';

const LEAD_PAGE_SIZE = 25;
const LOG_PAGE_SIZE = 25;

export default function OutreachTrackingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [dashboard, setDashboard] = useState<OutreachDashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [leadRows, setLeadRows] = useState<OutreachLead[]>([]);
  const [leadTotal, setLeadTotal] = useState(0);
  const [leadPage, setLeadPage] = useState(1);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadOutreachFilter, setLeadOutreachFilter] = useState('NOT_CONTACTED');
  const [leadStageFilter, setLeadStageFilter] = useState('all');

  const [logs, setLogs] = useState<OutreachLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsResponseFilter, setLogsResponseFilter] = useState('all');
  const [logsCommTypeFilter, setLogsCommTypeFilter] = useState('all');
  const [logsDateFrom, setLogsDateFrom] = useState('');
  const [logsDateTo, setLogsDateTo] = useState('');
  const [updatingLogId, setUpdatingLogId] = useState<string | null>(null);

  const [modalLead, setModalLead] = useState<LeadOption | null>(null);

  const countQuery = useCallback(async (query: PromiseLike<{ count: number | null; error: { message?: string } | null }>) => {
    const result = await query;
    if (result.error) throw new Error(result.error.message || 'Count query failed');
    return result.count ?? 0;
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    try {
      const [
        totalLeads,
        newLeadStage,
        notContacted,
        touched,
        responded,
        withPhone,
        logsTotalCount,
        logsCompleted,
        logsOverdue,
        logsDueSoon,
        logsSnoozed,
      ] = await Promise.all([
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false)),
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).eq('stage', 'New Lead')),
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).eq('outreach_status', 'NOT_CONTACTED')),
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).not('last_contacted_at', 'is', null)),
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).not('outreach_responded_at', 'is', null)),
        countQuery(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).not('contact_phone', 'is', null)),
        countQuery(supabase.from('outreach_logs').select('id', { count: 'exact', head: true })),
        countQuery(supabase.from('outreach_logs').select('id', { count: 'exact', head: true }).eq('is_completed', true)),
        countQuery(supabase.from('outreach_logs').select('id', { count: 'exact', head: true }).eq('is_completed', false).not('due_date', 'is', null).lt('due_date', now.toISOString())),
        countQuery(supabase.from('outreach_logs').select('id', { count: 'exact', head: true }).eq('is_completed', false).not('due_date', 'is', null).gte('due_date', now.toISOString()).lt('due_date', next24h)),
        countQuery(supabase.from('outreach_logs').select('id', { count: 'exact', head: true }).not('snooze_until', 'is', null).gt('snooze_until', now.toISOString())),
      ]);

      setDashboard({
        totalLeads,
        newLeadStage,
        notContacted,
        touched,
        responded,
        withPhone,
        logsTotal: logsTotalCount,
        logsCompleted,
        logsOverdue,
        logsDueSoon,
        logsSnoozed,
      });
    } catch (error) {
      console.error('[OutreachTracking] dashboard failed', error);
      setDashboardError(error instanceof Error ? error.message : 'Failed to load outreach metrics');
    } finally {
      setDashboardLoading(false);
    }
  }, [countQuery, supabase]);

  const loadLeadQueue = useCallback(async () => {
    setLeadLoading(true);
    setLeadError(null);
    try {
      let query = supabase
        .from('leads')
        .select(
          'id, address, city, state, contact_name, owner_name, stage, outreach_status, prospect_score, last_contacted_at, outreach_responded_at, next_followup_due, contact_phone, created_at',
          { count: 'exact' }
        )
        .eq('is_synthetic', false)
        .order('created_at', { ascending: false })
        .range((leadPage - 1) * LEAD_PAGE_SIZE, leadPage * LEAD_PAGE_SIZE - 1);

      if (leadOutreachFilter !== 'all') query = query.eq('outreach_status', leadOutreachFilter);
      if (leadStageFilter !== 'all') query = query.eq('stage', leadStageFilter);
      if (leadSearch.trim()) {
        const term = leadSearch.trim();
        query = query.or(`address.ilike.%${term}%,city.ilike.%${term}%,owner_name.ilike.%${term}%,contact_name.ilike.%${term}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const nextRows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        address: String(row.address ?? ''),
        city: String(row.city ?? ''),
        state: String(row.state ?? ''),
        contact_name: String(row.contact_name ?? ''),
        owner_name: String(row.owner_name ?? ''),
        stage: String(row.stage ?? ''),
        outreach_status: String(row.outreach_status ?? 'NOT_CONTACTED'),
        prospect_score: typeof row.prospect_score === 'number' ? row.prospect_score : row.prospect_score ? Number(row.prospect_score) : null,
        last_contacted_at: row.last_contacted_at ? String(row.last_contacted_at) : null,
        outreach_responded_at: row.outreach_responded_at ? String(row.outreach_responded_at) : null,
        next_followup_due: row.next_followup_due ? String(row.next_followup_due) : null,
        contact_phone: row.contact_phone ? String(row.contact_phone) : null,
        created_at: row.created_at ? String(row.created_at) : null,
      }));

      setLeadRows(nextRows);
      setLeadTotal(count ?? 0);
    } catch (error) {
      console.error('[OutreachTracking] lead queue failed', error);
      setLeadError(error instanceof Error ? error.message : 'Failed to load lead queue');
    } finally {
      setLeadLoading(false);
    }
  }, [leadOutreachFilter, leadPage, leadSearch, leadStageFilter, supabase]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      let query = supabase
        .from('outreach_logs')
        .select('id, lead_id, agent_id, agent_name, comm_type, notes, response_status, logged_at, created_at, due_date, snooze_until, is_completed, priority, leads(address, city, state)', { count: 'exact' })
        .order('logged_at', { ascending: false })
        .range((logsPage - 1) * LOG_PAGE_SIZE, logsPage * LOG_PAGE_SIZE - 1);

      if (logsResponseFilter !== 'all') query = query.eq('response_status', logsResponseFilter);
      if (logsCommTypeFilter !== 'all') query = query.eq('comm_type', logsCommTypeFilter);
      if (logsDateFrom) query = query.gte('logged_at', logsDateFrom);
      if (logsDateTo) query = query.lte('logged_at', `${logsDateTo}T23:59:59.999Z`);

      const { data, count, error } = await query;
      if (error) throw error;

      const nextLogs = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const lead = (row.leads as Record<string, unknown> | null) ?? {};
        return {
          id: String(row.id),
          lead_id: String(row.lead_id),
          agent_id: row.agent_id ? String(row.agent_id) : null,
          agent_name: row.agent_name ? String(row.agent_name) : null,
          comm_type: String(row.comm_type ?? 'other') as OutreachLog['comm_type'],
          notes: row.notes ? String(row.notes) : null,
          response_status: String(row.response_status ?? 'No Answer') as OutreachLog['response_status'],
          logged_at: String(row.logged_at),
          created_at: String(row.created_at),
          due_date: row.due_date ? String(row.due_date) : null,
          snooze_until: row.snooze_until ? String(row.snooze_until) : null,
          is_completed: Boolean(row.is_completed),
          priority: row.priority ? String(row.priority) : null,
          lead_address: String(lead.address ?? ''),
          lead_city: String(lead.city ?? ''),
          lead_state: String(lead.state ?? ''),
        };
      });

      setLogs(nextLogs);
      setLogsTotal(count ?? 0);
    } catch (error) {
      console.error('[OutreachTracking] outreach logs failed', error);
      setLogsError(error instanceof Error ? error.message : 'Failed to load outreach logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logsCommTypeFilter, logsDateFrom, logsDateTo, logsPage, logsResponseFilter, supabase]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadLeadQueue();
  }, [loadLeadQueue]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadDashboard(), loadLeadQueue(), loadLogs()]);
  }, [loadDashboard, loadLeadQueue, loadLogs]);

  const handleToggleComplete = useCallback(async (log: OutreachLog) => {
    setUpdatingLogId(log.id);
    try {
      const { error } = await supabase.from('outreach_logs').update({ is_completed: !log.is_completed }).eq('id', log.id);
      if (error) throw error;
      toast.success(log.is_completed ? 'Marked as open.' : 'Marked as completed.');
      await Promise.all([loadLogs(), loadDashboard()]);
    } catch (error) {
      console.error('[OutreachTracking] toggle complete failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update outreach log');
    } finally {
      setUpdatingLogId(null);
    }
  }, [loadDashboard, loadLogs, supabase]);

  const handleSnooze = useCallback(async (log: OutreachLog, hours: number) => {
    setUpdatingLogId(log.id);
    try {
      const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('outreach_logs').update({ snooze_until: snoozeUntil }).eq('id', log.id);
      if (error) throw error;
      toast.success(`Snoozed until ${formatDateTime(snoozeUntil)}.`);
      await Promise.all([loadLogs(), loadDashboard()]);
    } catch (error) {
      console.error('[OutreachTracking] snooze failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to snooze outreach log');
    } finally {
      setUpdatingLogId(null);
    }
  }, [loadDashboard, loadLogs, supabase]);

  const filteredSummary = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: 'Real lead count', value: dashboard.totalLeads.toLocaleString(), hint: 'Exact count from leads', icon: Users, tone: 'default' as const },
      { label: 'New Lead stage', value: dashboard.newLeadStage.toLocaleString(), hint: 'stage = New Lead', icon: Rows4, tone: 'default' as const },
      { label: 'Not contacted', value: dashboard.notContacted.toLocaleString(), hint: 'outreach_status = NOT_CONTACTED', icon: Signal, tone: 'warning' as const },
      { label: 'Touched', value: dashboard.touched.toLocaleString(), hint: 'last_contacted_at is populated', icon: Phone, tone: 'default' as const },
      { label: 'Responded', value: dashboard.responded.toLocaleString(), hint: 'outreach_responded_at is populated', icon: CheckCircle2, tone: dashboard.responded > 0 ? 'success' as const : 'default' as const },
    ];
  }, [dashboard]);

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-4 py-5 sm:px-6">
        <PageHeader
          icon={BarChart3}
          title="Outreach Tracking"
          description="Exact outreach metrics from leads plus paginated outreach_logs activity. No mock counts, no capped 1,000-row summaries."
          actions={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => exportOutreachCsv(logs)} className={buttonSecondary}>
                <Download size={14} /> Export current log page
              </button>
              <button type="button" onClick={() => setModalLead({ id: '', address: '', city: '', state: '' })} className={buttonPrimary}>
                <MessageSquarePlus size={14} /> Log outreach
              </button>
              <button type="button" onClick={() => void refreshAll()} className={buttonSecondary}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          }
        />

        {dashboardError && <ErrorBanner message={dashboardError} onRetry={() => void loadDashboard()} />}
        {dashboardLoading || !dashboard ? <LoadingState label="Loading live outreach metrics…" /> : <StatGrid stats={filteredSummary} columns={5} />}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <SegmentedTabs
              tabs={[
                { key: 'queue', label: 'Lead queue', icon: Signal, badge: leadTotal || undefined },
                { key: 'activity', label: 'Outreach logs', icon: CalendarClock, badge: logsTotal || undefined },
              ]}
              value={activeTab}
              onChange={(value) => setActiveTab(value as Tab)}
            />

            {activeTab === 'queue' ? (
              <div className="space-y-4">
                <Panel title="Queue filters">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Search</span>
                      <input value={leadSearch} onChange={(event) => { setLeadPage(1); setLeadSearch(event.target.value); }} className={inputClass} placeholder="Address, city, owner, contact" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Outreach status</span>
                      <select value={leadOutreachFilter} onChange={(event) => { setLeadPage(1); setLeadOutreachFilter(event.target.value); }} className={inputClass}>
                        <option value="all">All</option>
                        {OUTREACH_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Stage</span>
                      <select value={leadStageFilter} onChange={(event) => { setLeadPage(1); setLeadStageFilter(event.target.value); }} className={inputClass}>
                        <option value="all">All</option>
                        {STAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Current focus</span>
                      <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        Stage labels come directly from leads.stage ({getLeadStageLabel('New Lead')}, not “New”).
                      </div>
                    </div>
                  </div>
                </Panel>
                {leadError && <ErrorBanner message={leadError} onRetry={() => void loadLeadQueue()} />}
                <LeadQueueTable
                  leads={leadRows}
                  total={leadTotal}
                  page={leadPage}
                  pageSize={LEAD_PAGE_SIZE}
                  loading={leadLoading}
                  onPageChange={setLeadPage}
                  onLogLead={setModalLead}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Panel title="Activity filters">
                  <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Response</span>
                      <select value={logsResponseFilter} onChange={(event) => { setLogsPage(1); setLogsResponseFilter(event.target.value); }} className={inputClass}>
                        <option value="all">All</option>
                        {RESPONSE_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Channel</span>
                      <select value={logsCommTypeFilter} onChange={(event) => { setLogsPage(1); setLogsCommTypeFilter(event.target.value); }} className={inputClass}>
                        <option value="all">All</option>
                        {COMM_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Logged from</span>
                      <input type="date" value={logsDateFrom} onChange={(event) => { setLogsPage(1); setLogsDateFrom(event.target.value); }} className={inputClass} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground">Logged to</span>
                      <input type="date" value={logsDateTo} onChange={(event) => { setLogsPage(1); setLogsDateTo(event.target.value); }} className={inputClass} />
                    </label>
                  </div>
                </Panel>
                {logsError && <ErrorBanner message={logsError} onRetry={() => void loadLogs()} />}
                <OutreachActivityTable
                  logs={logs}
                  total={logsTotal}
                  page={logsPage}
                  pageSize={LOG_PAGE_SIZE}
                  loading={logsLoading}
                  updatingId={updatingLogId}
                  onPageChange={setLogsPage}
                  onToggleComplete={(log) => void handleToggleComplete(log)}
                  onSnooze={(log, hours) => void handleSnooze(log, hours)}
                />
              </div>
            )}
          </div>

          <Panel title="Reality checks">
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div className="font-semibold text-foreground">leads.outreach_status</div>
                <div className="mt-1">This page uses the live enum-style values from leads, including <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">NOT_CONTACTED</code>.</div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div className="font-semibold text-foreground">leads.stage</div>
                <div className="mt-1">Pipeline stages are shown exactly as stored, e.g. <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">New Lead</code>.</div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div className="font-semibold text-foreground">outreach_logs</div>
                <div className="mt-1">Activity is paginated from outreach_logs with exact counts. No capped client-side rollups are used.</div>
              </div>
              {dashboard && (
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={dashboard.logsTotal > 0 ? 'success' : 'warning'}>{dashboard.logsTotal.toLocaleString()} log rows</StatusPill>
                    <StatusPill tone={dashboard.logsOverdue > 0 ? 'warning' : 'default'}>{dashboard.logsOverdue.toLocaleString()} overdue</StatusPill>
                    <StatusPill tone={dashboard.logsCompleted > 0 ? 'success' : 'default'}>{dashboard.logsCompleted.toLocaleString()} completed</StatusPill>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Leads with phone: {dashboard.withPhone.toLocaleString()} · Leads ever contacted: {dashboard.touched.toLocaleString()} · Leads with a response timestamp: {dashboard.responded.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {modalLead && (
        <LogEntryModal
          prefillLead={modalLead.id ? modalLead : null}
          onClose={() => setModalLead(null)}
          onSaved={refreshAll}
        />
      )}
    </AppLayout>
  );
}
