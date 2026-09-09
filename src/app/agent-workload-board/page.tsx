'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, UserCheck, RefreshCw, GripVertical, ChevronDown, ChevronUp, AlertCircle, Download, Search, Filter, X, Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkloadLead {
  id: string;
  address: string;
  city: string;
  state: string;
  stage: string;
  prospect_score: number;
  agent_id: string | null;
  created_at: string;
}

interface AgentWorkload {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  leads: WorkloadLead[];
  total: number;
  live: number;
  qualified: number;
  avgScore: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWorkloadColor(total: number): string {
  if (total === 0) return 'text-muted-foreground';
  if (total < 20) return 'text-emerald-600';
  if (total < 50) return 'text-amber-600';
  return 'text-red-600';
}

function getWorkloadBg(total: number): string {
  if (total === 0) return 'bg-muted/30';
  if (total < 20) return 'bg-emerald-500/10';
  if (total < 50) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

// ─── Drag-to-Assign Lead Card ─────────────────────────────────────────────────

function LeadDragCard({
  lead,
  onDragStart,
}: {
  lead: WorkloadLead;
  onDragStart: (lead: WorkloadLead) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead)}
      className="flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 rounded-lg cursor-grab active:cursor-grabbing border border-transparent hover:border-border transition-all group"
    >
      <GripVertical size={12} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate">{lead.address}</p>
        <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state} · {lead.stage}</p>
      </div>
      <span className="text-[10px] font-semibold text-primary shrink-0">{lead.prospect_score}</span>
    </div>
  );
}

// ─── Agent Column ─────────────────────────────────────────────────────────────

