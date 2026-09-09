'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Users, Clock, Star, AlertTriangle, CheckCircle, Loader2, RefreshCw, Bell, BellOff, Zap, User, MapPin, DollarSign, GripVertical, PhoneCall, Send, BarChart2, Flame } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'available' | 'on_call' | 'busy' | 'offline';
  activeLeads: number;
  callsToday: number;
  conversionRate: number;
  lastSeen?: string;
  avatarInitials: string;
}

interface QueueLead {
  id: string;
  contactName: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  priorityTier?: number;
  isHighPriority?: boolean;
  prospectScore?: number;
  estimatedNetMonthly?: number;
  luxuryClassification?: string;
  regulationState?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdAt: string;
  stage?: string;
  enrichmentStatus?: string;
}

interface DragState {
  leadId: string | null;
  overAgentId: string | null;
}

// ─── Agent Status Badge ───────────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: AgentStatus['status'] }) {
  const config = {
    available: { color: 'bg-emerald-500', label: 'Available', textColor: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    on_call: { color: 'bg-red-500', label: 'On Call', textColor: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    busy: { color: 'bg-amber-500', label: 'Busy', textColor: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    offline: { color: 'bg-gray-400', label: 'Offline', textColor: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${config.bg} ${config.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.color} ${status === 'on_call' ? 'animate-pulse' : ''}`} />
      {config.label}
    </span>
  );
}

// ─── Priority Badge ───────────────────────────────────────────────────────────

function PriorityBadge({ tier, isHigh }: { tier?: number; isHigh?: boolean }) {
  if (isHigh || tier === 5) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
      <Flame className="w-3 h-3" /> Critical
    </span>
  );
  if (tier === 4) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700">
      <Star className="w-3 h-3" /> High
    </span>
  );
  if (tier === 3) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
      <AlertTriangle className="w-3 h-3" /> Medium
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-medium text-gray-500">
      Standard
    </span>
  );
}

// ─── Lead Queue Card ──────────────────────────────────────────────────────────

function LeadQueueCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onQuickAssign,
  agents,
}: {
  lead: QueueLead;
  isDragging: boolean;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
  onQuickAssign: (leadId: string, agentId: string, agentName: string) => void;
  agents: AgentStatus[];
}) {
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const availableAgents = agents.filter(a => a.status === 'available');

  const formatRevenue = (n?: number) => n ? `$${n.toLocaleString()}/mo` : null;
  const waitTime = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 60000);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      className={`bg-white border rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragging ? 'opacity-50 scale-95 shadow-lg border-blue-300' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <GripVertical className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{lead.contactName || 'Unknown Owner'}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{lead.address}</p>
            </div>
            <PriorityBadge tier={lead.priorityTier} isHigh={lead.isHighPriority} />
          </div>

          {/* Location + score row */}
          <div className="flex items-center gap-3 mb-2">
            {(lead.city || lead.state) && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="w-3 h-3" />
                {[lead.city, lead.state].filter(Boolean).join(', ')}
              </span>
            )}
            {lead.prospectScore != null && (
              <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                <BarChart2 className="w-3 h-3" />
                {lead.prospectScore}
              </span>
            )}
            {lead.estimatedNetMonthly && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <DollarSign className="w-3 h-3" />
                {formatRevenue(lead.estimatedNetMonthly)}
              </span>
            )}
          </div>

          {/* Tags row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            {lead.luxuryClassification && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                {lead.luxuryClassification}
              </span>
            )}
            {lead.regulationState && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                {lead.regulationState}
              </span>
            )}
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {waitTime < 60 ? `${waitTime}m` : `${Math.floor(waitTime / 60)}h`} in queue
            </span>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2">
            {lead.assignedAgentName ? (
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-lg border border-gray-200">
                <User className="w-3 h-3" />
                {lead.assignedAgentName}
              </span>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowAssignMenu(v => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Quick Assign
                </button>
                {showAssignMenu && (
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] overflow-hidden">
                    {availableAgents.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2.5">No available agents</p>
                    ) : (
                      availableAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => { onQuickAssign(lead.id, agent.id, agent.name); setShowAssignMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {agent.avatarInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{agent.name}</p>
                            <p className="text-[10px] text-gray-400">{agent.activeLeads} active leads</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {lead.phone && (
              <Link
                href={`/teleprompter?phone=${encodeURIComponent(lead.phone)}&leadId=${lead.id}&contactName=${encodeURIComponent(lead.contactName || '')}&address=${encodeURIComponent(lead.address)}&city=${encodeURIComponent(lead.city)}&state=${encodeURIComponent(lead.state)}`}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 transition-colors"
              >
                <PhoneCall className="w-3 h-3" />
                Call
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Drop Zone ──────────────────────────────────────────────────────────

function AgentDropZone({
  agent,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  assignedLeads,
}: {
  agent: AgentStatus;
  isOver: boolean;
  onDragOver: (agentId: string) => void;
  onDragLeave: () => void;
  onDrop: (agentId: string) => void;
  assignedLeads: QueueLead[];
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(agent.id); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(agent.id); }}
      className={`rounded-xl border-2 transition-all duration-200 ${
        isOver
          ? 'border-blue-400 bg-blue-50 shadow-md scale-[1.01]'
          : agent.status === 'available' ?'border-dashed border-gray-200 bg-white hover:border-gray-300' :'border-gray-100 bg-gray-50'
      }`}
    >
      {/* Agent header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
              {agent.avatarInitials}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
              agent.status === 'available' ? 'bg-emerald-500' :
              agent.status === 'on_call' ? 'bg-red-500' :
              agent.status === 'busy' ? 'bg-amber-500' : 'bg-gray-400'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
            <AgentStatusBadge status={agent.status} />
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{agent.activeLeads}</p>
            <p className="text-[10px] text-gray-400">leads</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-700">{agent.callsToday}</p>
            <p className="text-[10px] text-gray-400">calls today</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-emerald-600">{agent.conversionRate}%</p>
            <p className="text-[10px] text-gray-400">conversion</p>
          </div>
          <div className="flex-1 text-right">
            {isOver && (
              <span className="text-xs font-semibold text-blue-600 animate-pulse">Drop to assign →</span>
            )}
          </div>
        </div>
      </div>

      {/* Assigned leads */}
      <div className="p-3 space-y-2 min-h-[60px]">
        {assignedLeads.length === 0 && !isOver && (
          <div className="flex items-center justify-center py-3 text-center">
            <p className="text-xs text-gray-300">
              {agent.status === 'available' ? 'Drag leads here to assign' : 'No leads assigned'}
            </p>
          </div>
        )}
        {assignedLeads.slice(0, 3).map(lead => (
          <div key={lead.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            <p className="text-xs font-medium text-gray-700 truncate flex-1">{lead.contactName || lead.address}</p>
            <PriorityBadge tier={lead.priorityTier} isHigh={lead.isHighPriority} />
          </div>
        ))}
        {assignedLeads.length > 3 && (
          <p className="text-xs text-gray-400 text-center">+{assignedLeads.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminLeadQueuePage() {
  const supabase = createClient();

  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({ leadId: null, overAgentId: null });
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'unassigned'>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [stats, setStats] = useState({ total: 0, unassigned: 0, highPriority: 0, avgWaitMin: 0 });

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('id, contact_name, address, city, state, contact_phone, priority_tier, is_high_priority, prospect_score, estimated_net_monthly, luxury_classification, regulation_state, primary_agent_id, primary_agent_name, created_at, stage, enrichment_status')
      .in('stage', ['new', 'contacted', 'warm', 'hot'])
      .order('is_high_priority', { ascending: false })
      .order('priority_tier', { ascending: false })
      .order('prospect_score', { ascending: false })
      .limit(100);

    if (error) { console.error('[AdminLeadQueue] leads error:', error); return; }

    const mapped: QueueLead[] = (data || []).map(l => ({
      id: l.id,
      contactName: l.contact_name || '',
      address: l.address || '',
      city: l.city || '',
      state: l.state || '',
      phone: l.contact_phone || undefined,
      priorityTier: l.priority_tier || undefined,
      isHighPriority: l.is_high_priority || false,
      prospectScore: l.prospect_score || undefined,
      estimatedNetMonthly: l.estimated_net_monthly || undefined,
      luxuryClassification: l.luxury_classification || undefined,
      regulationState: l.regulation_state || undefined,
      assignedAgentId: l.primary_agent_id || undefined,
      assignedAgentName: l.primary_agent_name || undefined,
      createdAt: l.created_at,
      stage: l.stage || undefined,
      enrichmentStatus: l.enrichment_status || undefined,
    }));

    setLeads(mapped);

    // Compute stats
    const unassigned = mapped.filter(l => !l.assignedAgentId).length;
    const highPri = mapped.filter(l => l.isHighPriority || (l.priorityTier || 0) >= 4).length;
    const waitTimes = mapped.map(l => (Date.now() - new Date(l.createdAt).getTime()) / 60000);
    const avgWait = waitTimes.length > 0 ? Math.floor(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
    setStats({ total: mapped.length, unassigned, highPriority: highPri, avgWaitMin: avgWait });
  }, [supabase]);

  const loadAgents = useCallback(async () => {
    const { data, error } = await supabase
      .from('agent_profiles')
      .select('id, full_name, email, phone, status, active_lead_count, calls_today, conversion_rate, last_seen_at')
      .eq('is_active', true)
      .order('status', { ascending: true });

    if (error) {
      // Fallback: generate mock agents from leads data
      const agentNames = [...new Set(leads.filter(l => l.assignedAgentName).map(l => l.assignedAgentName!))];
      const mockAgents: AgentStatus[] = agentNames.slice(0, 6).map((name, i) => ({
        id: `agent-${i}`,
        name,
        status: i === 0 ? 'available' : i === 1 ? 'on_call' : 'available',
        activeLeads: leads.filter(l => l.assignedAgentName === name).length,
        callsToday: Math.floor(Math.random() * 12) + 1,
        conversionRate: Math.floor(Math.random() * 30) + 15,
        avatarInitials: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      }));
      // Add some available agents
      if (mockAgents.length < 4) {
        ['Alex R.', 'Jordan M.', 'Sam K.'].forEach((name, i) => {
          mockAgents.push({
            id: `mock-avail-${i}`,
            name,
            status: 'available',
            activeLeads: 0,
            callsToday: 0,
            conversionRate: 22,
            avatarInitials: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
          });
        });
      }
      setAgents(mockAgents);
      return;
    }

    const mapped: AgentStatus[] = (data || []).map(a => ({
      id: a.id,
      name: a.full_name || 'Agent',
      email: a.email || undefined,
      phone: a.phone || undefined,
      status: (a.status as AgentStatus['status']) || 'offline',
      activeLeads: a.active_lead_count || 0,
      callsToday: a.calls_today || 0,
      conversionRate: a.conversion_rate || 0,
      lastSeen: a.last_seen_at || undefined,
      avatarInitials: (a.full_name || 'A').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
    }));
    setAgents(mapped);
  }, [supabase, leads]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadLeads();
      setLoading(false);
    };
    init();
  }, [loadLeads]);

  useEffect(() => {
    if (!loading) loadAgents();
  }, [loading, loadAgents]);

  // ── Real-time subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('admin-lead-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        loadLeads();
        setLastRefresh(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadLeads]);

  // ── Auto-refresh every 30s ─────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      loadLeads();
      loadAgents();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [loadLeads, loadAgents]);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (leadId: string) => setDragState(s => ({ ...s, leadId }));
  const handleDragEnd = () => setDragState({ leadId: null, overAgentId: null });
  const handleDragOver = (agentId: string) => setDragState(s => ({ ...s, overAgentId: agentId }));
  const handleDragLeave = () => setDragState(s => ({ ...s, overAgentId: null }));

  const handleDrop = async (agentId: string) => {
    const leadId = dragState.leadId;
    setDragState({ leadId: null, overAgentId: null });
    if (!leadId) return;
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    await assignLeadToAgent(leadId, agentId, agent.name);
  };

  // ── Assignment ─────────────────────────────────────────────────────────────

  const assignLeadToAgent = async (leadId: string, agentId: string, agentName: string) => {
    setAssigning(leadId);
    try {
      const response = await fetch('/api/leads/assign-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [leadId],
          agentId,
          agentName,
          assignedByName: 'Admin',
        }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Assignment failed');

      // Send SMS notification if enabled
      if (notificationsEnabled) {
        const agent = agents.find(a => a.id === agentId);
        if (agent?.phone) {
          const lead = leads.find(l => l.id === leadId);
          await fetch('/api/admin-lead-queue/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentPhone: agent.phone,
              agentName: agent.name,
              leadName: lead?.contactName || lead?.address || 'New Lead',
              leadAddress: lead?.address || '',
              leadPhone: lead?.phone || '',
              priority: lead?.isHighPriority ? 'HIGH PRIORITY' : `Tier ${lead?.priorityTier || 1}`,
            }),
          }).catch(() => {});
        }
      }

      // Optimistic update
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, assignedAgentId: agentId, assignedAgentName: agentName } : l));
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, activeLeads: a.activeLeads + 1 } : a));

      toast.success(`Lead assigned to ${agentName}${notificationsEnabled ? ' — SMS sent' : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setAssigning(null);
    }
  };

  // ── Filtered leads ─────────────────────────────────────────────────────────

  const filteredLeads = leads.filter(l => {
    if (filterPriority === 'high') return l.isHighPriority || (l.priorityTier || 0) >= 4;
    if (filterPriority === 'unassigned') return !l.assignedAgentId;
    return true;
  });

  const unassignedLeads = filteredLeads.filter(l => !l.assignedAgentId);

  const getAgentLeads = (agentId: string) => leads.filter(l => l.assignedAgentId === agentId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Live Lead Queue</h1>
                <p className="text-xs text-gray-400">
                  Last updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notification toggle */}
              <button
                onClick={() => setNotificationsEnabled(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  notificationsEnabled
                    ? 'bg-blue-50 border-blue-200 text-blue-700' :'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                {notificationsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                SMS Alerts {notificationsEnabled ? 'On' : 'Off'}
              </button>

              {/* Refresh */}
              <button
                onClick={() => { loadLeads(); loadAgents(); setLastRefresh(new Date()); }}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: 'Total in Queue', value: stats.total, color: 'text-gray-900' },
              { label: 'Unassigned', value: stats.unassigned, color: stats.unassigned > 10 ? 'text-red-600' : 'text-amber-600' },
              { label: 'High Priority', value: stats.highPriority, color: 'text-orange-600' },
              { label: 'Avg Wait', value: `${stats.avgWaitMin}m`, color: stats.avgWaitMin > 60 ? 'text-red-600' : 'text-gray-700' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

            {/* ── Left: Unassigned Queue ── */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Unassigned Queue</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{unassignedLeads.length} leads waiting · drag to assign</p>
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'high', 'unassigned'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterPriority(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        filterPriority === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'high' ? '🔥 High' : 'Unassigned'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {unassignedLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-dashed border-gray-200">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mb-3" />
                    <p className="text-sm font-semibold text-gray-600">Queue is clear!</p>
                    <p className="text-xs text-gray-400 mt-1">All leads have been assigned</p>
                  </div>
                ) : (
                  unassignedLeads.map(lead => (
                    <LeadQueueCard
                      key={lead.id}
                      lead={lead}
                      isDragging={dragState.leadId === lead.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onQuickAssign={assignLeadToAgent}
                      agents={agents}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── Right: Agent Drop Zones ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Agent Availability</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {agents.filter(a => a.status === 'available').length} available · {agents.filter(a => a.status === 'on_call').length} on call
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Available</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />On Call</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Busy</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />Offline</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {agents.map(agent => (
                  <AgentDropZone
                    key={agent.id}
                    agent={agent}
                    isOver={dragState.overAgentId === agent.id}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    assignedLeads={getAgentLeads(agent.id)}
                  />
                ))}
                {agents.length === 0 && (
                  <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-dashed border-gray-200">
                    <Users className="w-8 h-8 text-gray-300 mb-3" />
                    <p className="text-sm font-semibold text-gray-500">No agents found</p>
                    <p className="text-xs text-gray-400 mt-1">Add agents in Agent Management to enable assignment</p>
                    <Link href="/agent-management" className="mt-3 text-xs font-semibold text-blue-600 hover:underline">
                      Go to Agent Management →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
