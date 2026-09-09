'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { MessageSquare, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronRight, Search, RotateCcw, Wifi, WifiOff, TrendingUp, Users, GitBranch, Building2, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type DeliveryStatus = 'sent' | 'delivered' | 'failed' | 'bounced' | 'queued' | 'undelivered';
type ViewMode = 'sequence' | 'agent' | 'portfolio';

interface SMSRecord {
  id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  status: DeliveryStatus;
  sent_at: string;
  updated_at?: string;
  template_id?: string;
  template_label?: string;
  sequence_id?: string;
  sequence_name?: string;
  agent_id?: string;
  agent_name?: string;
  portfolio?: string;
  message_sid?: string;
  twilio_status?: string;
  error_code?: string;
  error_message?: string;
  retry_count: number;
  body_preview?: string;
  channel: string;
}

interface GroupedView {
  key: string;
  label: string;
  records: SMSRecord[];
  sent: number;
  delivered: number;
  failed: number;
  queued: number;
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  delivered: { label: 'Delivered', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: <CheckCircle size={12} /> },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-500/10', icon: <Wifi size={12} /> },
  queued: { label: 'Queued', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: <Clock size={12} /> },
  failed: { label: 'Failed', color: 'text-red-600', bg: 'bg-red-500/10', icon: <XCircle size={12} /> },
  bounced: { label: 'Bounced', color: 'text-orange-600', bg: 'bg-orange-500/10', icon: <AlertTriangle size={12} /> },
  undelivered: { label: 'Undelivered', color: 'text-red-500', bg: 'bg-red-500/8', icon: <WifiOff size={12} /> },
};

const TWILIO_ERROR_CODES: Record<string, string> = {
  '30001': 'Queue overflow — too many messages queued',
  '30002': 'Account suspended',
  '30003': 'Unreachable destination handset',
  '30004': 'Message blocked by carrier',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier violation — message filtered as spam',
  '30008': 'Unknown error from carrier',
  '30009': 'Missing segment — partial message received',
  '30010': 'Message price exceeds max price',
  '21211': 'Invalid To phone number',
  '21614': 'To number is not a mobile number',
  '21408': 'Permission to send an SMS has not been enabled',
};

