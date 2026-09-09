'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import InviteAgentModal from '@/components/InviteAgentModal';
import { Users, Mail, CheckCircle2, Loader2, UserCheck, Ban, Power, PowerOff, Search, X, RefreshCw, ArrowRight, Copy, CheckCheck, UserPlus, Send } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  user_id: string;
  full_name: string;
  email: string;
  app_role: string;
  is_active: boolean;
  agent_onboarding_completed_at: string | null;
  agent_onboarding_started_at: string | null;
  created_at: string;
  deactivated_at: string | null;
  invite_status: string | null;
  invite_id: string | null;
  invite_expires_at: string | null;
  assigned_leads: number;
  priority_leads: number;
  follow_ups_due: number;
}

interface PendingInvite {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  expires_at: string;
  invite_token: string;
}

// ─── Onboarding Status Badge ──────────────────────────────────────────────────

function OnboardingBadge({ agent }: { agent: AgentRow }) {
  if (!agent.is_active) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 rounded-full">INACTIVE</span>;
  }
  if (agent.agent_onboarding_completed_at) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 rounded-full">READY</span>;
  }
  if (agent.agent_onboarding_started_at) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 rounded-full">ONBOARDING</span>;
  }
  if (agent.user_id) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/15 text-blue-400 rounded-full">ACCOUNT CREATED</span>;
  }
  return <span className="px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground rounded-full">INVITED</span>;
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

