'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Activity, Filter, RefreshCw, Search, ChevronDown, AlertTriangle, Info, XCircle, User, Zap, Database, Calendar } from 'lucide-react';


interface AdminEvent {
  id: string;
  event_type: string;
  event_category: 'lead_change' | 'user_action' | 'system_event';
  actor_user_id: string | null;
  lead_id: string | null;
  title: string;
  description: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  event_timestamp: string;
}

const CATEGORY_CONFIG = {
  lead_change: { label: 'Lead Change', icon: Database, color: 'text-primary bg-primary/10 border-primary/30' },
  user_action: { label: 'User Action', icon: User, color: 'text-info bg-info/10 border-info/30' },
  system_event: { label: 'System Event', icon: Zap, color: 'text-warning bg-warning/10 border-warning/30' },
};

const SEVERITY_CONFIG = {
  info: { icon: Info, color: 'text-muted-foreground' },
  warning: { icon: AlertTriangle, color: 'text-warning' },
  error: { icon: XCircle, color: 'text-danger' },
  critical: { icon: XCircle, color: 'text-danger' },
};

const EVENT_TYPES = [
  'All Types', 'lead_created', 'stage_changed', 'data_enriched', 'lead_scored',
  'call_made', 'email_sent', 'sms_sent', 'template_sent', 'cadence_step',
  'sync_started', 'sync_completed', 'sync_failed', 'api_error', 'escalation',
];

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminEventsPage() {
  const { isAdmin } = useAuth();
  const supabase = createClient();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('All Types');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const rangeMap = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
    const hoursBack = rangeMap[dateRange];
    const since = new Date(now.getTime() - hoursBack * 3600000).toISOString();

    let query = supabase
      .from('admin_event_log')
      .select('*', { count: 'exact' })
      .gte('event_timestamp', since)
      .order('event_timestamp', { ascending: false })
      .limit(100);

    if (categoryFilter !== 'all') query = query.eq('event_category', categoryFilter);
    if (eventTypeFilter !== 'All Types') query = query.eq('event_type', eventTypeFilter);
    if (severityFilter !== 'all') query = query.eq('severity', severityFilter);
    if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);

    const { data, count, error } = await query;
    if (!error) {
      setEvents((data || []) as AdminEvent[]);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [supabase, categoryFilter, eventTypeFilter, severityFilter, dateRange, search]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  if (!isAdmin()) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <AlertTriangle size={32} className="text-warning mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Admin access required</p>
            <p className="text-xs text-muted-foreground mt-1">This dashboard is only available to administrators.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const categoryCounts = {
    all: events.length,
    lead_change: events.filter(e => e.event_category === 'lead_change').length,
    user_action: events.filter(e => e.event_category === 'user_action').length,
    system_event: events.filter(e => e.event_category === 'system_event').length,
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Event Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">All lead changes, user actions, and system events in one place</p>
          </div>
          <button
            onClick={loadEvents}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Events', value: total, icon: Activity, color: 'text-primary' },
            { label: 'Lead Changes', value: categoryCounts.lead_change, icon: Database, color: 'text-info' },
            { label: 'User Actions', value: categoryCounts.user_action, icon: User, color: 'text-success' },
            { label: 'System Events', value: categoryCounts.system_event, icon: Zap, color: 'text-warning' },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={13} className={stat.color} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={13} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filters:</span>

            {/* Date range */}
            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
              {(['1h', '24h', '7d', '30d'] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${dateRange === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {r}
                </button>
              ))}
            </div>

            {/* Category */}
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30">
              <option value="all">All Categories</option>
              <option value="lead_change">Lead Changes</option>
              <option value="user_action">User Actions</option>
              <option value="system_event">System Events</option>
            </select>

            {/* Event type */}
            <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30">
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>

            {/* Severity */}
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30">
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events by title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* Event list */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center">
              <Activity size={28} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No events found for the selected filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map(event => {
                const catConf = CATEGORY_CONFIG[event.event_category];
                const sevConf = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.info;
                const CatIcon = catConf.icon;
                const SevIcon = sevConf.icon;
                const isExpanded = expandedId === event.id;
                const hasDetails = event.old_value || event.new_value || event.description;

                return (
                  <div key={event.id} className="hover:bg-muted/30 transition-colors">
                    <div
                      className={`flex items-start gap-3 px-5 py-3.5 ${hasDetails ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : event.id)}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${catConf.color}`}>
                        <CatIcon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{event.title}</p>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${catConf.color}`}>
                            {catConf.label}
                          </span>
                          <SevIcon size={12} className={sevConf.color} />
                        </div>
                        {event.description && !isExpanded && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar size={10} />
                            {formatRelativeTime(event.event_timestamp)}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">{event.event_type}</span>
                          {event.lead_id && (
                            <span className="text-[11px] text-primary font-mono">lead:{event.lead_id.slice(0, 8)}</span>
                          )}
                        </div>
                      </div>
                      {hasDetails && (
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-2 bg-muted/20">
                        {event.description && (
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        )}
                        {(event.old_value || event.new_value) && (
                          <div className="grid grid-cols-2 gap-3">
                            {event.old_value && (
                              <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
                                <p className="text-[10px] font-semibold text-danger mb-1">Before</p>
                                <pre className="text-[11px] text-foreground overflow-auto max-h-24">{JSON.stringify(event.old_value, null, 2)}</pre>
                              </div>
                            )}
                            {event.new_value && (
                              <div className="bg-success/5 border border-success/20 rounded-lg p-3">
                                <p className="text-[10px] font-semibold text-success mb-1">After</p>
                                <pre className="text-[11px] text-foreground overflow-auto max-h-24">{JSON.stringify(event.new_value, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        )}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="bg-muted/60 rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Metadata</p>
                            <pre className="text-[11px] text-foreground overflow-auto max-h-24">{JSON.stringify(event.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {events.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {events.length} of {total} events in the last {dateRange}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
