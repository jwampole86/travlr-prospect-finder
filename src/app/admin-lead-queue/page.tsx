'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Radio, RefreshCw, UserCheck, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import BackButton from '@/components/ui/BackButton';
import { createClient } from '@/lib/supabase/client';
import { AgentAssignmentsPanel } from './components/AgentAssignmentsPanel';
import { QueuePanel } from './components/QueuePanel';
import type { AgentSummary, QueueFilter, QueueLead, QueueStats } from './components/types';
import {
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';

const ACTIVE_QUEUE_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract'];
const VISIBLE_QUEUE_LIMIT = 200;

function formatOldest(createdAt: string | null) {
  if (!createdAt) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function AdminLeadQueuePage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    total: 0,
    unassigned: 0,
    highPriority: 0,
    assignableAgents: 0,
    oldestLeadCreatedAt: null,
  });
  const [filter, setFilter] = useState<QueueFilter>('unassigned');
  const [search, setSearch] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [assigningLeadId, setAssigningLeadId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState('CONNECTING');

  const loadStats = useCallback(async () => {
    const [totalRes, unassignedRes, highPriorityRes, oldestRes] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).in('stage', ACTIVE_QUEUE_STAGES),
      supabase.from('leads').select('id', { count: 'exact', head: true }).in('stage', ACTIVE_QUEUE_STAGES).is('primary_agent_id', null),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('stage', ACTIVE_QUEUE_STAGES)
        .or('is_high_priority.eq.true,priority_tier.gte.4'),
      supabase
        .from('leads')
        .select('created_at')
        .in('stage', ACTIVE_QUEUE_STAGES)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (totalRes.error) throw totalRes.error;
    if (unassignedRes.error) throw unassignedRes.error;
    if (highPriorityRes.error) throw highPriorityRes.error;
    if (oldestRes.error) throw oldestRes.error;

    setStats((current) => ({
      ...current,
      total: totalRes.count || 0,
      unassigned: unassignedRes.count || 0,
      highPriority: highPriorityRes.count || 0,
      oldestLeadCreatedAt: oldestRes.data?.created_at || null,
    }));
  }, [supabase]);

  const loadLeads = useCallback(async () => {
    const { data, error: leadsError } = await supabase
      .from('leads')
      .select('id, contact_name, owner_name, address, city, state, contact_phone, priority_tier, is_high_priority, prospect_score, estimated_net_monthly, luxury, regulation_status, primary_agent_id, primary_agent_name, created_at, stage, enrichment_status')
      .in('stage', ACTIVE_QUEUE_STAGES)
      .order('is_high_priority', { ascending: false })
      .order('priority_tier', { ascending: false })
      .order('prospect_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(VISIBLE_QUEUE_LIMIT);

    if (leadsError) throw leadsError;

    setLeads(
      (data || []).map((lead) => ({
        id: String(lead.id),
        contactName: lead.contact_name || lead.owner_name || '',
        address: lead.address || '',
        city: lead.city || '',
        state: lead.state || '',
        phone: lead.contact_phone,
        priorityTier: Number(lead.priority_tier || 0),
        isHighPriority: Boolean(lead.is_high_priority),
        prospectScore: lead.prospect_score,
        estimatedNetMonthly: lead.estimated_net_monthly,
        luxury: lead.luxury,
        regulationStatus: lead.regulation_status,
        assignedAgentId: lead.primary_agent_id,
        assignedAgentName: lead.primary_agent_name,
        createdAt: lead.created_at,
        stage: lead.stage || 'New Lead',
        enrichmentStatus: lead.enrichment_status,
      })),
    );
  }, [supabase]);

  const loadAgents = useCallback(async () => {
    const [profilesRes, portfolioRes] = await Promise.all([
      supabase
        .from('agent_profiles')
        .select('id, owner_user_id, full_name, email, phone, status, avatar_initials, last_active_at')
        .order('full_name'),
      supabase.from('agent_portfolio_assignments').select('agent_user_id, portfolio_key'),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (portfolioRes.error) throw portfolioRes.error;

    const portfolioMap = new Map<string, string[]>();
    for (const row of portfolioRes.data || []) {
      const current = portfolioMap.get(String(row.agent_user_id)) || [];
      current.push(String(row.portfolio_key));
      portfolioMap.set(String(row.agent_user_id), current);
    }

    const profiles = (profilesRes.data || []).filter((profile) => (profile.status || '').toLowerCase() !== 'inactive');
    const counts = await Promise.all(
      profiles.map(async (profile) => {
        const userId = profile.owner_user_id || profile.id;
        const { count, error: countError } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('primary_agent_id', userId);
        if (countError) throw countError;
        return [userId, count || 0] as const;
      }),
    );

    const countMap = new Map<string, number>(counts);
    const mappedAgents: AgentSummary[] = profiles.map((profile) => {
      const userId = profile.owner_user_id || profile.id;
      return {
        profileId: profile.id,
        userId,
        name: profile.full_name || 'Unnamed agent',
        email: profile.email,
        phone: profile.phone,
        status: profile.status || 'unknown',
        avatarInitials: profile.avatar_initials || (profile.full_name || 'A').split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
        lastActiveAt: profile.last_active_at,
        assignedLeadCount: countMap.get(userId) || 0,
        portfolioKeys: portfolioMap.get(userId) || [],
      };
    });

    setAgents(mappedAgents);
    setStats((current) => ({
      ...current,
      assignableAgents: mappedAgents.filter((agent) => agent.status.toLowerCase() === 'active').length,
    }));
  }, [supabase]);

  const refreshAll = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }
    setError(null);
    try {
      await Promise.all([loadStats(), loadLeads(), loadAgents()]);
      setLastRefresh(new Date().toISOString());
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Failed to load the live lead queue.';
      setError(message);
    } finally {
      setLoading(false);
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, [loadAgents, loadLeads, loadStats]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-lead-queue-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        void refreshAll(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_profiles' }, () => {
        void loadAgents();
      })
      .subscribe((status) => {
        setSubscriptionStatus(status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAgents, refreshAll, supabase]);

  const visibleUnassignedLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return leads
      .filter((lead) => !lead.assignedAgentId)
      .filter((lead) => {
        if (filter === 'high') {
          return lead.isHighPriority || lead.priorityTier >= 4;
        }
        return true;
      })
      .filter((lead) => {
        if (!normalizedSearch) return true;
        return [lead.contactName, lead.address, lead.city, lead.state]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      });
  }, [filter, leads, search]);

  const visibleCounts = useMemo<Record<QueueFilter, number>>(() => ({
    all: leads.filter((lead) => !lead.assignedAgentId).length,
    high: leads.filter((lead) => !lead.assignedAgentId && (lead.isHighPriority || lead.priorityTier >= 4)).length,
    unassigned: leads.filter((lead) => !lead.assignedAgentId).length,
  }), [leads]);

  const assignedLeadsByAgent = useMemo(() => {
    return leads.reduce<Record<string, QueueLead[]>>((accumulator, lead) => {
      if (!lead.assignedAgentId) return accumulator;
      const current = accumulator[lead.assignedAgentId] || [];
      current.push(lead);
      accumulator[lead.assignedAgentId] = current;
      return accumulator;
    }, {});
  }, [leads]);

  const handleAssign = useCallback(async (leadId: string, agent: AgentSummary) => {
    setAssigningLeadId(leadId);
    try {
      const response = await fetch('/api/leads/assign-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: [leadId],
          agentId: agent.profileId,
          agentName: agent.name,
          agentEmail: agent.email,
          assignedByName: 'Admin',
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Lead assignment failed.');
      }

      if (notificationsEnabled && agent.phone) {
        const lead = leads.find((entry) => entry.id === leadId);
        const notifyResponse = await fetch('/api/admin-lead-queue/notify', {
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
        });

        const notifyPayload = await notifyResponse.json().catch(() => ({ success: false }));
        if (!notifyResponse.ok || !notifyPayload.success) {
          toast.warning(`Assignment saved for ${agent.name}, but SMS notification was not sent.`);
        }
      }

      await refreshAll(true);
      toast.success(`Assigned lead to ${agent.name}.`);
    } catch (assignmentError) {
      toast.error(assignmentError instanceof Error ? assignmentError.message : 'Assignment failed.');
    } finally {
      setAssigningLeadId(null);
      setDraggingLeadId(null);
      setHoveredAgentId(null);
    }
  }, [leads, notificationsEnabled, refreshAll]);

  const handleDrop = useCallback(async (agentUserId: string) => {
    if (!draggingLeadId) return;
    const agent = agents.find((entry) => entry.userId === agentUserId);
    if (!agent) return;
    await handleAssign(draggingLeadId, agent);
  }, [agents, draggingLeadId, handleAssign]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col gap-6 overflow-y-auto bg-background p-6">
        <div className="flex items-center gap-3">
          <BackButton variant="icon" />
          <StatusPill tone={subscriptionStatus === 'SUBSCRIBED' ? 'success' : 'warning'} icon={Radio}>
            {subscriptionStatus === 'SUBSCRIBED' ? 'Live updates on' : 'Connecting live updates'}
          </StatusPill>
          {lastRefresh ? <span className="text-xs text-muted-foreground">Last refreshed {new Date(lastRefresh).toLocaleTimeString()}</span> : null}
        </div>

        <PageHeader
          icon={Zap}
          title="Live Lead Queue"
          description="Real queue data from leads, exact count queries for queue metrics, and persistent assignment actions backed by the canonical primary_agent fields."
          actions={(
            <>
              <button
                type="button"
                onClick={() => setNotificationsEnabled((current) => !current)}
                className={buttonSecondary}
              >
                {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                SMS alerts {notificationsEnabled ? 'on' : 'off'}
              </button>
              <button
                type="button"
                onClick={() => void refreshAll()}
                className={buttonPrimary}
                disabled={refreshing}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                Refresh queue
              </button>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void refreshAll()} /> : null}

        {loading ? (
          <LoadingState label="Loading live queue data…" />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Queue leads', value: stats.total, hint: 'Exact count across active stages', icon: Users },
                { label: 'Unassigned', value: stats.unassigned, hint: 'Exact count with no primary agent', icon: UserCheck, tone: stats.unassigned > 0 ? 'warning' : 'success' },
                { label: 'High priority', value: stats.highPriority, hint: 'Exact count of tier 4+ or flagged leads', icon: Zap, tone: stats.highPriority > 0 ? 'danger' : 'default' },
                { label: 'Oldest wait', value: formatOldest(stats.oldestLeadCreatedAt), hint: 'Oldest active queue lead age', icon: RefreshCw },
              ]}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <QueuePanel
                leads={visibleUnassignedLeads}
                agents={agents}
                filter={filter}
                search={search}
                assigningLeadId={assigningLeadId}
                draggingLeadId={draggingLeadId}
                onFilterChange={setFilter}
                onSearchChange={setSearch}
                onDragStart={setDraggingLeadId}
                onDragEnd={() => {
                  setDraggingLeadId(null);
                  setHoveredAgentId(null);
                }}
                onAssign={handleAssign}
                counts={visibleCounts}
              />

              <AgentAssignmentsPanel
                agents={agents}
                assignedLeadsByAgent={assignedLeadsByAgent}
                hoveredAgentId={hoveredAgentId}
                onDragOver={setHoveredAgentId}
                onDragLeave={() => setHoveredAgentId(null)}
                onDrop={(agentUserId) => {
                  void handleDrop(agentUserId);
                }}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
