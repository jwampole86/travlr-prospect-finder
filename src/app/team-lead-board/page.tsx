'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, UserCheck, ArrowRightLeft, Activity, TrendingUp, RefreshCw, ChevronDown, ChevronUp, BarChart2, Zap, Mail, CheckCircle, Clock, Star, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentLead {
  id: string;
  address: string;
  city: string;
  stage: string;
  prospect_score: number;
  source: string;
  agent_id: string | null;
  agent_name?: string;
  created_at: string;
  updated_at: string;
}

interface AgentGroup {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  leads: AgentLead[];
  metrics: {
    total: number;
    contacted: number;
    qualified: number;
    live: number;
    avgScore: number;
    enrichmentRate: number;
  };
}

interface ActivityEvent {
  id: string;
  user_id: string;
  lead_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  agent_name: string;
  created_at: string;
  lead_address?: string;
}

interface HandoffRecord {
  id: string;
  lead_id: string;
  from_agent_name: string;
  to_agent_name: string;
  reason: string;
  created_at: string;
  lead_address?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, React.ReactNode> = {
  enrichment_completed: <Zap size={12} className="text-blue-500" />,
  questionnaire_qualified: <CheckCircle size={12} className="text-success" />,
  outreach_sent: <Mail size={12} className="text-primary" />,
  lead_assigned: <UserCheck size={12} className="text-amber-500" />,
  lead_reassigned: <ArrowRightLeft size={12} className="text-purple-500" />,
  stage_changed: <TrendingUp size={12} className="text-orange-500" />,
};

const EVENT_LABELS: Record<string, string> = {
  enrichment_completed: 'Enrichment completed',
  questionnaire_qualified: 'Questionnaire qualified',
  outreach_sent: 'Outreach sent',
  lead_assigned: 'Lead assigned',
  lead_reassigned: 'Lead reassigned',
  stage_changed: 'Stage changed',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

function ReassignModal({
  lead,
  agents,
  onClose,
  onReassigned,
}: {
  lead: AgentLead;
  agents: { id: string; name: string }[];
  onClose: () => void;
  onReassigned: () => void;
}) {
  const { user } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleReassign() {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const toAgent = agents.find((a) => a.id === selectedAgent);
      const fromAgent = agents.find((a) => a.id === lead.agent_id);

      // Update lead agent_id
      await supabase.from('leads').update({ agent_id: selectedAgent }).eq('id', lead.id);

      // Record handoff history
      await supabase.from('lead_handoff_history').insert({
        lead_id: lead.id,
        from_agent_id: lead.agent_id,
        to_agent_id: selectedAgent,
        from_agent_name: fromAgent?.name || 'Unassigned',
        to_agent_name: toAgent?.name || '',
        reason: reason.trim() || null,
        reassigned_by: user?.id,
      });

      // Log team activity
      await supabase.from('team_activity_log').insert({
        user_id: user?.id,
        lead_id: lead.id,
        event_type: 'lead_reassigned',
        event_data: { from: fromAgent?.name || 'Unassigned', to: toAgent?.name, reason },
        agent_name: toAgent?.name || '',
      });

      toast.success(`Lead reassigned to ${toAgent?.name}`);
      onReassigned();
      onClose();
    } catch {
      toast.error('Failed to reassign lead');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Reassign Lead</h3>
        <p className="text-xs text-muted-foreground mb-4 truncate">{lead.address}</p>

        <label className="block text-xs font-medium text-foreground mb-1">Assign to Agent</label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-3"
        >
          <option value="">Select agent…</option>
          {agents.filter((a) => a.id !== lead.agent_id).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-foreground mb-1">Reason (optional)</label>
        <input
          type="text"
          placeholder="e.g. Territory change, agent unavailable"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={!selectedAgent || loading}
            className="flex-1 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  group,
  allAgents,
  onReassign,
}: {
  group: AgentGroup;
  allAgents: { id: string; name: string }[];
  onReassign: (lead: AgentLead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { metrics } = group;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Agent header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {group.agent_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{group.agent_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{group.agent_email}</p>
        </div>
        {/* Metrics pills */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 text-[10px] font-medium bg-muted rounded-full text-foreground">{metrics.total} leads</span>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-success/10 text-success rounded-full">{metrics.live} live</span>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">Avg {metrics.avgScore}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-4 gap-0 border-t border-border">
        {[
          { label: 'Total', value: metrics.total, color: 'text-foreground' },
          { label: 'Contacted', value: metrics.contacted, color: 'text-blue-500' },
          { label: 'Qualified', value: metrics.qualified, color: 'text-success' },
          { label: 'Live', value: metrics.live, color: 'text-amber-500' },
        ].map((m, i) => (
          <div key={m.label} className={`px-3 py-2 text-center ${i > 0 ? 'border-l border-border' : ''}`}>
            <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Lead list */}
      {expanded && (
        <div className="border-t border-border">
          {group.leads.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No leads assigned</p>
          ) : (
            <div className="divide-y divide-border max-h-64 overflow-y-auto scrollbar-thin">
              {group.leads.map((lead) => (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{lead.address}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{lead.city}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{lead.stage}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-medium text-primary">{lead.prospect_score}</span>
                    <button
                      onClick={() => onReassign(lead)}
                      className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="Reassign lead"
                    >
                      <ArrowRightLeft size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamLeadBoardPage() {
  const { user } = useAuth();
  const [agentGroups, setAgentGroups] = useState<AgentGroup[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [handoffHistory, setHandoffHistory] = useState<HandoffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'board' | 'activity' | 'handoffs' | 'metrics'>('board');
  const [reassignLead, setReassignLead] = useState<AgentLead | null>(null);
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Load user profiles (agents)
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .order('full_name');

      const agentProfiles = profiles || [];
      setAllAgents(agentProfiles.map((p) => ({ id: p.id, name: p.full_name || p.email || 'Unknown' })));

      // Load leads with agent assignments
      const { data: leads } = await supabase
        .from('leads')
        .select('id, address, city, stage, prospect_score, source, agent_id, created_at, updated_at')
        .order('prospect_score', { ascending: false })
        .limit(500);

      // Group leads by agent
      const groups: Record<string, AgentGroup> = {};

      // Add unassigned group
      groups['unassigned'] = {
        agent_id: 'unassigned',
        agent_name: 'Unassigned',
        agent_email: '—',
        leads: [],
        metrics: { total: 0, contacted: 0, qualified: 0, live: 0, avgScore: 0, enrichmentRate: 0 },
      };

      // Add agent groups
      for (const profile of agentProfiles) {
        groups[profile.id] = {
          agent_id: profile.id,
          agent_name: profile.full_name || profile.email || 'Unknown',
          agent_email: profile.email || '',
          leads: [],
          metrics: { total: 0, contacted: 0, qualified: 0, live: 0, avgScore: 0, enrichmentRate: 0 },
        };
      }

      // Distribute leads
      for (const lead of (leads || [])) {
        const key = lead.agent_id && groups[lead.agent_id] ? lead.agent_id : 'unassigned';
        groups[key].leads.push(lead as AgentLead);
      }

      // Compute metrics
      for (const group of Object.values(groups)) {
        const ls = group.leads;
        group.metrics.total = ls.length;
        group.metrics.contacted = ls.filter((l) => ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live'].includes(l.stage)).length;
        group.metrics.qualified = ls.filter((l) => ['Interested', 'Proposal Sent', 'Under Contract', 'Live'].includes(l.stage)).length;
        group.metrics.live = ls.filter((l) => l.stage === 'Live').length;
        group.metrics.avgScore = ls.length > 0 ? Math.round(ls.reduce((s, l) => s + l.prospect_score, 0) / ls.length) : 0;
      }

      // Sort: agents with most leads first, unassigned last
      const sorted = Object.values(groups).sort((a, b) => {
        if (a.agent_id === 'unassigned') return 1;
        if (b.agent_id === 'unassigned') return -1;
        return b.metrics.total - a.metrics.total;
      });

      setAgentGroups(sorted);

      // Load activity feed
      const { data: activity } = await supabase
        .from('team_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      setActivityFeed((activity || []) as ActivityEvent[]);

      // Load handoff history
      const { data: handoffs } = await supabase
        .from('lead_handoff_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      setHandoffHistory((handoffs || []) as HandoffRecord[]);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch {
      toast.error('Failed to load team board data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription for activity feed
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('team-activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_activity_log' }, (payload) => {
        setActivityFeed((prev) => [payload.new as ActivityEvent, ...prev.slice(0, 49)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, () => {
        // Reload on lead updates (reassignments, stage changes)
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Per-agent metrics for chart
  const metricsChartData = agentGroups
    .filter((g) => g.agent_id !== 'unassigned' && g.metrics.total > 0)
    .map((g) => ({
      name: g.agent_name.split(' ')[0],
      total: g.metrics.total,
      live: g.metrics.live,
      qualified: g.metrics.qualified,
      avgScore: g.metrics.avgScore,
    }));

  const totalLeads = agentGroups.reduce((s, g) => s + g.metrics.total, 0);
  const totalLive = agentGroups.reduce((s, g) => s + g.metrics.live, 0);
  const assignedLeads = agentGroups.filter((g) => g.agent_id !== 'unassigned').reduce((s, g) => s + g.metrics.total, 0);

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Team Lead Board</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All assigned leads by agent, real-time handoffs, and team activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastRefreshed && <span className="text-[11px] text-muted-foreground">Updated {lastRefreshed}</span>}
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all min-h-[44px] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Leads', value: totalLeads, icon: <Users size={16} className="text-primary" />, color: 'bg-primary/5' },
            { label: 'Assigned', value: assignedLeads, icon: <UserCheck size={16} className="text-success" />, color: 'bg-success/5' },
            { label: 'Live', value: totalLive, icon: <Star size={16} className="text-amber-500" />, color: 'bg-amber-500/5' },
            { label: 'Agents', value: agentGroups.filter((g) => g.agent_id !== 'unassigned').length, icon: <Target size={16} className="text-purple-500" />, color: 'bg-purple-500/5' },
          ].map((kpi) => (
            <div key={kpi.label} className={`${kpi.color} border border-border rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-card rounded-lg border border-border">{kpi.icon}</div>
              <div>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'board', label: 'Lead Board', icon: <Users size={13} /> },
            { key: 'activity', label: 'Activity Feed', icon: <Activity size={13} /> },
            { key: 'handoffs', label: 'Handoffs', icon: <ArrowRightLeft size={13} /> },
            { key: 'metrics', label: 'Agent Metrics', icon: <BarChart2 size={13} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all -mb-px ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading team board…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Board tab */}
            {activeTab === 'board' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {agentGroups.map((group) => (
                  <AgentCard
                    key={group.agent_id}
                    group={group}
                    allAgents={allAgents}
                    onReassign={setReassignLead}
                  />
                ))}
                {agentGroups.length === 0 && (
                  <div className="col-span-2 text-center py-16 text-muted-foreground">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No agents or leads found.</p>
                  </div>
                )}
              </div>
            )}

            {/* Activity Feed tab */}
            {activeTab === 'activity' && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Team Activity Feed</p>
                  <span className="text-[10px] text-muted-foreground">Live updates</span>
                </div>
                {activityFeed.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No activity yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[500px] overflow-y-auto scrollbar-thin">
                    {activityFeed.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="mt-0.5 p-1.5 bg-muted rounded-full shrink-0">
                          {EVENT_ICONS[event.event_type] || <Activity size={12} className="text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">
                            <span className="font-medium">{event.agent_name || 'System'}</span>
                            {' — '}
                            {EVENT_LABELS[event.event_type] || event.event_type}
                          </p>
                          {event.event_data && Object.keys(event.event_data).length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {Object.entries(event.event_data).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock size={9} />
                          {timeAgo(event.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Handoffs tab */}
            {activeTab === 'handoffs' && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Lead Handoff History</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Reassignment trail for all leads</p>
                </div>
                {handoffHistory.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ArrowRightLeft size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No handoffs recorded yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[500px] overflow-y-auto scrollbar-thin">
                    {handoffHistory.map((h) => (
                      <div key={h.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <ArrowRightLeft size={14} className="text-purple-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">
                            <span className="font-medium">{h.from_agent_name || 'Unassigned'}</span>
                            <span className="text-muted-foreground mx-1.5">→</span>
                            <span className="font-medium">{h.to_agent_name}</span>
                          </p>
                          {h.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{h.reason}</p>}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(h.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metrics tab */}
            {activeTab === 'metrics' && (
              <div className="space-y-4">
                {/* Chart */}
                {metricsChartData.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-sm font-semibold text-foreground mb-4">Per-Agent Lead Distribution</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={metricsChartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }} />
                        <Bar dataKey="total" name="Total" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="qualified" name="Qualified" fill="#34d399" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="live" name="Live" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Agent metrics table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Agent Performance Summary</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Agent</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Total</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Contacted</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Qualified</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Live</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Avg Score</th>
                          <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Conv. Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {agentGroups.filter((g) => g.agent_id !== 'unassigned').map((g) => {
                          const convRate = g.metrics.total > 0 ? ((g.metrics.live / g.metrics.total) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={g.agent_id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-primary">
                                      {g.agent_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                    </span>
                                  </div>
                                  <span className="font-medium text-foreground">{g.agent_name}</span>
                                </div>
                              </td>
                              <td className="text-right px-3 py-2.5 font-mono text-foreground">{g.metrics.total}</td>
                              <td className="text-right px-3 py-2.5 font-mono text-blue-500">{g.metrics.contacted}</td>
                              <td className="text-right px-3 py-2.5 font-mono text-success">{g.metrics.qualified}</td>
                              <td className="text-right px-3 py-2.5 font-mono text-amber-500">{g.metrics.live}</td>
                              <td className="text-right px-3 py-2.5 font-mono text-primary">{g.metrics.avgScore}</td>
                              <td className="text-right px-3 py-2.5">
                                <span className={`font-medium ${parseFloat(convRate) >= 20 ? 'text-success' : parseFloat(convRate) >= 10 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                  {convRate}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {agentGroups.filter((g) => g.agent_id !== 'unassigned').length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-muted-foreground">
                              No agent data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reassign modal */}
      {reassignLead && (
        <ReassignModal
          lead={reassignLead}
          agents={allAgents}
          onClose={() => setReassignLead(null)}
          onReassigned={loadData}
        />
      )}
    </AppLayout>
  );
}
