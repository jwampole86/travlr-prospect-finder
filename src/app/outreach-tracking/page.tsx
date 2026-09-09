'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Phone, MessageSquare, Mail, MoreHorizontal, Plus, Search, Filter, Calendar, User, ChevronDown, X, CheckCircle, Clock, AlertCircle, ThumbsUp, ThumbsDown, PhoneOff, PhoneMissed, RefreshCw, MapPin, ArrowUpDown, Loader2, Download, AlarmClock, CalendarClock, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type CommType = 'call' | 'text' | 'email' | 'other';
type ResponseStatus =
  | 'No Answer' | 'Interested' | 'Not Interested' | 'Follow-up Needed' |'Voicemail' | 'Callback Requested' | 'Wrong Number' | 'Do Not Contact';

interface OutreachLog {
  id: string;
  lead_id: string;
  agent_id: string | null;
  agent_name: string | null;
  comm_type: CommType;
  notes: string | null;
  response_status: ResponseStatus;
  logged_at: string;
  created_at: string;
  due_date: string | null;
  snooze_until: string | null;
  is_completed: boolean;
  priority: string | null;
  lead_address?: string;
  lead_city?: string;
  lead_state?: string;
}

interface LeadOption {
  id: string;
  address: string;
  city: string;
  state: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const COMM_TYPE_CONFIG: Record<CommType, { label: string; icon: React.ElementType; color: string }> = {
  call:  { label: 'Phone Call', icon: Phone,          color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
  text:  { label: 'Text / SMS', icon: MessageSquare,  color: 'text-violet-600 bg-violet-500/10 border-violet-500/20' },
  email: { label: 'Email',      icon: Mail,           color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  other: { label: 'Other',      icon: MoreHorizontal, color: 'text-slate-600 bg-slate-500/10 border-slate-500/20' },
};

const RESPONSE_STATUS_CONFIG: Record<ResponseStatus, { label: string; icon: React.ElementType; color: string }> = {
  'No Answer':          { label: 'No Answer',          icon: PhoneMissed,   color: 'text-slate-600 bg-slate-500/10 border-slate-500/20' },
  'Interested':         { label: 'Interested',          icon: ThumbsUp,      color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  'Not Interested':     { label: 'Not Interested',      icon: ThumbsDown,    color: 'text-red-600 bg-red-500/10 border-red-500/20' },
  'Follow-up Needed':   { label: 'Follow-up Needed',    icon: Clock,         color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  'Voicemail':          { label: 'Voicemail',            icon: PhoneOff,      color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
  'Callback Requested': { label: 'Callback Requested',  icon: RefreshCw,     color: 'text-purple-600 bg-purple-500/10 border-purple-500/20' },
  'Wrong Number':       { label: 'Wrong Number',         icon: AlertCircle,   color: 'text-orange-600 bg-orange-500/10 border-orange-500/20' },
  'Do Not Contact':     { label: 'Do Not Contact',       icon: X,             color: 'text-red-700 bg-red-600/10 border-red-600/20' },
};

const RESPONSE_STATUSES: ResponseStatus[] = [
  'No Answer', 'Interested', 'Not Interested', 'Follow-up Needed',
  'Voicemail', 'Callback Requested', 'Wrong Number', 'Do Not Contact',
];

const SNOOZE_PRESETS = [
  { label: '1 hour',    hours: 1 },
  { label: '3 hours',   hours: 3 },
  { label: 'Tomorrow',  hours: 24 },
  { label: '3 days',    hours: 72 },
  { label: '1 week',    hours: 168 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CommTypeBadge({ type }: { type: CommType }) {
  const cfg = COMM_TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon size={10} />{cfg.label}
    </span>
  );
}

function ResponseBadge({ status }: { status: ResponseStatus }) {
  const cfg = RESPONSE_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon size={10} />{cfg.label}
    </span>
  );
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function isDueOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const diff = new Date(dueDate).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000; // within 24h
}

function isSnoozed(snoozeUntil: string | null): boolean {
  if (!snoozeUntil) return false;
  return new Date(snoozeUntil) > new Date();
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportOutreachCSV(logs: OutreachLog[]) {
  const headers = [
    'Date/Time', 'Lead Address', 'City', 'State', 'Agent', 'Type',
    'Response Status', 'Notes', 'Due Date', 'Snooze Until', 'Completed', 'Priority'
  ];
  const rows = logs.map(l => [
    formatDateTime(l.logged_at),
    l.lead_address || '',
    l.lead_city || '',
    l.lead_state || '',
    l.agent_name || '',
    COMM_TYPE_CONFIG[l.comm_type]?.label || l.comm_type,
    l.response_status,
    l.notes || '',
    l.due_date ? formatDateTime(l.due_date) : '',
    l.snooze_until ? formatDateTime(l.snooze_until) : '',
    l.is_completed ? 'Yes' : 'No',
    l.priority || 'normal',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `outreach-logs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Outreach logs exported to CSV');
}

// ─── Log Entry Modal ──────────────────────────────────────────────────────────

interface LogEntryModalProps {
  onClose: () => void;
  onSaved: () => void;
  prefillLeadId?: string;
  prefillLeadAddress?: string;
}

function LogEntryModal({ onClose, onSaved, prefillLeadId, prefillLeadAddress }: LogEntryModalProps) {
  const [leadId, setLeadId] = useState(prefillLeadId || '');
  const [leadSearch, setLeadSearch] = useState(prefillLeadAddress || '');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [commType, setCommType] = useState<CommType>('call');
  const [responseStatus, setResponseStatus] = useState<ResponseStatus>('No Answer');
  const [notes, setNotes] = useState('');
  const [loggedAt, setLoggedAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [dueDate, setDueDate] = useState('');
  const [snoozeUntil, setSnoozeUntil] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [saving, setSaving] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const supabase = createClient();
  const { user } = useAuth();
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchLeads = useCallback(async (term: string) => {
    if (!term || term.length < 2) { setLeadOptions([]); return; }
    setSearchingLeads(true);
    try {
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state')
        .or(`address.ilike.%${term}%,city.ilike.%${term}%`)
        .eq('is_synthetic', false)
        .limit(10);
      setLeadOptions((data as LeadOption[]) || []);
    } finally {
      setSearchingLeads(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => searchLeads(leadSearch), 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [leadSearch, searchLeads]);

  function applySnoozePreset(hours: number) {
    const d = new Date(Date.now() + hours * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setSnoozeUntil(d.toISOString().slice(0, 16));
  }

  async function handleSave() {
    if (!leadId) { toast.error('Please select a lead'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('outreach_logs').insert({
        lead_id: leadId,
        agent_id: user?.id || null,
        agent_name: user?.user_metadata?.full_name || user?.email || null,
        comm_type: commType,
        response_status: responseStatus,
        notes: notes.trim() || null,
        logged_at: new Date(loggedAt).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        snooze_until: snoozeUntil ? new Date(snoozeUntil).toISOString() : null,
        priority,
        is_completed: false,
      });
      if (error) throw error;
      toast.success('Outreach entry logged');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to save entry');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-sm font-bold text-foreground">Log Outreach Entry</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Lead selector */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Lead / Property *</label>
            {prefillLeadId ? (
              <div className="px-3 py-2 bg-muted/50 rounded-lg text-xs text-foreground">{prefillLeadAddress}</div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={leadSearch}
                  onChange={e => { setLeadSearch(e.target.value); setLeadDropdownOpen(true); setLeadId(''); }}
                  onFocus={() => setLeadDropdownOpen(true)}
                  placeholder="Search by address or city..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {leadDropdownOpen && (leadOptions.length > 0 || searchingLeads) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                    {searchingLeads && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 size={11} className="animate-spin" />Searching…
                      </div>
                    )}
                    {leadOptions.map(l => (
                      <button
                        key={l.id}
                        onClick={() => {
                          setLeadId(l.id);
                          setLeadSearch(`${l.address}, ${l.city}, ${l.state}`);
                          setLeadDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-medium text-foreground">{l.address}</span>
                        <span className="text-muted-foreground ml-1">{l.city}, {l.state}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Communication type */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Communication Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(COMM_TYPE_CONFIG) as CommType[]).map(t => {
                const cfg = COMM_TYPE_CONFIG[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    onClick={() => setCommType(t)}
                    className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border text-[11px] font-medium transition-all ${
                      commType === t
                        ? 'border-primary bg-primary/10 text-primary' :'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <Icon size={14} />
                    {cfg.label.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Response status */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Response Status *</label>
            <div className="relative">
              <select
                value={responseStatus}
                onChange={e => setResponseStatus(e.target.value as ResponseStatus)}
                className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
              >
                {RESPONSE_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Priority</label>
            <div className="flex gap-2">
              {(['low', 'normal', 'high'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg border text-[11px] font-medium capitalize transition-all ${
                    priority === p
                      ? p === 'high' ? 'border-red-500 bg-red-500/10 text-red-600'
                        : p === 'low'? 'border-slate-400 bg-slate-500/10 text-slate-600' :'border-primary bg-primary/10 text-primary' :'border-border bg-muted/30 text-muted-foreground hover:border-border/80'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Date/time */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={loggedAt}
              onChange={e => setLoggedAt(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <CalendarClock size={12} className="text-amber-600" />
              Due Date / Follow-up Deadline
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {dueDate && (
              <button onClick={() => setDueDate('')} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={9} />Clear due date
              </button>
            )}
          </div>

          {/* Snooze until */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <AlarmClock size={12} className="text-blue-600" />
              Snooze Until (hide from queue until)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SNOOZE_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applySnoozePreset(p.hours)}
                  className="px-2.5 py-1 text-[10px] font-medium bg-muted/50 border border-border rounded-full hover:border-primary/40 hover:text-primary transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={snoozeUntil}
              onChange={e => setSnoozeUntil(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {snoozeUntil && (
              <button onClick={() => setSnoozeUntil('')} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={9} />Clear snooze
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="What happened? Any key details from the conversation..."
              className="w-full px-3 py-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !leadId}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OutreachTrackingPage() {
  const [logs, setLogs] = useState<OutreachLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterView, setFilterView] = useState<'all' | 'due' | 'overdue' | 'snoozed' | 'completed'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const supabase = createClient();

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('outreach_logs')
        .select('*, leads(address, city, state)')
        .order('logged_at', { ascending: sortDir === 'asc' })
        .limit(500);

      if (filterStatus !== 'all') query = query.eq('response_status', filterStatus);
      if (filterType !== 'all') query = query.eq('comm_type', filterType);
      if (filterAgent !== 'all') query = query.eq('agent_id', filterAgent);
      if (dateFrom) query = query.gte('logged_at', dateFrom);
      if (dateTo) query = query.lte('logged_at', dateTo + 'T23:59:59Z');

      const { data, error } = await query;
      if (error) throw error;

      const mapped: OutreachLog[] = (data || []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        lead_id: String(r.lead_id),
        agent_id: r.agent_id ? String(r.agent_id) : null,
        agent_name: r.agent_name ? String(r.agent_name) : null,
        comm_type: String(r.comm_type) as CommType,
        notes: r.notes ? String(r.notes) : null,
        response_status: String(r.response_status) as ResponseStatus,
        logged_at: String(r.logged_at),
        created_at: String(r.created_at),
        due_date: r.due_date ? String(r.due_date) : null,
        snooze_until: r.snooze_until ? String(r.snooze_until) : null,
        is_completed: Boolean(r.is_completed),
        priority: r.priority ? String(r.priority) : 'normal',
        lead_address: (r.leads as Record<string, unknown>)?.address ? String((r.leads as Record<string, unknown>).address) : undefined,
        lead_city: (r.leads as Record<string, unknown>)?.city ? String((r.leads as Record<string, unknown>).city) : undefined,
        lead_state: (r.leads as Record<string, unknown>)?.state ? String((r.leads as Record<string, unknown>).state) : undefined,
      }));

      setLogs(mapped);

      const agentMap: Record<string, string> = {};
      mapped.forEach(l => {
        if (l.agent_id && l.agent_name) agentMap[l.agent_id] = l.agent_name;
      });
      setAgents(Object.entries(agentMap).map(([id, name]) => ({ id, name })));
    } catch (e) {
      console.error('[OutreachTracking] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, filterStatus, filterType, filterAgent, dateFrom, dateTo, sortDir]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function toggleComplete(log: OutreachLog) {
    setUpdatingId(log.id);
    try {
      const { error } = await supabase
        .from('outreach_logs')
        .update({ is_completed: !log.is_completed })
        .eq('id', log.id);
      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, is_completed: !l.is_completed } : l));
      toast.success(log.is_completed ? 'Marked as pending' : 'Marked as completed');
    } catch {
      toast.error('Failed to update entry');
    } finally {
      setUpdatingId(null);
    }
  }

  async function snoozeEntry(log: OutreachLog, hours: number) {
    setUpdatingId(log.id);
    try {
      const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('outreach_logs')
        .update({ snooze_until: snoozeUntil })
        .eq('id', log.id);
      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, snooze_until: snoozeUntil } : l));
      toast.success(`Snoozed for ${hours < 24 ? hours + 'h' : Math.round(hours / 24) + 'd'}`);
    } catch {
      toast.error('Failed to snooze entry');
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredLogs = logs.filter(l => {
    if (search) {
      const term = search.toLowerCase();
      if (
        !l.lead_address?.toLowerCase().includes(term) &&
        !l.lead_city?.toLowerCase().includes(term) &&
        !l.notes?.toLowerCase().includes(term) &&
        !l.agent_name?.toLowerCase().includes(term)
      ) return false;
    }

    if (filterView === 'due') return l.due_date && !l.is_completed && !isSnoozed(l.snooze_until);
    if (filterView === 'overdue') return isDueOverdue(l.due_date) && !l.is_completed;
    if (filterView === 'snoozed') return isSnoozed(l.snooze_until);
    if (filterView === 'completed') return l.is_completed;

    return true;
  });

  const groupedByLead = filteredLogs.reduce<Record<string, OutreachLog[]>>((acc, log) => {
    if (!acc[log.lead_id]) acc[log.lead_id] = [];
    acc[log.lead_id].push(log);
    return acc;
  }, {});

  const overdueCount = logs.filter(l => isDueOverdue(l.due_date) && !l.is_completed).length;
  const dueSoonCount = logs.filter(l => isDueSoon(l.due_date) && !l.is_completed).length;
  const snoozedCount = logs.filter(l => isSnoozed(l.snooze_until)).length;
  const completedCount = logs.filter(l => l.is_completed).length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-base font-bold text-foreground">Outreach Tracking</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Log and track all homeowner communications with due dates and reminders</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportOutreachCSV(filteredLogs)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted/50 text-muted-foreground border border-border rounded-lg hover:border-primary/30 hover:text-foreground transition-colors"
            >
              <Download size={12} />Export CSV
            </button>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                showFilters ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              <Filter size={12} />Filters
            </button>
            <button
              onClick={() => setLogModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} />Log Entry
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 py-3 border-b border-border bg-muted/20 shrink-0">
          {[
            { label: 'Total Entries', value: filteredLogs.length, color: 'text-foreground' },
            { label: 'Overdue', value: overdueCount, color: overdueCount > 0 ? 'text-red-600' : 'text-foreground' },
            { label: 'Due Soon (24h)', value: dueSoonCount, color: dueSoonCount > 0 ? 'text-amber-600' : 'text-foreground' },
            { label: 'Completed', value: completedCount, color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl border border-border px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div className="flex gap-1 px-4 sm:px-6 py-2 border-b border-border bg-muted/5 shrink-0 overflow-x-auto">
          {[
            { key: 'all', label: 'All', count: logs.length },
            { key: 'overdue', label: 'Overdue', count: overdueCount, urgent: overdueCount > 0 },
            { key: 'due', label: 'Due', count: logs.filter(l => l.due_date && !l.is_completed).length },
            { key: 'snoozed', label: 'Snoozed', count: snoozedCount },
            { key: 'completed', label: 'Completed', count: completedCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterView(tab.key as typeof filterView)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                filterView === tab.key
                  ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  tab.urgent ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="px-4 sm:px-6 py-3 border-b border-border bg-muted/10 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="col-span-2 relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search address, notes, agent..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                >
                  <option value="all">All Statuses</option>
                  {RESPONSE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                >
                  <option value="all">All Types</option>
                  <option value="call">Phone Call</option>
                  <option value="text">Text / SMS</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {agents.length > 0 && (
                <div className="relative">
                  <select
                    value={filterAgent}
                    onChange={e => setFilterAgent(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                  >
                    <option value="all">All Agents</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 px-2 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 px-2 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg hover:border-primary/30 transition-colors text-muted-foreground"
              >
                <ArrowUpDown size={11} />
                {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="h-24 bg-muted/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Phone size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">No outreach entries</p>
              <p className="text-xs text-muted-foreground mb-4">
                {filterView !== 'all' ? 'No entries match this filter.' : 'Start logging calls, texts, and emails to track your homeowner outreach.'}
              </p>
              {filterView === 'all' && (
                <button
                  onClick={() => setLogModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus size={12} />Log First Entry
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map(log => {
                const overdue = isDueOverdue(log.due_date) && !log.is_completed;
                const dueSoon = isDueSoon(log.due_date) && !log.is_completed;
                const snoozed = isSnoozed(log.snooze_until);

                return (
                  <div
                    key={log.id}
                    className={`bg-card border rounded-xl px-4 py-3 hover:border-primary/20 transition-colors ${
                      log.is_completed ? 'opacity-60 border-border' : overdue ?'border-red-500/30 bg-red-500/5': dueSoon ?'border-amber-500/30 bg-amber-500/5': 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        {/* Complete toggle */}
                        <button
                          onClick={() => toggleComplete(log)}
                          disabled={updatingId === log.id}
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        >
                          {updatingId === log.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : log.is_completed ? (
                            <CheckSquare size={14} className="text-emerald-600" />
                          ) : (
                            <Square size={14} />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <CommTypeBadge type={log.comm_type} />
                            <ResponseBadge status={log.response_status} />
                            {log.priority === 'high' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border text-red-600 bg-red-500/10 border-red-500/20">
                                High Priority
                              </span>
                            )}
                            {snoozed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border text-blue-600 bg-blue-500/10 border-blue-500/20">
                                <AlarmClock size={9} />Snoozed
                              </span>
                            )}
                          </div>

                          {log.lead_address && (
                            <Link
                              href={`/lead-profile?id=${log.lead_id}`}
                              className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors mb-1"
                            >
                              <MapPin size={10} className="text-muted-foreground shrink-0" />
                              {log.lead_address}
                              {log.lead_city && <span className="font-normal text-muted-foreground">, {log.lead_city}, {log.lead_state}</span>}
                            </Link>
                          )}

                          {/* Due date display */}
                          {log.due_date && !log.is_completed && (
                            <div className={`flex items-center gap-1 text-[11px] mb-1 ${
                              overdue ? 'text-red-600 font-medium' : dueSoon ? 'text-amber-600 font-medium' : 'text-muted-foreground'
                            }`}>
                              <CalendarClock size={10} />
                              {overdue ? 'Overdue: ' : 'Due: '}
                              {formatDateTime(log.due_date)}
                            </div>
                          )}

                          {/* Snooze display */}
                          {snoozed && log.snooze_until && (
                            <div className="flex items-center gap-1 text-[11px] text-blue-600 mb-1">
                              <AlarmClock size={10} />
                              Snoozed until {formatDateTime(log.snooze_until)}
                            </div>
                          )}

                          {log.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{log.notes}</p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground justify-end">
                          <Calendar size={10} />
                          {formatDateTime(log.logged_at)}
                        </div>
                        {log.agent_name && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground justify-end">
                            <User size={10} />
                            {log.agent_name}
                          </div>
                        )}
                        {/* Snooze quick actions */}
                        {!log.is_completed && !snoozed && (
                          <div className="flex items-center gap-1 mt-1">
                            {SNOOZE_PRESETS.slice(0, 3).map(p => (
                              <button
                                key={p.label}
                                onClick={() => snoozeEntry(log, p.hours)}
                                disabled={updatingId === log.id}
                                className="px-1.5 py-0.5 text-[9px] font-medium bg-muted/50 border border-border rounded hover:border-primary/30 hover:text-primary transition-colors text-muted-foreground"
                                title={`Snooze ${p.label}`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {logModalOpen && (
        <LogEntryModal
          onClose={() => setLogModalOpen(false)}
          onSaved={loadLogs}
        />
      )}
    </AppLayout>
  );
}
