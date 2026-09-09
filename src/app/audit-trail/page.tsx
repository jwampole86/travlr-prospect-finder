'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  loadAuditTrail,
  formatAuditEventLabel,
  EVENT_TYPE_COLORS,
  type AuditTrailEntry,
  type AuditEventType,
} from '@/lib/services/auditTrailService';
import {
  History, Search, Filter, Loader2, GitCommit, User, Clock, ChevronDown,
} from 'lucide-react';

const EVENT_TYPE_OPTIONS: { value: AuditEventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Events' },
  { value: 'stage_progression', label: 'Stage Changes' },
  { value: 'field_change', label: 'Field Changes' },
  { value: 'note_added', label: 'Notes Added' },
  { value: 'enrichment_event', label: 'Enrichment' },
  { value: 'lead_created', label: 'Lead Created' },
  { value: 'lead_deleted', label: 'Lead Deleted' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AuditTrailPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<AuditEventType | 'all'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await loadAuditTrail(user.id, undefined, 200);
    setEntries(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (eventTypeFilter !== 'all' && e.event_type !== eventTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.lead_id.toLowerCase().includes(q) ||
        (e.field_name ?? '').toLowerCase().includes(q) ||
        (e.old_value ?? '').toLowerCase().includes(q) ||
        (e.new_value ?? '').toLowerCase().includes(q) ||
        (e.changed_by_email ?? '').toLowerCase().includes(q) ||
        formatAuditEventLabel(e).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const grouped = filtered.reduce<Record<string, AuditTrailEntry[]>>((acc, entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <History size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Lead Audit Trail</h1>
              <p className="text-xs text-muted-foreground">Track all lead mutations — field changes, stage progressions, notes, and enrichment events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{filtered.length} events</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by lead, field, user..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-all"
            >
              <Filter size={12} />
              {EVENT_TYPE_OPTIONS.find((o) => o.value === eventTypeFilter)?.label ?? 'All Events'}
              <ChevronDown size={11} className="text-muted-foreground" />
            </button>
            {showFilterMenu && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[160px] overflow-hidden">
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setEventTypeFilter(opt.value as AuditEventType | 'all'); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-all ${eventTypeFilter === opt.value ? 'text-primary font-semibold' : 'text-foreground'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <History size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No audit events found</p>
              <p className="text-xs text-muted-foreground">Lead mutations will appear here as they happen — stage changes, field edits, notes, and enrichment events.</p>
            </div>
          ) : (
            <div className="max-w-3xl space-y-6">
              {Object.entries(grouped).map(([date, dayEntries]) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{date}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <div key={entry.id} className="flex gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${EVENT_TYPE_COLORS[entry.event_type] ?? 'bg-muted text-muted-foreground'}`}>
                            <GitCommit size={12} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground leading-snug">{formatAuditEventLabel(entry)}</p>
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${EVENT_TYPE_COLORS[entry.event_type] ?? 'bg-muted text-muted-foreground'}`}>
                              {entry.event_type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <GitCommit size={10} />
                              Lead: <span className="font-mono text-foreground">{entry.lead_id.slice(0, 12)}…</span>
                            </span>
                            {entry.changed_by_email && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <User size={10} />
                                {entry.changed_by_email}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock size={10} />
                              {timeAgo(entry.created_at)}
                            </span>
                          </div>
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <p className="text-[11px] text-muted-foreground mt-1 font-mono bg-muted/40 px-2 py-1 rounded">
                              {JSON.stringify(entry.metadata).slice(0, 120)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
