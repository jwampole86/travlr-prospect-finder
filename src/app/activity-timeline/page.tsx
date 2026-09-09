'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Activity, Mail, Phone, FileText, Star, GitBranch, RefreshCw, Plus, Search, Clock, User, Download, Filter, Zap, ArrowUpRight, Loader2, X, Building2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | 'email_sent' | 'email_opened' | 'email_replied' | 'email_bounced' |'sms_sent'| 'sms_replied' |'call_logged' |'note_added' |'stage_changed' |'score_updated' |'assignment_changed' |'enrichment' |'sequence_enrolled'| 'sequence_step_triggered' |'questionnaire';

interface TimelineEvent {
  id: string;
  leadId: string;
  leadAddress: string;
  leadCity: string;
  type: EventType;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const typeConfig: Record<EventType, { icon: React.ReactNode; color: string; bg: string; label: string; group: string }> = {
  email_sent:            { icon: <Mail size={13} />,       color: 'text-blue-600',    bg: 'bg-blue-500/10',    label: 'Email Sent',          group: 'outreach' },
  email_opened:          { icon: <Mail size={13} />,       color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Email Opened',        group: 'outreach' },
  email_replied:         { icon: <Mail size={13} />,       color: 'text-green-600',   bg: 'bg-green-500/10',   label: 'Email Replied',       group: 'outreach' },
  email_bounced:         { icon: <Mail size={13} />,       color: 'text-red-500',     bg: 'bg-red-500/10',     label: 'Email Bounced',       group: 'outreach' },
  sms_sent:              { icon: <ArrowUpRight size={13} />, color: 'text-teal-600',  bg: 'bg-teal-500/10',    label: 'SMS Sent',            group: 'outreach' },
  sms_replied:           { icon: <ArrowUpRight size={13} />, color: 'text-teal-500',  bg: 'bg-teal-400/10',    label: 'SMS Replied',         group: 'outreach' },
  call_logged:           { icon: <Phone size={13} />,      color: 'text-green-600',   bg: 'bg-green-500/10',   label: 'Call Logged',         group: 'outreach' },
  note_added:            { icon: <FileText size={13} />,   color: 'text-amber-600',   bg: 'bg-amber-500/10',   label: 'Note Added',          group: 'lead_change' },
  stage_changed:         { icon: <GitBranch size={13} />,  color: 'text-purple-600',  bg: 'bg-purple-500/10',  label: 'Stage Changed',       group: 'lead_change' },
  score_updated:         { icon: <Star size={13} />,       color: 'text-orange-500',  bg: 'bg-orange-500/10',  label: 'Score Updated',       group: 'lead_change' },
  assignment_changed:    { icon: <User size={13} />,       color: 'text-indigo-500',  bg: 'bg-indigo-500/10',  label: 'Assignment Changed',  group: 'lead_change' },
  enrichment:            { icon: <RefreshCw size={13} />,  color: 'text-teal-600',    bg: 'bg-teal-500/10',    label: 'Lead Enriched',       group: 'lead_change' },
  sequence_enrolled:     { icon: <Zap size={13} />,        color: 'text-violet-600',  bg: 'bg-violet-500/10',  label: 'Sequence Enrolled',   group: 'sequence' },
  sequence_step_triggered: { icon: <Zap size={13} />,      color: 'text-violet-400',  bg: 'bg-violet-400/10',  label: 'Sequence Step',       group: 'sequence' },
  questionnaire:         { icon: <FileText size={13} />,   color: 'text-indigo-600',  bg: 'bg-indigo-500/10',  label: 'Questionnaire',       group: 'lead_change' },
};

const GROUP_LABELS: Record<string, string> = {
  all: 'All Events',
  outreach: 'Outreach',
  lead_change: 'Lead Changes',
  sequence: 'Sequence Triggers',
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_EVENTS: TimelineEvent[] = [
  { id: 't1',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'email_sent',            title: 'Initial Outreach Sent',         detail: 'Subject: Maximize Your Denver Property Revenue',                  actor: 'Sarah Mitchell', timestamp: '2026-08-13T09:00:00Z', metadata: { template: 'Initial Outreach' } },
  { id: 't2',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'email_opened',          title: 'Email Opened',                  detail: 'Opened 2 hours after send',                                       actor: 'System',         timestamp: '2026-08-13T11:12:00Z' },
  { id: 't3',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'stage_changed',         title: 'Stage Changed',                 detail: 'New Lead → Contacted',                                            actor: 'Sarah Mitchell', timestamp: '2026-08-13T09:01:00Z', metadata: { from: 'New Lead', to: 'Contacted' } },
  { id: 't4',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'note_added',            title: 'Note Added',                    detail: 'Owner seems interested — has a 3BR in Capitol Hill. Follow up in 4 days.', actor: 'Sarah Mitchell', timestamp: '2026-08-12T14:30:00Z' },
  { id: 't5',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'score_updated',         title: 'Prospect Score Updated',        detail: 'Score changed from 72 → 85 after enrichment',                    actor: 'System',         timestamp: '2026-08-11T08:00:00Z', metadata: { from: 72, to: 85 } },
  { id: 't6',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'enrichment',            title: 'Lead Enriched',                 detail: 'Contact info verified · AirDNA data synced · Regulation confirmed', actor: 'System',        timestamp: '2026-08-10T16:45:00Z' },
  { id: 't7',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'call_logged',           title: 'Call Logged',                   detail: 'Left voicemail — owner unavailable. Will try again tomorrow.',    actor: 'Sarah Mitchell', timestamp: '2026-08-09T10:15:00Z', metadata: { outcome: 'Voicemail', duration: '0:45' } },
  { id: 't8',  leadId: 'l1', leadAddress: '1842 Larimer St', leadCity: 'Denver',     type: 'sequence_enrolled',     title: 'Enrolled in Sequence',          detail: 'Auto-enrolled in "High-Score Fast Track" — score crossed 75',    actor: 'System',         timestamp: '2026-08-08T13:00:00Z', metadata: { sequence: 'High-Score Fast Track', trigger: 'score_threshold' } },
  { id: 't9',  leadId: 'l2', leadAddress: '4521 Park Ave',   leadCity: 'Austin',     type: 'email_sent',            title: 'Follow-Up #1 Sent',             detail: 'Subject: Quick Follow-Up on Your Property',                       actor: 'James Torres',   timestamp: '2026-08-13T10:30:00Z', metadata: { template: 'Follow-Up #1' } },
  { id: 't10', leadId: 'l2', leadAddress: '4521 Park Ave',   leadCity: 'Austin',     type: 'email_bounced',         title: 'Email Bounced',                 detail: 'Hard bounce — invalid address. Retry with alternate contact.',    actor: 'System',         timestamp: '2026-08-13T10:31:00Z' },
  { id: 't11', leadId: 'l2', leadAddress: '4521 Park Ave',   leadCity: 'Austin',     type: 'assignment_changed',    title: 'Lead Reassigned',               detail: 'Assigned from James Torres → Priya Nair',                        actor: 'Admin',          timestamp: '2026-08-12T09:00:00Z', metadata: { from: 'James Torres', to: 'Priya Nair' } },
  { id: 't12', leadId: 'l3', leadAddress: '789 Beachfront Dr', leadCity: 'Miami',    type: 'sms_sent',              title: 'SMS Sent',                      detail: 'Hi, I wanted to follow up about your property at 789 Beachfront Dr…', actor: 'Priya Nair',  timestamp: '2026-08-13T14:00:00Z' },
  { id: 't13', leadId: 'l3', leadAddress: '789 Beachfront Dr', leadCity: 'Miami',    type: 'sms_replied',           title: 'SMS Reply Received',            detail: 'Owner replied: "Interested, call me tomorrow"',                  actor: 'System',         timestamp: '2026-08-13T14:45:00Z' },
  { id: 't14', leadId: 'l3', leadAddress: '789 Beachfront Dr', leadCity: 'Miami',    type: 'stage_changed',         title: 'Stage Changed',                 detail: 'Contacted → Interested',                                          actor: 'Priya Nair',     timestamp: '2026-08-13T15:00:00Z', metadata: { from: 'Contacted', to: 'Interested' } },
  { id: 't15', leadId: 'l3', leadAddress: '789 Beachfront Dr', leadCity: 'Miami',    type: 'sequence_step_triggered', title: 'Sequence Step Triggered',     detail: 'Step 2 of "Warm Lead Nurture" — stage changed to Interested',   actor: 'System',         timestamp: '2026-08-13T15:01:00Z', metadata: { sequence: 'Warm Lead Nurture', step: 2 } },
  { id: 't16', leadId: 'l4', leadAddress: '2201 Canyon Rd',   leadCity: 'Salt Lake City', type: 'email_replied',   title: 'Email Reply Received',          detail: 'Owner replied with interest — requesting a proposal',            actor: 'System',         timestamp: '2026-08-12T16:30:00Z' },
  { id: 't17', leadId: 'l4', leadAddress: '2201 Canyon Rd',   leadCity: 'Salt Lake City', type: 'score_updated',   title: 'Score Updated',                 detail: 'Score changed from 58 → 79 — enrichment stage 2 complete',       actor: 'System',         timestamp: '2026-08-11T11:00:00Z', metadata: { from: 58, to: 79 } },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function exportToCSV(events: TimelineEvent[]) {
  const headers = ['Timestamp', 'Lead Address', 'City', 'Event Type', 'Title', 'Detail', 'Actor'];
  const rows = events.map(e => [
    new Date(e.timestamp).toISOString(),
    e.leadAddress,
    e.leadCity,
    typeConfig[e.type]?.label ?? e.type,
    e.title,
    e.detail,
    e.actor,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `activity-timeline-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

interface AddEventModalProps {
  onAdd: (event: Omit<TimelineEvent, 'id'>) => void;
  onClose: () => void;
  leads: { id: string; address: string; city: string }[];
}

function AddEventModal({ onAdd, onClose, leads }: AddEventModalProps) {
  const [type, setType] = useState<EventType>('note_added');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');

  function handleSubmit() {
    if (!detail.trim()) { toast.error('Please enter a description'); return; }
    const lead = leads.find(l => l.id === leadId);
    onAdd({
      leadId,
      leadAddress: lead?.address ?? '',
      leadCity: lead?.city ?? '',
      type,
      title: title || (typeConfig[type]?.label ?? type),
      detail,
      actor: 'You',
      timestamp: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">Log Activity</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead</label>
            <select
              value={leadId}
              onChange={e => setLeadId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
            >
              {leads.map(l => <option key={l.id} value={l.id}>{l.address} — {l.city}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Activity Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as EventType)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="note_added">Note</option>
              <option value="call_logged">Call Logged</option>
              <option value="email_sent">Email Sent</option>
              <option value="email_replied">Email Reply Received</option>
              <option value="sms_sent">SMS Sent</option>
              <option value="stage_changed">Stage Change</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title (optional)</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Auto-generated if blank"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Details</label>
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={3}
              placeholder="Describe what happened..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Log Activity</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>(MOCK_EVENTS);
  const [loading, setLoading] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const supabase = createClient();
  const { user } = useAuth();
  const { selectedPortfolio } = usePortfolio();

  // Unique leads for the modal
  const uniqueLeads = Array.from(
    new Map(events.map(e => [e.leadId, { id: e.leadId, address: e.leadAddress, city: e.leadCity }])).values()
  );

  // Unique actors for filter
  const uniqueActors = Array.from(new Set(events.map(e => e.actor))).sort();

  const loadFromDB = useCallback(async () => {
    setLoading(true);
    try {
      const { data: outreach } = await supabase
        .from('outreach_history')
        .select('id, lead_id, channel, status, sent_at, reply_detected, replied_at, template_name, agent_id')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (outreach && outreach.length > 0) {
        const dbEvents: TimelineEvent[] = outreach.map((r: any) => {
          let type: EventType = 'email_sent';
          if (r.channel === 'sms') type = r.reply_detected ? 'sms_replied' : 'sms_sent';
          else if (r.status === 'bounced') type = 'email_bounced';
          else if (r.reply_detected || r.status === 'replied') type = 'email_replied';
          else type = 'email_sent';

          return {
            id: r.id,
            leadId: r.lead_id ?? '',
            leadAddress: 'Lead #' + (r.lead_id ?? '').slice(0, 8),
            leadCity: '',
            type,
            title: typeConfig[type]?.label ?? type,
            detail: r.template_name ? `Template: ${r.template_name}` : 'Outreach event',
            actor: r.agent_id ? `Agent ${r.agent_id.slice(0, 6)}` : 'System',
            timestamp: r.sent_at ?? new Date().toISOString(),
          };
        });
        setEvents([...dbEvents, ...MOCK_EVENTS]);
      }
    } catch {
      // Fall back to mock
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadFromDB(); }, [loadFromDB]);

  // Filter events
  const filteredEvents = events
    .filter(e => filterGroup === 'all' || typeConfig[e.type]?.group === filterGroup)
    .filter(e => !actorFilter || e.actor === actorFilter)
    .filter(e => !search || [e.title, e.detail, e.leadAddress, e.leadCity, e.actor]
      .some(v => v.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  function handleAddEvent(event: Omit<TimelineEvent, 'id'>) {
    setEvents(prev => [{ ...event, id: `t${Date.now()}` }, ...prev]);
    toast.success('Activity logged');
  }

  function handleExport() {
    exportToCSV(filteredEvents);
    toast.success(`Exported ${filteredEvents.length} events to CSV`);
  }

  // Group events by date for display
  const groupedEvents: { date: string; events: TimelineEvent[] }[] = [];
  filteredEvents.forEach(event => {
    const dateKey = new Date(event.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const existing = groupedEvents.find(g => g.date === dateKey);
    if (existing) existing.events.push(event);
    else groupedEvents.push({ date: dateKey, events: [event] });
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">Activity Timeline</h1>
              {selectedPortfolio && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                  <Building2 size={10} />
                  {selectedPortfolio.label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              All lead changes, outreach events, and sequence triggers — {filteredEvents.length} events
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}
            >
              <Filter size={12} />
              Filters
              {(actorFilter || filterGroup !== 'all') && (
                <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                  {(actorFilter ? 1 : 0) + (filterGroup !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Download size={12} />
              Export CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} />
              Log Activity
            </button>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="px-6 py-3 border-b border-border bg-card/50 shrink-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search events, leads, actors…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            {/* Group filter tabs */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {Object.entries(GROUP_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilterGroup(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterGroup === key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {showFilters && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Actor:</label>
                <select
                  value={actorFilter}
                  onChange={e => setActorFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">All actors</option>
                  {uniqueActors.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {(actorFilter || filterGroup !== 'all') && (
                <button
                  onClick={() => { setActorFilter(''); setFilterGroup('all'); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X size={11} /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Activity size={28} className="text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No activity found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or log a new activity</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedEvents.map(group => (
                <div key={group.date}>
                  {/* Date divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2">{group.date}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* Events for this date */}
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-3">
                      {group.events.map(event => {
                        const cfg = typeConfig[event.type];
                        return (
                          <div key={event.id} className="relative flex gap-4 pl-12">
                            {/* Icon */}
                            <div className={`absolute left-0 w-10 h-10 rounded-full border-2 border-card flex items-center justify-center ${cfg.bg}`}>
                              <span className={cfg.color}>{cfg.icon}</span>
                            </div>
                            {/* Content */}
                            <div className="flex-1 bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-colors">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-foreground">{event.title}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                                  <Clock size={10} />
                                  <span>{formatTime(event.timestamp)}</span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed mb-2">{event.detail}</p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <User size={10} />
                                  <span>{event.actor}</span>
                                </div>
                                {event.leadAddress && (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Building2 size={10} />
                                    <span>{event.leadAddress}{event.leadCity ? ` · ${event.leadCity}` : ''}</span>
                                  </div>
                                )}
                                {event.metadata && Object.entries(event.metadata).map(([k, v]) => (
                                  <span key={k} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {k}: {String(v)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddEventModal
          leads={uniqueLeads}
          onAdd={handleAddEvent}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </AppLayout>
  );
}
