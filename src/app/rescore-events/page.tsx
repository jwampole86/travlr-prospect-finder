'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { TrendingUp, User, Clock, ChevronDown, ChevronRight, Search, Filter, Download, RefreshCw, ArrowUp, ArrowDown, Minus, Loader2, SlidersHorizontal } from 'lucide-react';

type ReasonCode = 'refresh_sync' | 'rule_change' | 'manual';

interface RescoreEvent {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_address: string;
  portfolio: string;
  triggered_by: string;
  triggered_by_role: 'admin' | 'agent' | 'system';
  triggered_at: string;
  old_score: number;
  new_score: number;
  delta: number;
  reason_code: ReasonCode;
  reason_detail: string;
  rules_changed?: string[];
  affected_fields?: string[];
}

const REASON_CONFIG: Record<ReasonCode, { label: string; color: string; bg: string; dot: string }> = {
  refresh_sync: { label: 'Refresh Sync', color: 'text-blue-600', bg: 'bg-blue-500/10', dot: 'bg-blue-500' },
  rule_change: { label: 'Rule Change', color: 'text-purple-600', bg: 'bg-purple-500/10', dot: 'bg-purple-500' },
  manual: { label: 'Manual', color: 'text-amber-600', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
};

function generateMockEvents(): RescoreEvent[] {
  const leads = [
    { id: 'lead-001', name: 'James Whitfield', address: '1420 Larimer St, Denver CO', portfolio: 'Colorado' },
    { id: 'lead-002', name: 'Maria Torres', address: '8821 Sunset Blvd, Los Angeles CA', portfolio: 'California' },
    { id: 'lead-003', name: 'Derek Osei', address: '3310 Las Vegas Blvd, Las Vegas NV', portfolio: 'Nevada' },
    { id: 'lead-004', name: 'Sandra Kim', address: '512 Pike St, Seattle WA', portfolio: 'Washington' },
    { id: 'lead-005', name: 'Robert Patel', address: '2200 Main St, Dallas TX', portfolio: 'Texas' },
    { id: 'lead-006', name: 'Cynthia Moore', address: '900 Brickell Ave, Miami FL', portfolio: 'Florida' },
    { id: 'lead-007', name: 'Frank Delgado', address: '450 S Temple, Salt Lake City UT', portfolio: 'Utah' },
    { id: 'lead-008', name: 'Lisa Huang', address: '77 Commercial St, Portland ME', portfolio: 'Maine' },
    { id: 'lead-009', name: 'Tony Nguyen', address: '1600 SW Morrison, Portland OR', portfolio: 'Oregon' },
    { id: 'lead-010', name: 'Brenda Kowalski', address: '200 Boylston St, Boston MA', portfolio: 'Massachusetts' },
  ];
  const agents = ['Sarah Chen', 'Marcus Webb', 'Priya Nair', 'System Auto-Rescore'];
  const reasons: ReasonCode[] = ['refresh_sync', 'rule_change', 'manual', 'refresh_sync', 'manual', 'rule_change'];
  const ruleDetails = [
    'Regulation status updated to Restricted — score adjusted',
    'Enrichment data refreshed: bedrooms, bathrooms, sqft updated',
    'Manual override by admin after property inspection',
    'STR permit data synced from city database',
    'Lead stage advanced to Contacted — engagement bonus applied',
    'Scoring rule weight for "days on market" increased from 0.8 to 1.2',
    'New data source added: Rentometer rental estimate updated',
    'Duplicate merge resolved — primary record rescored',
    'Phone number validated — contact confidence increased',
    'Revenue estimate recalculated with updated ADR data',
  ];

  return Array.from({ length: 32 }, (_, i) => {
    const lead = leads[i % leads.length];
    const reason = reasons[i % reasons.length];
    const oldScore = 40 + Math.floor(Math.random() * 45);
    const delta = (i % 3 === 0 ? -1 : 1) * (3 + Math.floor(Math.random() * 22));
    const newScore = Math.max(0, Math.min(100, oldScore + delta));
    const agentIdx = reason === 'refresh_sync' ? 3 : i % 3;
    const hoursAgo = i * 2.3 + Math.random() * 2;
    return {
      id: `rse-${String(i + 1).padStart(3, '0')}`,
      lead_id: lead.id,
      lead_name: lead.name,
      lead_address: lead.address,
      portfolio: lead.portfolio,
      triggered_by: agents[agentIdx],
      triggered_by_role: agentIdx === 3 ? 'system' : agentIdx === 0 ? 'admin' : 'agent',
      triggered_at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
      old_score: oldScore,
      new_score: newScore,
      delta: newScore - oldScore,
      reason_code: reason,
      reason_detail: ruleDetails[i % ruleDetails.length],
      rules_changed: reason === 'rule_change' ? ['regulation_weight', 'days_on_market_factor'] : undefined,
      affected_fields: ['prospect_score', 'stage'],
    };
  });
}

function ScoreDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus size={11} />0</span>;
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
      <ArrowUp size={11} />+{delta}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500">
      <ArrowDown size={11} />{delta}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-foreground w-6 text-right">{score}</span>
    </div>
  );
}