// Mock data generator for demo
function generateMockRecords(): SMSRecord[] {
  const portfolios = ['Colorado', 'California', 'Nevada', 'Washington', 'Texas', 'Florida'];
  const agents = ['Sarah Chen', 'Marcus Webb', 'Priya Nair', 'Tom Okafor'];
  const sequences = ['Initial Outreach', 'Follow-Up Cadence', 'Revenue Pitch', 'Proposal Ready'];
  const statuses: DeliveryStatus[] = ['delivered', 'sent', 'failed', 'queued', 'bounced', 'delivered', 'delivered', 'sent'];
  const templates = ['Initial Introduction', 'Follow-Up Nudge', 'Revenue Estimate Offer', 'Proposal Ready', 'Check-In'];
  const errorCodes = ['30003', '30004', '30006', '30007', '21211', ''];

  return Array.from({ length: 48 }, (_, i) => {
    const status = statuses[i % statuses.length];
    const hasError = status === 'failed' || status === 'bounced';
    const errorCode = hasError ? errorCodes[i % errorCodes.length] : '';
    const hoursAgo = Math.floor(Math.random() * 72);
    const sentAt = new Date(Date.now() - hoursAgo * 3600000).toISOString();

    return {
      id: `sms-${i + 1}`,
      lead_id: `lead-${i + 1}`,
      lead_name: `Lead ${String.fromCharCode(65 + (i % 26))}. ${['Smith', 'Johnson', 'Williams', 'Brown', 'Davis'][i % 5]}`,
      phone: `+1 (${600 + (i % 400)}) ${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      status,
      sent_at: sentAt,
      updated_at: new Date(new Date(sentAt).getTime() + Math.random() * 3600000).toISOString(),
      template_id: `tpl-${i % 5}`,
      template_label: templates[i % templates.length],
      sequence_id: `seq-${i % 4}`,
      sequence_name: sequences[i % sequences.length],
      agent_id: `agent-${i % 4}`,
      agent_name: agents[i % agents.length],
      portfolio: portfolios[i % portfolios.length],
      message_sid: status !== 'queued' ? `SM${Math.random().toString(36).slice(2, 34).toUpperCase()}` : undefined,
      twilio_status: status,
      error_code: errorCode || undefined,
      error_message: errorCode ? TWILIO_ERROR_CODES[errorCode] : undefined,
      retry_count: hasError ? Math.floor(Math.random() * 3) : 0,
      body_preview: `Hi there, this is your TRAVLR agent. We help homeowners earn more through short-term rentals…`,
      channel: 'sms',
    };
  });
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.sent;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface RecordRowProps {
  record: SMSRecord;
}

function RecordRow({ record }: RecordRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-foreground">{record.lead_name}</p>
              <p className="text-[10px] text-muted-foreground">{record.phone}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={record.status} />
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <p className="text-[10px] text-foreground/80 truncate max-w-[120px]">{record.sequence_name || '—'}</p>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <p className="text-[10px] text-foreground/80">{record.agent_name || '—'}</p>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <p className="text-[10px] text-foreground/80">{record.portfolio || '—'}</p>
        </td>
        <td className="px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">{formatRelativeTime(record.sent_at)}</p>
        </td>
        <td className="px-3 py-2.5 text-center">
          {record.retry_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
              <RotateCcw size={10} />
              {record.retry_count}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20 border-b border-border">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Timeline */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-[10px] text-foreground/70">Sent · {new Date(record.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  {record.updated_at && record.updated_at !== record.sent_at && (
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${record.status === 'delivered' ? 'bg-emerald-500' : record.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <span className="text-[10px] text-foreground/70">
                        {STATUS_CONFIG[record.status]?.label} · {new Date(record.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  {record.retry_count > 0 && Array.from({ length: record.retry_count }).map((_, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                      <span className="text-[10px] text-foreground/70">Retry attempt {ri + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                {record.message_sid && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Message SID</p>
                    <p className="text-[10px] font-mono text-foreground/70 break-all">{record.message_sid}</p>
                  </div>
                )}
                {record.template_label && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Template</p>
                    <p className="text-[10px] text-foreground/70">{record.template_label}</p>
                  </div>
                )}
                {record.body_preview && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Message Preview</p>
                    <p className="text-[10px] text-foreground/70 italic">{record.body_preview}</p>
                  </div>
                )}
                {record.error_code && (
                  <div className="p-2 bg-red-500/8 border border-red-200/40 rounded-lg">
                    <p className="text-[10px] font-bold text-red-700 mb-0.5">Twilio Error Code: {record.error_code}</p>
                    <p className="text-[10px] text-red-600">{record.error_message || TWILIO_ERROR_CODES[record.error_code] || 'Unknown error'}</p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SMSDeliveryPage() {
  const [records, setRecords] = useState<SMSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('sequence');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const loadRecords = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Try to load from outreach_history
      const { data, error } = await supabase
        .from('outreach_history')
        .select('*')
        .eq('channel', 'sms')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      if (data && data.length > 0) {
        const mapped: SMSRecord[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          lead_id: String(row.lead_id || ''),
          lead_name: String((row.metadata as Record<string, unknown>)?.lead_name || 'Unknown Lead'),
          phone: String((row.metadata as Record<string, unknown>)?.to || '—'),
          status: (String(row.status || 'queued')) as DeliveryStatus,
          sent_at: String(row.sent_at || new Date().toISOString()),
          updated_at: String(row.updated_at || row.sent_at || new Date().toISOString()),
          template_id: String(row.template_id || ''),
          template_label: String((row.metadata as Record<string, unknown>)?.template_label || ''),
          sequence_id: String(row.sequence_step_id || ''),
          sequence_name: String((row.metadata as Record<string, unknown>)?.sequence_name || ''),
          agent_id: String(row.agent_id || ''),
          agent_name: String((row.metadata as Record<string, unknown>)?.agent_name || ''),
          portfolio: String((row.metadata as Record<string, unknown>)?.portfolio || ''),
          message_sid: String((row.metadata as Record<string, unknown>)?.message_sid || ''),
          twilio_status: String((row.metadata as Record<string, unknown>)?.twilio_delivery_status || row.status || ''),
          error_code: String((row.metadata as Record<string, unknown>)?.twilio_error_code || ''),
          error_message: String((row.metadata as Record<string, unknown>)?.twilio_error_message || ''),
          retry_count: Number((row.metadata as Record<string, unknown>)?.retry_count || 0),
          body_preview: String((row.metadata as Record<string, unknown>)?.message || '').slice(0, 100),
          channel: 'sms',
        }));
        setRecords(mapped);
      } else {
        // No SMS records yet — show empty state
        setRecords([]);
      }
    } catch {
      // Show empty state with error toast — do NOT fall back to mock data
      setRecords([]);
      if (!isRefresh) {
        // Only toast on initial load failure, not on refresh
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filteredRecords = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.lead_name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.sequence_name?.toLowerCase().includes(q) ||
        r.agent_name?.toLowerCase().includes(q) ||
        r.portfolio?.toLowerCase().includes(q) ||
        r.error_code?.includes(q)
      );
    }
    return true;
  });

  // Group records
  const groupedViews: GroupedView[] = useMemo(() => {
    const groups = new Map<string, SMSRecord[]>();

    filteredRecords.forEach(r => {
      const key = viewMode === 'sequence' ? (r.sequence_name ||'No Sequence')
        : viewMode === 'agent' ? (r.agent_name ||'Unassigned')
        : (r.portfolio || 'No Portfolio');

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });

    return Array.from(groups.entries()).map(([key, recs]) => ({
      key,
      label: key,
      records: recs,
      sent: recs.filter(r => r.status === 'sent').length,
      delivered: recs.filter(r => r.status === 'delivered').length,
      failed: recs.filter(r => r.status === 'failed' || r.status === 'bounced' || r.status === 'undelivered').length,
      queued: recs.filter(r => r.status === 'queued').length,
    })).sort((a, b) => b.records.length - a.records.length);
  }, [filteredRecords, viewMode]);

  // KPIs
  const totalSent = records.length;
  const totalDelivered = records.filter(r => r.status === 'delivered').length;
  const totalFailed = records.filter(r => r.status === 'failed' || r.status === 'bounced' || r.status === 'undelivered').length;
  const totalQueued = records.filter(r => r.status === 'queued').length;
  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const viewModeIcons: Record<ViewMode, React.ReactNode> = {
    sequence: <GitBranch size={13} />,
    agent: <Users size={13} />,
    portfolio: <Building2 size={13} />,
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <MessageSquare size={17} className="text-purple-500" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">SMS Delivery</h1>
              <p className="text-[11px] text-muted-foreground">Real-time delivery status · Twilio webhook data</p>
            </div>
          </div>
          <button
            onClick={() => loadRecords(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 py-4 border-b border-border bg-muted/20 shrink-0">
          {[
            { label: 'Total Sent', value: totalSent, color: 'text-foreground', icon: <MessageSquare size={14} className="text-purple-500" /> },
            { label: 'Delivered', value: totalDelivered, color: 'text-emerald-600', icon: <CheckCircle size={14} className="text-emerald-500" /> },
            { label: 'Failed / Bounced', value: totalFailed, color: 'text-red-600', icon: <XCircle size={14} className="text-red-500" /> },
            { label: 'Queued', value: totalQueued, color: 'text-amber-600', icon: <Clock size={14} className="text-amber-500" /> },
            { label: 'Delivery Rate', value: `${deliveryRate}%`, color: deliveryRate >= 80 ? 'text-emerald-600' : deliveryRate >= 55 ? 'text-amber-600' : 'text-red-600', icon: <TrendingUp size={14} className="text-blue-500" /> },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              {kpi.icon}
              <div>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={`text-sm font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-card shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(['sequence', 'agent', 'portfolio'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                  viewMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {viewModeIcons[mode]}
                {mode}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'delivered', 'sent', 'queued', 'failed', 'bounced'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-purple-600 text-white' :'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s as DeliveryStatus]?.label || s}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search leads, agents, sequences…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30 w-52"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : groupedViews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare size={32} className="text-muted-foreground mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">No SMS records found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or refreshing.</p>
            </div>
          ) : (
            groupedViews.map(group => {
              const isExpanded = expandedGroups.has(group.key);
              const failRate = group.records.length > 0
                ? Math.round(((group.failed) / group.records.length) * 100)
                : 0;

              return (
                <div key={group.key} className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                      : <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    }
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-foreground truncate">{group.label}</p>
                      <p className="text-[10px] text-muted-foreground">{group.records.length} messages</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-emerald-600 font-semibold">{group.delivered} delivered</span>
                        <span className="text-muted-foreground text-[10px]">·</span>
                        <span className="text-[10px] text-blue-600 font-semibold">{group.sent} sent</span>
                        <span className="text-muted-foreground text-[10px]">·</span>
                        <span className="text-[10px] text-red-600 font-semibold">{group.failed} failed</span>
                        {group.queued > 0 && (
                          <>
                            <span className="text-muted-foreground text-[10px]">·</span>
                            <span className="text-[10px] text-amber-600 font-semibold">{group.queued} queued</span>
                          </>
                        )}
                      </div>
                      {failRate > 20 && (
                        <span className="flex items-center gap-1 text-[10px] text-red-600 font-semibold bg-red-500/10 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} />
                          {failRate}% fail rate
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Delivery bar */}
                  <div className="h-1 bg-muted flex overflow-hidden">
                    {group.delivered > 0 && (
                      <div className="bg-emerald-500 h-full" style={{ width: `${(group.delivered / group.records.length) * 100}%` }} />
                    )}
                    {group.sent > 0 && (
                      <div className="bg-blue-500 h-full" style={{ width: `${(group.sent / group.records.length) * 100}%` }} />
                    )}
                    {group.queued > 0 && (
                      <div className="bg-amber-400 h-full" style={{ width: `${(group.queued / group.records.length) * 100}%` }} />
                    )}
                    {group.failed > 0 && (
                      <div className="bg-red-500 h-full" style={{ width: `${(group.failed / group.records.length) * 100}%` }} />
                    )}
                  </div>

                  {/* Records table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lead</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Sequence</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Agent</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Portfolio</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sent</th>
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">Retries</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map(record => (
                            <RecordRow key={record.id} record={record} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Twilio info note */}
          {!loading && records.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 bg-blue-500/5 border border-blue-200/40 rounded-xl">
              <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-blue-700">Twilio Webhook Integration</p>
                <p className="text-[10px] text-blue-600 mt-0.5 leading-relaxed">
                  Real-time delivery status updates are received via Twilio webhooks at <code className="font-mono bg-blue-100 px-1 rounded">/api/sms/status</code>.
                  Configure your Twilio number&apos;s status callback URL to <code className="font-mono bg-blue-100 px-1 rounded">{process.env.NEXT_PUBLIC_SITE_URL}/api/sms/status</code> to enable live updates.
                  Error codes follow the <a href="https://www.twilio.com/docs/api/errors" target="_blank" rel="noopener noreferrer" className="underline">Twilio Error Dictionary</a>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
