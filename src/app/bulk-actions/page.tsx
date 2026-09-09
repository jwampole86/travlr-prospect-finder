'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { useAuth } from '@/contexts/AuthContext';
import { Users, Tag, ToggleLeft, ToggleRight, MessageSquare, Mail, Phone, Search, Filter, CheckSquare, Square, Activity, X, Loader2, Info, Send, FileText, Undo2, History, Download } from 'lucide-react';

import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStage = 'new' | 'contacted' | 'interested' | 'proposal_sent' | 'negotiating' | 'signed' | 'lost' | 'nurturing';
type TouchType = 'call' | 'sms' | 'email' | 'note';
type OptInField = 'sms_opt_in' | 'email_opt_in';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  state: string;
  stage: LeadStage;
  prospect_score: number;
  assigned_agent?: string;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  source: string;
  last_contacted_at?: string;
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  action: string;
  affected: number;
  leads: string[];
  undone: boolean;
  payload: Record<string, unknown>;
}

interface Agent {
  id: string;
  full_name: string;
  email: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: LeadStage[] = ['new', 'contacted', 'interested', 'proposal_sent', 'negotiating', 'signed', 'lost', 'nurturing'];

const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested',
  proposal_sent: 'Proposal Sent', negotiating: 'Negotiating',
  signed: 'Signed', lost: 'Lost', nurturing: 'Nurturing',
};

const STAGE_COLORS: Record<LeadStage, string> = {
  new: 'bg-blue-500/15 text-blue-500',
  contacted: 'bg-cyan-500/15 text-cyan-500',
  interested: 'bg-violet-500/15 text-violet-500',
  proposal_sent: 'bg-amber-500/15 text-amber-600',
  negotiating: 'bg-orange-500/15 text-orange-500',
  signed: 'bg-emerald-500/15 text-emerald-600',
  lost: 'bg-red-500/15 text-red-500',
  nurturing: 'bg-purple-500/15 text-purple-500',
};

const MOCK_LEADS: Lead[] = [
  { id: 'l1', first_name: 'Sarah', last_name: 'Mitchell', address: '142 Aspen Ridge Dr', city: 'Aspen', state: 'CO', stage: 'new', prospect_score: 91, assigned_agent: 'James Carter', sms_opt_in: true, email_opt_in: true, source: 'Zillow', last_contacted_at: '2026-08-15T10:00:00Z' },
  { id: 'l2', first_name: 'David', last_name: 'Nguyen', address: '87 Sunset Blvd', city: 'Nashville', state: 'TN', stage: 'contacted', prospect_score: 62, assigned_agent: 'Maria Lopez', sms_opt_in: false, email_opt_in: true, source: 'Apartments.com', last_contacted_at: '2026-08-14T14:00:00Z' },
  { id: 'l3', first_name: 'Priya', last_name: 'Sharma', address: '310 Lakefront Ave', city: 'Austin', state: 'TX', stage: 'interested', prospect_score: 44, sms_opt_in: true, email_opt_in: false, source: 'Craigslist' },
  { id: 'l4', first_name: 'Tom', last_name: 'Bradley', address: '55 Ocean View Rd', city: 'Santa Monica', state: 'CA', stage: 'nurturing', prospect_score: 20, assigned_agent: 'James Carter', sms_opt_in: false, email_opt_in: false, source: 'Zillow', last_contacted_at: '2026-08-10T09:00:00Z' },
  { id: 'l5', first_name: 'Elena', last_name: 'Vasquez', address: '901 Maple St', city: 'Denver', state: 'CO', stage: 'proposal_sent', prospect_score: 78, assigned_agent: 'Maria Lopez', sms_opt_in: true, email_opt_in: true, source: 'Zillow' },
  { id: 'l6', first_name: 'Marcus', last_name: 'Johnson', address: '22 River Walk', city: 'Chicago', state: 'IL', stage: 'new', prospect_score: 55, sms_opt_in: true, email_opt_in: true, source: 'Apartments.com' },
  { id: 'l7', first_name: 'Aisha', last_name: 'Patel', address: '77 Hillcrest Ln', city: 'Phoenix', state: 'AZ', stage: 'lost', prospect_score: 30, assigned_agent: 'James Carter', sms_opt_in: false, email_opt_in: true, source: 'Craigslist' },
  { id: 'l8', first_name: 'Ryan', last_name: 'Chen', address: '415 Harbor Blvd', city: 'Seattle', state: 'WA', stage: 'negotiating', prospect_score: 85, assigned_agent: 'Maria Lopez', sms_opt_in: true, email_opt_in: true, source: 'Zillow' },
];