interface EventRowProps {
  event: RescoreEvent;
}

function EventRow({ event }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rc = REASON_CONFIG[event.reason_code];
  const roleColor = event.triggered_by_role === 'admin' ? 'text-primary' : event.triggered_by_role === 'system' ? 'text-muted-foreground' : 'text-blue-600';

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-foreground">{event.lead_name}</p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{event.lead_address}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className="text-[10px] text-muted-foreground">{event.portfolio}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold uppercase ${
              event.triggered_by_role === 'system' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
            }`}>
              {event.triggered_by_role === 'system' ? 'SYS' : event.triggered_by.charAt(0)}
            </div>
            <div>
              <p className={`text-[11px] font-medium ${roleColor}`}>{event.triggered_by}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{event.triggered_by_role}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <p className="text-[11px] text-foreground/70">
            {new Date(event.triggered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(event.triggered_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </td>
        <td className="px-4 py-3">
          <ScoreBar score={event.old_score} />
        </td>
        <td className="px-4 py-3">
          <ScoreBar score={event.new_score} />
        </td>
        <td className="px-4 py-3">
          <ScoreDelta delta={event.delta} />
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${rc.bg} ${rc.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`} />
            {rc.label}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border">
          <td colSpan={8} className="px-5 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Reason Detail</p>
                <p className="text-[11px] text-foreground/80">{event.reason_detail}</p>
              </div>
              {event.rules_changed && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Rules Changed</p>
                  <div className="flex flex-wrap gap-1">
                    {event.rules_changed.map(r => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 text-[10px] font-mono">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Score Change</p>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Before</p>
                    <p className="text-lg font-bold text-foreground">{event.old_score}</p>
                  </div>
                  <div className="flex-1 h-px bg-border relative">
                    <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold ${event.delta > 0 ? 'text-emerald-600' : event.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {event.delta > 0 ? `+${event.delta}` : event.delta}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">After</p>
                    <p className="text-lg font-bold text-foreground">{event.new_score}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Event ID: <span className="font-mono">{event.id}</span></span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground">Lead ID: <span className="font-mono">{event.lead_id}</span></span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type SortField = 'triggered_at' | 'delta' | 'new_score' | 'old_score';
type SortDir = 'asc' | 'desc';

export default function RescoreEventsPage() {
  const [events, setEvents] = useState<RescoreEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<ReasonCode | 'all'>('all');
  const [portfolioFilter, setPortfolioFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('triggered_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 350));
    setEvents(generateMockEvents());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const portfolios = ['all', 'Colorado', 'California', 'Nevada', 'Washington', 'Texas', 'Florida', 'Utah', 'Maine', 'Oregon', 'Massachusetts'];

  const filtered = events
    .filter(e => {
      if (search && !e.lead_name.toLowerCase().includes(search.toLowerCase()) && !e.triggered_by.toLowerCase().includes(search.toLowerCase())) return false;
      if (reasonFilter !== 'all' && e.reason_code !== reasonFilter) return false;
      if (portfolioFilter !== 'all' && e.portfolio !== portfolioFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let av: number, bv: number;
      if (sortField === 'triggered_at') { av = new Date(a.triggered_at).getTime(); bv = new Date(b.triggered_at).getTime(); }
      else { av = a[sortField]; bv = b[sortField]; }
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  function exportCSV() {
    const headers = ['Event ID', 'Lead Name', 'Lead Address', 'Portfolio', 'Triggered By', 'Role', 'Triggered At', 'Old Score', 'New Score', 'Delta', 'Reason Code', 'Reason Detail'];
    const rows = filtered.map(e => [
      e.id, e.lead_name, e.lead_address, e.portfolio, e.triggered_by, e.triggered_by_role,
      new Date(e.triggered_at).toISOString(), e.old_score, e.new_score, e.delta, e.reason_code, `"${e.reason_detail}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rescore-events-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalEvents = events.length;
  const avgDelta = events.length > 0 ? Math.round(events.reduce((s, e) => s + e.delta, 0) / events.length) : 0;
  const positiveRescores = events.filter(e => e.delta > 0).length;
  const negativeRescores = events.filter(e => e.delta < 0).length;
  const manualCount = events.filter(e => e.reason_code === 'manual').length;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="opacity-30 ml-0.5">↕</span>;
    return <span className="ml-0.5">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Re-Score Events</h1>
              <p className="text-xs text-muted-foreground">Audit log of all lead score changes — who triggered it, when, old vs. new scores, and reason</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Download size={12} />
              Export CSV
            </button>
            <button
              onClick={load}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-card/50 shrink-0 overflow-x-auto">
          {[
            { label: 'Total Events', value: totalEvents, color: 'text-foreground' },
            { label: 'Score Increases', value: positiveRescores, color: 'text-emerald-600' },
            { label: 'Score Decreases', value: negativeRescores, color: 'text-red-500' },
            { label: 'Manual Triggers', value: manualCount, color: 'text-amber-600' },
            { label: 'Avg Delta', value: avgDelta > 0 ? `+${avgDelta}` : String(avgDelta), color: avgDelta >= 0 ? 'text-emerald-600' : 'text-red-500' },
          ].map(kpi => (
            <div key={kpi.label} className="flex flex-col items-center shrink-0">
              <span className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</span>
              <span className="text-[10px] text-muted-foreground">{kpi.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search lead or agent…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Reason:</span>
              {(['all', 'refresh_sync', 'rule_change', 'manual'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setReasonFilter(r)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                    reasonFilter === r ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r === 'all' ? 'All' : REASON_CONFIG[r].label}
                </button>
              ))}
            </div>
            <select
              value={portfolioFilter}
              onChange={e => setPortfolioFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {portfolios.map(p => (
                <option key={p} value={p}>{p === 'all' ? 'All Portfolios' : p}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 ml-auto">
              <SlidersHorizontal size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{filtered.length} events</span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <TrendingUp size={20} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No re-score events match your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Portfolio</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <span className="flex items-center gap-1"><User size={10} />Triggered By</span>
                      </th>
                      <th
                        className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground hidden lg:table-cell"
                        onClick={() => toggleSort('triggered_at')}
                      >
                        <span className="flex items-center gap-1"><Clock size={10} />When<SortIcon field="triggered_at" /></span>
                      </th>
                      <th
                        className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('old_score')}
                      >
                        Old Score<SortIcon field="old_score" />
                      </th>
                      <th
                        className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('new_score')}
                      >
                        New Score<SortIcon field="new_score" />
                      </th>
                      <th
                        className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('delta')}
                      >
                        Delta<SortIcon field="delta" />
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(event => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Compliance Note */}
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border">
            <TrendingUp size={12} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Compliance Note:</strong> This log captures all automated and manual score changes for audit purposes. Export to CSV for external compliance review. Events are sortable by date, delta, and score. Reason codes: <span className="font-mono">refresh_sync</span> (data sync), <span className="font-mono">rule_change</span> (scoring rule update), <span className="font-mono">manual</span> (user-initiated).
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