function ReassignModal({
  agent, agents, onClose, onDone
}: {
  agent: AgentRow;
  agents: AgentRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const eligibleAgents = agents.filter(a => a.user_id !== agent.user_id && a.is_active);

  async function handleReassign() {
    if (!targetId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_reassign_agent_leads', {
        p_from_agent_id: agent.user_id,
        p_to_agent_id: targetId,
      });
      if (error) throw error;
      toast.success(`${agent.assigned_leads} leads reassigned successfully`);
      onDone();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Reassignment failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">Reassign Leads</h3>
        <p className="text-sm text-muted-foreground">
          Reassign all {agent.assigned_leads} leads from <strong>{agent.full_name}</strong> to another agent.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Assign to</label>
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select agent…</option>
            {eligibleAgents.map(a => (
              <option key={a.user_id} value={a.user_id}>{a.full_name} ({a.assigned_leads} leads)</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={handleReassign}
            disabled={!targetId || saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Reassign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentManagementPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [reassignAgent, setReassignAgent] = useState<AgentRow | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch active agents
      const { data: agentData } = await supabase.rpc('admin_get_agent_list');
      if (agentData) setAgents(agentData as AgentRow[]);

      // Fetch pending invites
      const { data: inviteData } = await supabase
        .from('agent_invites')
        .select('id, email, first_name, last_name, status, created_at, expires_at, invite_token')
        .in('status', ['invited'])
        .order('created_at', { ascending: false });
      if (inviteData) setPendingInvites(inviteData as PendingInvite[]);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDeactivate(agent: AgentRow) {
    setActionLoading(agent.user_id);
    try {
      const { error } = await supabase.rpc('admin_deactivate_agent', { p_agent_user_id: agent.user_id });
      if (error) throw error;
      toast.success(`${agent.full_name} deactivated`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReactivate(agent: AgentRow) {
    setActionLoading(agent.user_id);
    try {
      const { error } = await supabase.rpc('admin_reactivate_agent', { p_agent_user_id: agent.user_id });
      if (error) throw error;
      toast.success(`${agent.full_name} reactivated`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeInvite(inviteId: string, email: string) {
    setActionLoading(inviteId);
    try {
      const res = await fetch('/api/agent-invite/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      if (!res.ok) throw new Error('Failed to revoke');
      toast.success(`Invite for ${email} revoked`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResendInvite(inviteId: string, email: string) {
    setActionLoading(inviteId);
    try {
      const res = await fetch('/api/agent-invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      if (!res.ok) throw new Error('Failed to resend');
      toast.success(`Invite resent to ${email}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setActionLoading(null);
    }
  }

  async function copyInviteLink(token: string) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
    await navigator.clipboard.writeText(`${siteUrl}/invite/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  }

  const filteredAgents = agents.filter(a =>
    !search ||
    a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  const activeAgents = filteredAgents.filter(a => a.is_active);
  const inactiveAgents = filteredAgents.filter(a => !a.is_active);

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Invite, manage, and monitor your outreach agents</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData()}
              className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              <UserPlus size={14} />
              Invite Agent
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Agents', value: agents.length, icon: Users },
            { label: 'Active', value: agents.filter(a => a.is_active).length, icon: CheckCircle2 },
            { label: 'Pending Invites', value: pendingInvites.length, icon: Mail },
            { label: 'Ready to Work', value: agents.filter(a => a.is_active && a.agent_onboarding_completed_at).length, icon: UserCheck },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-4 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents by name or email…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-amber-500/5">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Pending Invitations ({pendingInvites.length})</h2>
              </div>
            </div>
            <div className="divide-y divide-border/50">
              {pendingInvites.map(invite => {
                const isExpired = new Date(invite.expires_at) < new Date();
                return (
                  <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Mail size={14} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{invite.first_name} {invite.last_name}</p>
                      <p className="text-xs text-muted-foreground">{invite.email}</p>
                      <p className={`text-[11px] mt-0.5 ${isExpired ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {isExpired ? 'Expired' : `Expires ${new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => copyInviteLink(invite.invite_token)}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy invite link"
                      >
                        {copiedToken === invite.invite_token ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                      <button
                        onClick={() => handleResendInvite(invite.id, invite.email)}
                        disabled={actionLoading === invite.id}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary transition-colors"
                        title="Resend invite"
                      >
                        {actionLoading === invite.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id, invite.email)}
                        disabled={actionLoading === invite.id}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-colors"
                        title="Revoke invite"
                      >
                        <Ban size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Agents */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Active Agents ({activeAgents.length})</h2>
            </div>
            {activeAgents.length === 0 ? (
              <div className="py-12 text-center">
                <Users size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active agents yet. Invite your first agent above.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {activeAgents.map(agent => (
                  <div key={agent.user_id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      {agent.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{agent.full_name}</p>
                        <OnboardingBadge agent={agent} />
                      </div>
                      <p className="text-xs text-muted-foreground">{agent.email}</p>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">{agent.assigned_leads}</p>
                        <p className="text-[10px] text-muted-foreground">Leads</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-amber-500">{agent.priority_leads}</p>
                        <p className="text-[10px] text-muted-foreground">Priority</p>
                      </div>
                      {agent.follow_ups_due > 0 && (
                        <div className="text-center">
                          <p className="text-sm font-bold text-orange-500">{agent.follow_ups_due}</p>
                          <p className="text-[10px] text-muted-foreground">Due</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {agent.assigned_leads > 0 && (
                        <button
                          onClick={() => setReassignAgent(agent)}
                          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary transition-colors"
                          title="Reassign leads"
                        >
                          <ArrowRight size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeactivate(agent)}
                        disabled={actionLoading === agent.user_id}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-colors"
                        title="Deactivate agent"
                      >
                        {actionLoading === agent.user_id ? <Loader2 size={13} className="animate-spin" /> : <PowerOff size={13} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inactive Agents */}
        {inactiveAgents.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold text-muted-foreground">Inactive Agents ({inactiveAgents.length})</h2>
            </div>
            <div className="divide-y divide-border/50">
              {inactiveAgents.map(agent => (
                <div key={agent.user_id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                    {agent.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{agent.full_name}</p>
                    <p className="text-xs text-muted-foreground">{agent.email}</p>
                    {agent.deactivated_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Deactivated {new Date(agent.deactivated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleReactivate(agent)}
                    disabled={actionLoading === agent.user_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-emerald-500 hover:border-emerald-500/30 transition-all"
                  >
                    {actionLoading === agent.user_id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                    Reactivate
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {showInviteModal && (
        <InviteAgentModal
          onClose={() => setShowInviteModal(false)}
          onInviteSent={() => { setShowInviteModal(false); fetchData(); }}
          invitedBy={user?.id}
        />
      )}

      {reassignAgent && (
        <ReassignModal
          agent={reassignAgent}
          agents={agents}
          onClose={() => setReassignAgent(null)}
          onDone={fetchData}
        />
      )}
    </AppLayout>
  );
}