const MOCK_AGENTS: Agent[] = [
  { id: 'a1', full_name: 'James Carter', email: 'james@travlrpro.com' },
  { id: 'a2', full_name: 'Maria Lopez', email: 'maria@travlrpro.com' },
  { id: 'a3', full_name: 'Kevin Park', email: 'kevin@travlrpro.com' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulkActionsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [agents] = useState<Agent[]>(MOCK_AGENTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');
  const [activeAction, setActiveAction] = useState<'reassign' | 'stage' | 'opt_in' | 'log_touch' | null>(null);
  const [targetAgent, setTargetAgent] = useState('');
  const [targetStage, setTargetStage] = useState<LeadStage>('contacted');
  const [optInField, setOptInField] = useState<OptInField>('sms_opt_in');
  const [optInValue, setOptInValue] = useState(true);
  const [touchType, setTouchType] = useState<TouchType>('call');
  const [touchNote, setTouchNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  const filtered = leads.filter(l => {
    const matchSearch = !search || `${l.first_name} ${l.last_name} ${l.address} ${l.city}`.toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter === 'all' || l.stage === stageFilter;
    return matchSearch && matchStage;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(l => selected.has(l.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(l => next.delete(l.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(l => next.add(l.id)); return next; });
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function applyAction() {
    if (selected.size === 0 || !activeAction) return;
    setApplying(true);
    const selectedLeads = leads.filter(l => selected.has(l.id));
    const names = selectedLeads.map(l => `${l.first_name} ${l.last_name}`);

    setTimeout(() => {
      let actionLabel = '';
      let updatedLeads = [...leads];

      if (activeAction === 'reassign' && targetAgent) {
        const agent = agents.find(a => a.id === targetAgent);
        actionLabel = `Reassigned to ${agent?.full_name ?? targetAgent}`;
        updatedLeads = leads.map(l => selected.has(l.id) ? { ...l, assigned_agent: agent?.full_name } : l);
      } else if (activeAction === 'stage') {
        actionLabel = `Stage changed to ${STAGE_LABELS[targetStage]}`;
        updatedLeads = leads.map(l => selected.has(l.id) ? { ...l, stage: targetStage } : l);
      } else if (activeAction === 'opt_in') {
        actionLabel = `${optInField === 'sms_opt_in' ? 'SMS' : 'Email'} opt-in set to ${optInValue ? 'ON' : 'OFF'}`;
        updatedLeads = leads.map(l => selected.has(l.id) ? { ...l, [optInField]: optInValue } : l);
      } else if (activeAction === 'log_touch') {
        actionLabel = `Logged ${touchType} touch${touchNote ? `: "${touchNote}"` : ''}`;
      }

      setLeads(updatedLeads);
      const entry: ActivityEntry = {
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: actionLabel,
        affected: selected.size,
        leads: names,
        undone: false,
        payload: { action: activeAction, targetAgent, targetStage, optInField, optInValue, touchType, touchNote },
      };
      setActivityLog(prev => [entry, ...prev]);
      setApplying(false);
      setSelected(new Set());
      setActiveAction(null);
      setTouchNote('');
    }, 800);
  }

  function handleUndo(id: string) {
    setActivityLog(prev => prev.map(e => e.id === id ? { ...e, undone: true } : e));
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['First Name', 'Last Name', 'Address', 'City', 'State', 'Stage', 'Prospect Score', 'SMS Opt-In', 'Email Opt-In', 'Assigned Agent', 'Source', 'Last Contacted'];
    const rows = leads.map(l => [
      l.first_name, l.last_name, l.address, l.city, l.state,
      STAGE_LABELS[l.stage], l.prospect_score,
      l.sms_opt_in ? 'YES' : 'NO',
      l.email_opt_in ? 'YES' : 'NO',
      l.assigned_agent || '', l.source,
      l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────
  function exportPDF() {
    const exportedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    const rows = leads.map(l => `
      <tr>
        <td>${l.first_name} ${l.last_name}</td>
        <td>${l.address}, ${l.city}, ${l.state}</td>
        <td>${STAGE_LABELS[l.stage]}</td>
        <td>${l.prospect_score}/100</td>
        <td>${l.sms_opt_in ? 'YES' : 'NO'}</td>
        <td>${l.email_opt_in ? 'YES' : 'NO'}</td>
        <td>${l.assigned_agent || '—'}</td>
        <td>${l.source}</td>
        <td>${l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleDateString() : '—'}</td>
      </tr>`).join('');

    const activityRows = activityLog.map(e => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${e.action}</td>
        <td>${e.affected} leads</td>
        <td>${e.undone ? 'Undone' : 'Applied'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bulk Leads Export</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;margin:20px 0 8px}
    .meta{color:#666;font-size:10px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
    th{background:#f5f5f5;font-weight:bold}tr:nth-child(even){background:#fafafa}
    </style></head><body>
    <h1>Bulk Leads Export</h1>
    <div class="meta">Exported: ${exportedAt} · ${leads.length} leads</div>
    <h2>Lead List</h2>
    <table><thead><tr><th>Name</th><th>Address</th><th>Stage</th><th>Score</th><th>SMS Opt-In</th><th>Email Opt-In</th><th>Agent</th><th>Source</th><th>Last Contact</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${activityLog.length > 0 ? `<h2>Activity Log</h2>
    <table><thead><tr><th>Timestamp</th><th>Action</th><th>Affected</th><th>Status</th></tr></thead>
    <tbody>${activityRows}</tbody></table>` : ''}
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }

  const actionPanelOpen = activeAction !== null && selected.size > 0;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={17} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Bulk Actions</h1>
              <p className="text-xs text-muted-foreground">Reassign, stage, opt-in, and log touches across filtered lead subsets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <FileText size={12} /> Export PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── Left: Lead Selection + Actions ── */}
              <div className="lg:col-span-2 space-y-4">
                {/* Search + Filter */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-48">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search leads…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Filter size={12} className="text-muted-foreground" />
                    <select
                      value={stageFilter}
                      onChange={e => setStageFilter(e.target.value as LeadStage | 'all')}
                      className="text-xs bg-background border border-border rounded-lg px-2.5 py-2 focus:outline-none"
                    >
                      <option value="all">All Stages</option>
                      {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                    <span>{filtered.length} leads</span>
                    {selected.size > 0 && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                        {selected.size} selected
                      </span>
                    )}
                    {selected.size > 0 && (
                      <button onClick={() => setSelected(new Set())} className="text-danger hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {selected.size > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <span className="text-xs font-medium text-primary self-center mr-1">Actions for {selected.size} lead{selected.size > 1 ? 's' : ''}:</span>
                    {([
                      ['reassign', Users, 'Reassign Agent'],
                      ['stage', Tag, 'Change Stage'],
                      ['opt_in', ToggleRight, 'Toggle Opt-In'],
                      ['log_touch', Activity, 'Log Touch'],
                    ] as [typeof activeAction, React.ElementType, string][]).map(([action, Icon, label]) => (
                      <button
                        key={action}
                        onClick={() => setActiveAction(activeAction === action ? null : action)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${activeAction === action ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Action Panel */}
                {activeAction && selected.size > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {activeAction === 'reassign' ? 'Reassign Agent' :
                         activeAction === 'stage' ? 'Change Stage' :
                         activeAction === 'opt_in' ? 'Toggle Opt-In' : 'Log Touch'}
                      </h3>
                      <button onClick={() => setActiveAction(null)} className="p-1 rounded hover:bg-muted transition-colors">
                        <X size={14} className="text-muted-foreground" />
                      </button>
                    </div>

                    {activeAction === 'reassign' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Select Agent</label>
                        <select
                          value={targetAgent}
                          onChange={e => setTargetAgent(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">Choose agent…</option>
                          {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </select>
                      </div>
                    )}

                    {activeAction === 'stage' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">New Stage</label>
                        <select
                          value={targetStage}
                          onChange={e => setTargetStage(e.target.value as LeadStage)}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </select>
                      </div>
                    )}

                    {activeAction === 'opt_in' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Channel</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setOptInField('sms_opt_in')}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-all ${optInField === 'sms_opt_in' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              <MessageSquare size={12} /> SMS
                            </button>
                            <button
                              onClick={() => setOptInField('email_opt_in')}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-all ${optInField === 'email_opt_in' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              <Mail size={12} /> Email
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Action</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setOptInValue(true)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-all ${optInValue ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600' : 'border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              <ToggleRight size={12} /> Opt-In
                            </button>
                            <button
                              onClick={() => setOptInValue(false)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-all ${!optInValue ? 'border-red-500 bg-red-500/5 text-red-600' : 'border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              <ToggleLeft size={12} /> Opt-Out
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeAction === 'log_touch' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Touch Type</label>
                          <div className="flex gap-2">
                            {([['call', Phone, 'Call'], ['sms', MessageSquare, 'SMS'], ['email', Mail, 'Email'], ['note', FileText, 'Note']] as [TouchType, React.ElementType, string][]).map(([type, Icon, label]) => (
                              <button
                                key={type}
                                onClick={() => setTouchType(type)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-all ${touchType === type ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-muted'}`}
                              >
                                <Icon size={12} /> {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Note (optional)</label>
                          <input
                            value={touchNote}
                            onChange={e => setTouchNote(e.target.value)}
                            placeholder="e.g. Left voicemail, will follow up tomorrow"
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Info size={11} />
                        Action will be logged and can be undone
                      </p>
                      <button
                        onClick={applyAction}
                        disabled={applying}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                      >
                        {applying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        {applying ? 'Applying…' : `Apply to ${selected.size} Lead${selected.size > 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lead Table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                    <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                      {allFilteredSelected ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                    </button>
                    <span className="text-xs font-medium text-muted-foreground">Lead</span>
                    <span className="text-xs font-medium text-muted-foreground ml-auto">Stage</span>
                    <span className="text-xs font-medium text-muted-foreground w-20 text-center">SMS</span>
                    <span className="text-xs font-medium text-muted-foreground w-20 text-center">Email</span>
                    <span className="text-xs font-medium text-muted-foreground w-24">Agent</span>
                    <span className="text-xs font-medium text-muted-foreground w-20">Last Touch</span>
                  </div>
                  <div className="divide-y divide-border">
                    {filtered.map(lead => {
                      const isSelected = selected.has(lead.id);
                      return (
                        <div
                          key={lead.id}
                          onClick={() => toggleOne(lead.id)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-muted/30'}`}
                        >
                          <div className="text-muted-foreground">
                            {isSelected ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{lead.first_name} {lead.last_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{lead.address}, {lead.city}, {lead.state}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{lead.source}</span>
                              <span className="text-[10px] font-semibold text-primary">{lead.prospect_score}/100</span>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STAGE_COLORS[lead.stage]}`}>
                            {STAGE_LABELS[lead.stage]}
                          </span>
                          <div className="w-20 flex justify-center">
                            {lead.sms_opt_in ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
                          </div>
                          <div className="w-20 flex justify-center">
                            {lead.email_opt_in ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
                          </div>
                          <div className="w-24">
                            <p className="text-[11px] text-foreground truncate">{lead.assigned_agent ?? '—'}</p>
                          </div>
                          <div className="w-20">
                            <p className="text-[11px] text-muted-foreground">
                              {lead.last_contacted_at ? timeAgo(lead.last_contacted_at) : '—'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {filtered.length === 0 && (
                      <div className="text-center py-10 text-muted-foreground text-sm">No leads match your filters</div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right: Activity Log ── */}
              <div className="space-y-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <History size={14} className="text-primary" />
                    Activity Log
                    {activityLog.length > 0 && (
                      <span className="ml-auto text-[11px] text-muted-foreground">{activityLog.length} action{activityLog.length > 1 ? 's' : ''}</span>
                    )}
                  </h3>
                  {activityLog.length === 0 ? (
                    <div className="text-center py-8">
                      <Activity size={24} className="text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No actions yet</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Select leads and apply bulk actions to see them logged here</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {activityLog.map(entry => (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-xl border transition-all ${entry.undone ? 'border-border opacity-50 bg-muted/20' : 'border-border hover:border-primary/30'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium ${entry.undone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {entry.action}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {entry.affected} lead{entry.affected > 1 ? 's' : ''} · {timeAgo(entry.timestamp)}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {entry.leads.slice(0, 3).map((name, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{name}</span>
                                ))}
                                {entry.leads.length > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">+{entry.leads.length - 3} more</span>
                                )}
                              </div>
                            </div>
                            {!entry.undone && (
                              <button
                                onClick={() => handleUndo(entry.id)}
                                className="shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                              >
                                <Undo2 size={11} />
                                Undo
                              </button>
                            )}
                            {entry.undone && (
                              <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground">Undone</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Selection Summary</h3>
                  {selected.size === 0 ? (
                    <p className="text-sm text-muted-foreground">No leads selected</p>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const sel = leads.filter(l => selected.has(l.id));
                        const smsOn = sel.filter(l => l.sms_opt_in).length;
                        const emailOn = sel.filter(l => l.email_opt_in).length;
                        const assigned = sel.filter(l => l.assigned_agent).length;
                        const avgScore = Math.round(sel.reduce((s, l) => s + l.prospect_score, 0) / sel.length);
                        return [
                          { label: 'Selected', value: `${selected.size} leads` },
                          { label: 'SMS Opted-In', value: `${smsOn} / ${selected.size}` },
                          { label: 'Email Opted-In', value: `${emailOn} / ${selected.size}` },
                          { label: 'Assigned', value: `${assigned} / ${selected.size}` },
                          { label: 'Avg Score', value: `${avgScore}/100` },
                        ].map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                            <span className="text-xs font-semibold text-foreground">{item.value}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
