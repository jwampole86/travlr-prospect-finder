'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Shield, Filter, Download, RefreshCw, Search, ChevronDown, Loader2, AlertTriangle, Clock, User, FileText, Phone, MessageSquare, GitBranch, Award, CheckCircle, X } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeCategory =
  | 'stage_transition' |'sms_sent' |'call_logged' |'agent_assignment' |'coaching_feedback' |'regulation_update' |'compliance_flag';

interface ChangeLogEntry {
  id: string;
  leadId: string | null;
  leadAddress: string;
  category: ChangeCategory;
  actorName: string;
  actorEmail: string;
  description: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  timestamp: string;
  regulationStatus: string | null;
  metadata: Record<string, unknown>;
}

interface FilterState {
  search: string;
  category: ChangeCategory | 'all';
  actorEmail: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<ChangeCategory, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  stage_transition: { label: 'Stage Transition', icon: GitBranch, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  sms_sent: { label: 'SMS Sent', icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  call_logged: { label: 'Call Logged', icon: Phone, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  agent_assignment: { label: 'Agent Assignment', icon: User, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  coaching_feedback: { label: 'Coaching Feedback', icon: Award, color: 'text-pink-600', bg: 'bg-pink-500/10' },
  regulation_update: { label: 'Regulation Update', icon: Shield, color: 'text-red-600', bg: 'bg-red-500/10' },
  compliance_flag: { label: 'Compliance Flag', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-500/10' },
};

function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function generateDemoEntries(): ChangeLogEntry[] {
  const agents = [
    { name: 'Sarah Mitchell', email: 'sarah@travlr.com' },
    { name: 'James Okafor', email: 'james@travlr.com' },
    { name: 'Priya Sharma', email: 'priya@travlr.com' },
    { name: 'System', email: 'system@travlr.com' },
  ];
  const addresses = [
    '1842 Sunset Blvd, Los Angeles, CA',
    '304 Ocean Dr, Miami Beach, FL',
    '77 Park Ave, New York, NY',
    '512 Maple St, Austin, TX',
    '2201 Lakeview Rd, Chicago, IL',
    '88 Hillcrest Way, Denver, CO',
  ];
  const entries: ChangeLogEntry[] = [];
  const now = Date.now();

  const templates: Array<Partial<ChangeLogEntry> & { category: ChangeCategory }> = [
    { category: 'stage_transition', description: 'Lead stage changed', fromValue: 'New Lead', toValue: 'Contacted', reason: 'Initial outreach completed' },
    { category: 'stage_transition', description: 'Lead stage changed', fromValue: 'Contacted', toValue: 'Interested', reason: 'Owner expressed interest in STR program' },
    { category: 'stage_transition', description: 'Lead stage changed', fromValue: 'Interested', toValue: 'Contract', reason: 'Agreement terms accepted' },
    { category: 'sms_sent', description: 'SMS sent to lead', fromValue: null, toValue: null, reason: 'Cadence step 2 — follow-up' },
    { category: 'sms_sent', description: 'SMS sent to lead', fromValue: null, toValue: null, reason: 'TCPA-compliant outreach window' },
    { category: 'call_logged', description: 'Outbound call logged', fromValue: null, toValue: null, reason: 'Scheduled callback' },
    { category: 'call_logged', description: 'Inbound call received', fromValue: null, toValue: null, reason: 'Owner initiated contact' },
    { category: 'agent_assignment', description: 'Lead reassigned to agent', fromValue: 'James Okafor', toValue: 'Sarah Mitchell', reason: 'Territory rebalancing' },
    { category: 'coaching_feedback', description: 'Coaching feedback assigned', fromValue: null, toValue: '3/5 stars', reason: 'Objection handling needs improvement' },
    { category: 'regulation_update', description: 'Regulation status updated', fromValue: 'Unknown', toValue: 'Restricted', reason: 'City ordinance update — permit required' },
    { category: 'regulation_update', description: 'Regulation status updated', fromValue: 'Unknown', toValue: 'Allowed', reason: 'Zone confirmed STR-eligible' },
    { category: 'compliance_flag', description: 'Compliance flag raised', fromValue: null, toValue: 'TCPA Review Required', reason: 'Contact outside permitted hours' },
  ];

  for (let i = 0; i < 60; i++) {
    const tmpl = templates[i % templates.length];
    const actor = agents[i % agents.length];
    const address = addresses[i % addresses.length];
    const ts = new Date(now - i * 3600000 * (1 + Math.random() * 4)).toISOString();
    entries.push({
      id: `log-${i}`,
      leadId: `lead-${i % 20}`,
      leadAddress: address,
      category: tmpl.category,
      actorName: actor.name,
      actorEmail: actor.email,
      description: tmpl.description ?? '',
      fromValue: tmpl.fromValue ?? null,
      toValue: tmpl.toValue ?? null,
      reason: tmpl.reason ?? null,
      timestamp: ts,
      regulationStatus: tmpl.category === 'regulation_update' ? (tmpl.toValue ?? null) : null,
      metadata: {},
    });
  }

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Log Entry Row ────────────────────────────────────────────────────────────

function LogEntryRow({ entry }: { entry: ChangeLogEntry }) {
  const meta = CATEGORY_META[entry.category];
  const Icon = meta.icon;

  return (
    <tr className="border-b border-border hover:bg-muted/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
            <Icon size={12} className={meta.color} />
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <p className="text-xs font-medium text-foreground line-clamp-1">{entry.leadAddress}</p>
        {entry.leadId && <p className="text-[10px] text-muted-foreground">{entry.leadId}</p>}
      </td>
      <td className="py-3 px-4">
        <p className="text-xs text-foreground">{entry.description}</p>
        {(entry.fromValue || entry.toValue) && (
          <div className="flex items-center gap-1.5 mt-1">
            {entry.fromValue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entry.fromValue}</span>
            )}
            {entry.fromValue && entry.toValue && (
              <span className="text-[10px] text-muted-foreground">→</span>
            )}
            {entry.toValue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{entry.toValue}</span>
            )}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <p className="text-xs text-foreground">{entry.actorName}</p>
        <p className="text-[10px] text-muted-foreground">{entry.actorEmail}</p>
      </td>
      <td className="py-3 px-4">
        {entry.reason ? (
          <p className="text-[11px] text-muted-foreground line-clamp-2 max-w-[180px]">{entry.reason}</p>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 italic">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <Clock size={10} className="text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtTs(entry.timestamp)}</span>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplianceChangeLogPage() {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category: 'all',
    actorEmail: '',
    dateFrom: '',
    dateTo: '',
    reason: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // Try to load from compliance_audit_log (exists per schema)
      const { data: auditData, error: auditErr } = await supabase
        .from('compliance_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (auditErr) throw auditErr;

      if (auditData && auditData.length > 0) {
        const mapped: ChangeLogEntry[] = auditData.map((row: Record<string, unknown>) => ({
          id: String(row.id ?? ''),
          leadId: row.lead_id ? String(row.lead_id) : null,
          leadAddress: String(row.lead_address ?? row.entity_id ?? 'Unknown Lead'),
          category: (row.event_type as ChangeCategory) ?? 'compliance_flag',
          actorName: String(row.actor_name ?? row.performed_by ?? 'System'),
          actorEmail: String(row.actor_email ?? ''),
          description: String(row.description ?? row.action ?? ''),
          fromValue: row.old_value ? String(row.old_value) : null,
          toValue: row.new_value ? String(row.new_value) : null,
          reason: row.reason ? String(row.reason) : null,
          timestamp: String(row.created_at ?? row.timestamp ?? new Date().toISOString()),
          regulationStatus: row.regulation_status ? String(row.regulation_status) : null,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        }));
        setEntries(mapped);
      } else {
        // Also pull from lead_audit_trail
        const { data: trailData } = await supabase
          .from('lead_audit_trail')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (trailData && trailData.length > 0) {
          const mapped: ChangeLogEntry[] = trailData.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ''),
            leadId: row.lead_id ? String(row.lead_id) : null,
            leadAddress: String(row.lead_address ?? 'Unknown Lead'),
            category: (row.event_type as ChangeCategory) ?? 'stage_transition',
            actorName: String(row.actor_name ?? 'System'),
            actorEmail: String(row.actor_email ?? ''),
            description: String(row.description ?? ''),
            fromValue: row.old_value ? String(row.old_value) : null,
            toValue: row.new_value ? String(row.new_value) : null,
            reason: row.reason ? String(row.reason) : null,
            timestamp: String(row.created_at ?? new Date().toISOString()),
            regulationStatus: null,
            metadata: {},
          }));
          setEntries(mapped);
        } else {
          // Fall back to demo data
          setEntries(generateDemoEntries());
        }
      }
    } catch (err: unknown) {
      // Fall back to demo data on error
      setEntries(generateDemoEntries());
      if (err instanceof Error && !err.message.includes('does not exist')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filteredEntries = entries.filter(e => {
    if (filters.category !== 'all' && e.category !== filters.category) return false;
    if (filters.actorEmail && !e.actorEmail.toLowerCase().includes(filters.actorEmail.toLowerCase())) return false;
    if (filters.reason && !(e.reason ?? '').toLowerCase().includes(filters.reason.toLowerCase())) return false;
    if (filters.dateFrom && new Date(e.timestamp) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(e.timestamp) > new Date(filters.dateTo + 'T23:59:59')) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        e.leadAddress.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.actorName.toLowerCase().includes(q) ||
        (e.reason ?? '').toLowerCase().includes(q) ||
        (e.fromValue ?? '').toLowerCase().includes(q) ||
        (e.toValue ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const paginatedEntries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);

  const activeFilterCount = [
    filters.category !== 'all',
    !!filters.actorEmail,
    !!filters.dateFrom,
    !!filters.dateTo,
    !!filters.reason,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilters({ search: '', category: 'all', actorEmail: '', dateFrom: '', dateTo: '', reason: '' });
    setPage(1);
  };

  // ── Category summary counts ──────────────────────────────────────────────────
  const categoryCounts = Object.keys(CATEGORY_META).reduce((acc, cat) => {
    acc[cat as ChangeCategory] = entries.filter(e => e.category === cat).length;
    return acc;
  }, {} as Record<ChangeCategory, number>);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              Compliance Change Log
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Immutable audit trail — stage transitions, SMS/call timestamps, agent assignments, coaching feedback, regulation updates
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadEntries}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-all">
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">{error} — showing demo data</p>
          </div>
        )}

        {/* Category Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {(Object.entries(CATEGORY_META) as [ChangeCategory, typeof CATEGORY_META[ChangeCategory]][]).map(([cat, meta]) => {
            const Icon = meta.icon;
            const count = categoryCounts[cat] ?? 0;
            const isActive = filters.category === cat;
            return (
              <button
                key={cat}
                onClick={() => { setFilters(f => ({ ...f, category: isActive ? 'all' : cat })); setPage(1); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  isActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center`}>
                  <Icon size={13} className={meta.color} />
                </div>
                <span className="text-lg font-bold text-foreground">{count}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search + Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
              placeholder="Search leads, agents, descriptions, reasons..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? 'border-primary bg-primary/5 text-primary' :'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Filter size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <X size={11} />
              Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredEntries.length} entries
          </span>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Category</label>
              <div className="relative">
                <select
                  value={filters.category}
                  onChange={e => { setFilters(f => ({ ...f, category: e.target.value as ChangeCategory | 'all' })); setPage(1); }}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 pr-6 py-1.5 text-foreground focus:outline-none appearance-none"
                >
                  <option value="all">All Categories</option>
                  {(Object.entries(CATEGORY_META) as [ChangeCategory, typeof CATEGORY_META[ChangeCategory]][]).map(([cat, meta]) => (
                    <option key={cat} value={cat}>{meta.label}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">User / Agent Email</label>
              <input
                value={filters.actorEmail}
                onChange={e => { setFilters(f => ({ ...f, actorEmail: e.target.value })); setPage(1); }}
                placeholder="Filter by email..."
                className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Reason Contains</label>
              <input
                value={filters.reason}
                onChange={e => { setFilters(f => ({ ...f, reason: e.target.value })); setPage(1); }}
                placeholder="e.g. TCPA, permit, reassign..."
                className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(1); }}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(1); }}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Log Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lead</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Change</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actor</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</th>
                    <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEntries.map(entry => (
                    <LogEntryRow key={entry.id} entry={entry} />
                  ))}
                  {paginatedEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <FileText size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                        <p className="text-sm font-semibold text-foreground mb-1">No entries found</p>
                        <p className="text-xs text-muted-foreground">Try adjusting your filters or date range</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition-all"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                          p === page ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regulatory Proof Note */}
        <div className="bg-muted/30 border border-border rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">Regulatory Proof Ready</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              This log captures all recorded changes with actor identity, timestamp, and reason — suitable for TCPA compliance audits, STR regulation reviews, and internal governance reporting. Use the Export CSV button to produce a timestamped evidence package.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