function AgentColumn({
  agent,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  expanded,
  onToggle,
}: {
  agent: AgentWorkload;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (agentId: string) => void;
  onDragStart: (lead: WorkloadLead) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isUnassigned = agent.agent_id === 'unassigned';

  return (
    <div
      className={`flex flex-col rounded-xl border-2 transition-all ${
        isDragOver
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : isUnassigned
          ? 'border-dashed border-border bg-muted/20' :'border-border bg-card'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(agent.agent_id)}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-3 cursor-pointer hover:bg-muted/20 rounded-t-xl transition-colors"
        onClick={onToggle}
      >
        {isUnassigned ? (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <AlertCircle size={14} className="text-muted-foreground" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-primary">
              {agent.agent_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{agent.agent_name}</p>
          {!isUnassigned && (
            <p className="text-[10px] text-muted-foreground truncate">{agent.agent_email}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-bold ${getWorkloadColor(agent.total)}`}>{agent.total}</span>
          {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Workload bar */}
      <div className={`grid grid-cols-3 border-t border-border ${getWorkloadBg(agent.total)}`}>
        {[
          { label: 'Qualified', value: agent.qualified, color: 'text-emerald-600' },
          { label: 'Live', value: agent.live, color: 'text-amber-600' },
          { label: 'Avg Score', value: agent.avgScore, color: 'text-primary' },
        ].map((m, i) => (
          <div key={m.label} className={`px-2 py-1.5 text-center ${i > 0 ? 'border-l border-border' : ''}`}>
            <p className={`text-xs font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Drop zone hint */}
      {isDragOver && (
        <div className="mx-2 my-1.5 py-2 border-2 border-dashed border-primary/50 rounded-lg text-center">
          <p className="text-[10px] font-medium text-primary">Drop to assign here</p>
        </div>
      )}

      {/* Lead list */}
      {expanded && (
        <div className="p-2 space-y-1 max-h-64 overflow-y-auto scrollbar-thin border-t border-border">
          {agent.leads.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              {isUnassigned ? 'No unassigned leads' : 'No leads assigned'}
            </p>
          ) : (
            agent.leads.slice(0, 20).map(lead => (
              <LeadDragCard key={lead.id} lead={lead} onDragStart={onDragStart} />
            ))
          )}
          {agent.leads.length > 20 && (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              +{agent.leads.length - 20} more leads
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportWorkloadCSV(agents: AgentWorkload[]) {
  const headers = ['Agent Name', 'Agent Email', 'Lead Address', 'City', 'State', 'Stage', 'Prospect Score', 'Assigned At'];
  const rows: string[][] = [];

  for (const agent of agents) {
    if (agent.leads.length === 0) {
      rows.push([agent.agent_name, agent.agent_email, '', '', '', '', '', '']);
    } else {
      for (const lead of agent.leads) {
        rows.push([
          agent.agent_name,
          agent.agent_email,
          lead.address,
          lead.city,
          lead.state,
          lead.stage,
          String(lead.prospect_score),
          lead.created_at,
        ]);
      }
    }
  }

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-workload-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Workload exported to CSV');
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentWorkloadBoardPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<AgentWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragLead, setDragLead] = useState<WorkloadLead | null>(null);
  const [dragOverAgent, setDragOverAgent] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(['unassigned']));
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(false);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load agents
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .order('full_name');

      // Load leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, address, city, state, stage, prospect_score, agent_id, created_at')
        .eq('is_synthetic', false)
        .order('prospect_score', { ascending: false })
        .limit(1000);

      const profileList = profiles || [];
      const leadList = (leads || []) as WorkloadLead[];

      // Build workload map
      const workloadMap: Record<string, AgentWorkload> = {
        unassigned: {
          agent_id: 'unassigned',
          agent_name: 'Unassigned Queue',
          agent_email: '',
          leads: [],
          total: 0,
          live: 0,
          qualified: 0,
          avgScore: 0,
        },
      };

      for (const p of profileList) {
        workloadMap[p.id] = {
          agent_id: p.id,
          agent_name: p.full_name || p.email || 'Unknown',
          agent_email: p.email || '',
          leads: [],
          total: 0,
          live: 0,
          qualified: 0,
          avgScore: 0,
        };
      }

      for (const lead of leadList) {
        const key = lead.agent_id && workloadMap[lead.agent_id] ? lead.agent_id : 'unassigned';
        workloadMap[key].leads.push(lead);
      }

      // Compute metrics
      for (const w of Object.values(workloadMap)) {
        w.total = w.leads.length;
        w.live = w.leads.filter(l => l.stage === 'Live').length;
        w.qualified = w.leads.filter(l => ['Interested', 'Proposal Sent', 'Under Contract', 'Live'].includes(l.stage)).length;
        w.avgScore = w.total > 0 ? Math.round(w.leads.reduce((s, l) => s + l.prospect_score, 0) / w.total) : 0;
      }

      // Sort: unassigned first, then by total desc
      const sorted = Object.values(workloadMap).sort((a, b) => {
        if (a.agent_id === 'unassigned') return -1;
        if (b.agent_id === 'unassigned') return 1;
        return b.total - a.total;
      });

      setAgents(sorted);
    } catch (e) {
      console.error('[WorkloadBoard] load error:', e);
      toast.error('Failed to load workload data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDrop(targetAgentId: string) {
    if (!dragLead || assigning) return;
    const newAgentId = targetAgentId === 'unassigned' ? null : targetAgentId;

    // Optimistic update
    setAgents(prev => {
      const next = prev.map(a => ({ ...a, leads: [...a.leads] }));
      // Remove from current
      for (const a of next) {
        const idx = a.leads.findIndex(l => l.id === dragLead.id);
        if (idx !== -1) { a.leads.splice(idx, 1); break; }
      }
      // Add to target
      const target = next.find(a => a.agent_id === targetAgentId);
      if (target) target.leads.unshift({ ...dragLead, agent_id: newAgentId });
      // Recompute metrics
      for (const a of next) {
        a.total = a.leads.length;
        a.live = a.leads.filter(l => l.stage === 'Live').length;
        a.qualified = a.leads.filter(l => ['Interested', 'Proposal Sent', 'Under Contract', 'Live'].includes(l.stage)).length;
        a.avgScore = a.total > 0 ? Math.round(a.leads.reduce((s, l) => s + l.prospect_score, 0) / a.total) : 0;
      }
      return next;
    });

    setDragLead(null);
    setDragOverAgent(null);
    setAssigning(true);

    try {
      const { error } = await supabase
        .from('leads')
        .update({ agent_id: newAgentId })
        .eq('id', dragLead.id);

      if (error) throw error;

      const targetAgent = agents.find(a => a.agent_id === targetAgentId);
      toast.success(
        newAgentId
          ? `Lead assigned to ${targetAgent?.agent_name}`
          : 'Lead moved to unassigned queue'
      );
    } catch {
      toast.error('Failed to reassign lead');
      loadData(); // revert
    } finally {
      setAssigning(false);
    }
  }

  const filteredAgents = search
    ? agents.map(a => ({
        ...a,
        leads: a.leads.filter(l =>
          l.address.toLowerCase().includes(search.toLowerCase()) ||
          l.city.toLowerCase().includes(search.toLowerCase())
        ),
      }))
    : agents;

  const totalLeads = agents.reduce((s, a) => s + a.total, 0);
  const unassignedCount = agents.find(a => a.agent_id === 'unassigned')?.total ?? 0;
  const assignedCount = totalLeads - unassignedCount;
  const agentCount = agents.filter(a => a.agent_id !== 'unassigned').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-base font-bold text-foreground">Agent Workload Board</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Drag leads between agents to reassign. Unassigned queue on the left.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportWorkloadCSV(agents)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted/50 text-muted-foreground border border-border rounded-lg hover:border-primary/30 hover:text-foreground transition-colors"
            >
              <Download size={12} />Export CSV
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted/50 text-muted-foreground border border-border rounded-lg hover:border-primary/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Refresh
            </button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 py-3 border-b border-border bg-muted/10 shrink-0">
          {[
            { label: 'Total Leads', value: totalLeads, icon: <Target size={14} className="text-primary" />, color: 'text-foreground' },
            { label: 'Assigned', value: assignedCount, icon: <UserCheck size={14} className="text-emerald-600" />, color: 'text-emerald-600' },
            { label: 'Unassigned', value: unassignedCount, icon: <AlertCircle size={14} className="text-amber-600" />, color: unassignedCount > 0 ? 'text-amber-600' : 'text-foreground' },
            { label: 'Active Agents', value: agentCount, icon: <Users size={14} className="text-blue-600" />, color: 'text-blue-600' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card rounded-xl border border-border px-3 py-2.5 flex items-center gap-2.5">
              <div className="p-1.5 bg-muted/50 rounded-lg">{kpi.icon}</div>
              <div>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-border bg-muted/5 shrink-0">
          <div className="relative max-w-sm">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter leads by address or city..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X size={11} className="text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading workload data…</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredAgents.map(agent => (
                  <AgentColumn
                    key={agent.agent_id}
                    agent={agent}
                    isDragOver={dragOverAgent === agent.agent_id}
                    onDragOver={e => { e.preventDefault(); setDragOverAgent(agent.agent_id); }}
                    onDragLeave={() => setDragOverAgent(null)}
                    onDrop={handleDrop}
                    onDragStart={setDragLead}
                    expanded={expandedAgents.has(agent.agent_id)}
                    onToggle={() => setExpandedAgents(prev => {
                      const next = new Set(prev);
                      if (next.has(agent.agent_id)) next.delete(agent.agent_id);
                      else next.add(agent.agent_id);
                      return next;
                    })}
                  />
                ))}
              </div>

              {assigning && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg text-xs font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  Reassigning lead…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
