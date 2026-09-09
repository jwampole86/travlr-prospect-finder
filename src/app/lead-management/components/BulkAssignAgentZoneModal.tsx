'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Search, Check, Loader2, UserCheck, Shuffle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Agent {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_initials: string;
  assigned_portfolios?: string[];
}

interface BulkAssignAgentZoneModalProps {
  selectedCount: number;
  selectedIds: string[];
  onClose: () => void;
  onAssigned: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/15 text-purple-400',
  manager: 'bg-blue-500/15 text-blue-400',
  agent: 'bg-emerald-500/15 text-emerald-400',
  viewer: 'bg-slate-500/15 text-slate-400',
};

type AssignMode = 'single' | 'round-robin';

export default function BulkAssignAgentZoneModal({
  selectedCount,
  selectedIds,
  onClose,
  onAssigned,
}: BulkAssignAgentZoneModalProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [assignMode, setAssignMode] = useState<AssignMode>('single');
  const [note, setNote] = useState('');
  const [distribution, setDistribution] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: inviteData } = await supabase
          .from('agent_invites')
          .select('agent_user_id, first_name, last_name, email, assigned_portfolios, role')
          .eq('status', 'completed')
          .order('first_name');

        if (inviteData && inviteData.length > 0) {
          const mapped: Agent[] = inviteData.map((a: any) => ({
            id: a.agent_user_id,
            full_name: `${a.first_name} ${a.last_name}`.trim(),
            email: a.email,
            role: a.role ?? 'agent',
            avatar_initials: `${a.first_name?.[0] ?? ''}${a.last_name?.[0] ?? ''}`.toUpperCase(),
            assigned_portfolios: a.assigned_portfolios ?? [],
          }));
          setAgents(mapped);
        } else {
          const { data: profileData } = await supabase
            .from('agent_profiles')
            .select('id, full_name, email, role, avatar_initials')
            .eq('status', 'active')
            .order('full_name');
          setAgents((profileData as Agent[]) ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate distribution when agents or mode changes
  useEffect(() => {
    if (assignMode !== 'round-robin' || selectedAgentIds.length === 0) {
      setDistribution({});
      return;
    }
    const base = Math.floor(selectedCount / selectedAgentIds.length);
    const remainder = selectedCount % selectedAgentIds.length;
    const dist: Record<string, number> = {};
    selectedAgentIds.forEach((id, i) => {
      dist[id] = base + (i < remainder ? 1 : 0);
    });
    setDistribution(dist);
  }, [selectedAgentIds, assignMode, selectedCount]);

  const filteredAgents = agents.filter(
    a =>
      a.full_name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.email.toLowerCase().includes(agentSearch.toLowerCase())
  );

  function toggleAgent(id: string) {
    if (assignMode === 'single') {
      setSelectedAgentIds([id]);
    } else {
      setSelectedAgentIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  }

  async function handleAssign() {
    if (selectedAgentIds.length === 0) {
      toast.error('Please select at least one agent');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (assignMode === 'single') {
        const agentId = selectedAgentIds[0];
        const agent = agents.find(a => a.id === agentId);

        // Remove existing assignments
        await supabase.from('agent_lead_permissions').delete().in('surplus_lead_id', selectedIds);

        // Insert new assignments
        const rows = selectedIds.map(leadId => ({
          agent_id: agentId,
          surplus_lead_id: leadId,
          can_view: true,
          can_edit: true,
          can_contact: true,
          can_close: false,
          owner_user_id: user?.id,
          assigned_at: now,
          note: note.trim() || null,
        }));
        await supabase.from('agent_lead_permissions').insert(rows);

        // Update leads primary_agent fields
        await supabase.from('leads').update({
          primary_agent_id: agentId,
          primary_agent_name: agent?.full_name || null,
          assigned_at: now,
          assigned_by: user?.id || null,
          outreach_status: 'NOT_CONTACTED',
        }).in('id', selectedIds);

        // Insert into lead_agent_assignments
        const assignRows = selectedIds.map(leadId => ({
          lead_id: leadId,
          agent_id: agentId,
          agent_name: agent?.full_name || null,
          is_primary: true,
          assigned_at: now,
          assigned_by: user?.id || null,
          assigned_by_name: null,
          note: note.trim() || null,
        }));
        await supabase.from('lead_agent_assignments').upsert(assignRows, { onConflict: 'lead_id,agent_id' });

        // Notification
        await supabase.from('app_notifications').insert({
          user_id: agentId,
          type: 'new_lead',
          title: `📋 ${selectedCount} Lead${selectedCount !== 1 ? 's' : ''} Assigned to You`,
          message: `${selectedCount} verified prospect${selectedCount !== 1 ? 's' : ''} assigned to you. Click to view your queue.`,
          read: false,
          metadata: {
            lead_ids: selectedIds.slice(0, 10),
            assigned_by: user?.id,
            link: `/lead-management?assigned=true`,
          },
        });

        toast.success(`${selectedCount} lead${selectedCount !== 1 ? 's' : ''} assigned to ${agent?.full_name ?? 'agent'}`);
      } else {
        // Round-robin distribution
        let leadIndex = 0;
        for (const agentId of selectedAgentIds) {
          const count = distribution[agentId] || 0;
          if (count === 0) continue;
          const agentLeadIds = selectedIds.slice(leadIndex, leadIndex + count);
          leadIndex += count;
          const agent = agents.find(a => a.id === agentId);

          await supabase.from('agent_lead_permissions').delete().in('surplus_lead_id', agentLeadIds);
          const rows = agentLeadIds.map(leadId => ({
            agent_id: agentId,
            surplus_lead_id: leadId,
            can_view: true,
            can_edit: true,
            can_contact: true,
            can_close: false,
            owner_user_id: user?.id,
            assigned_at: now,
            note: note.trim() || null,
          }));
          if (rows.length > 0) {
            await supabase.from('agent_lead_permissions').insert(rows);
            await supabase.from('leads').update({
              primary_agent_id: agentId,
              primary_agent_name: agent?.full_name || null,
              assigned_at: now,
              assigned_by: user?.id || null,
            }).in('id', agentLeadIds);

            const assignRows = agentLeadIds.map(leadId => ({
              lead_id: leadId,
              agent_id: agentId,
              agent_name: agent?.full_name || null,
              is_primary: true,
              assigned_at: now,
              assigned_by: user?.id || null,
              note: note.trim() || null,
            }));
            await supabase.from('lead_agent_assignments').upsert(assignRows, { onConflict: 'lead_id,agent_id' });

            if (count > 0) {
              await supabase.from('app_notifications').insert({
                user_id: agentId,
                type: 'new_lead',
                title: `📋 ${count} Lead${count !== 1 ? 's' : ''} Assigned to You`,
                message: `${count} verified prospect${count !== 1 ? 's' : ''} assigned to you via round-robin distribution.`,
                read: false,
                metadata: { lead_ids: agentLeadIds.slice(0, 10), assigned_by: user?.id, link: `/lead-management?assigned=true` },
              });
            }
          }
        }
        toast.success(`${selectedCount} leads distributed across ${selectedAgentIds.length} agents`);
      }

      onAssigned();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  }

  const canConfirm = selectedAgentIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Assign to Agent(s)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assigning <span className="font-semibold text-foreground">{selectedCount}</span> selected lead{selectedCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Assignment mode */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Assignment Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setAssignMode('single'); setSelectedAgentIds(selectedAgentIds.slice(0, 1)); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                  assignMode === 'single' ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <UserCheck size={14} className={assignMode === 'single' ? 'text-primary' : ''} />
                <div>
                  <p className="text-xs font-medium">Single Agent</p>
                  <p className="text-[10px] text-muted-foreground">All leads → one agent</p>
                </div>
              </button>
              <button
                onClick={() => setAssignMode('round-robin')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                  assignMode === 'round-robin' ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <Shuffle size={14} className={assignMode === 'round-robin' ? 'text-primary' : ''} />
                <div>
                  <p className="text-xs font-medium">Round Robin</p>
                  <p className="text-[10px] text-muted-foreground">Distribute across agents</p>
                </div>
              </button>
            </div>
          </div>

          {/* Agent search */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</div>
              <h3 className="text-sm font-semibold text-foreground">
                {assignMode === 'round-robin' ? 'Select Agents (multi-select)' : 'Select Agent'}
              </h3>
            </div>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-primary" />
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={22} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {agents.length === 0 ? 'No active agents found. Invite agents first.' : 'No agents match your search.'}
                  </p>
                </div>
              ) : (
                filteredAgents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                      selectedAgentIds.includes(agent.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {agent.avatar_initials || agent.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{agent.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                      {assignMode === 'round-robin' && selectedAgentIds.includes(agent.id) && distribution[agent.id] !== undefined && (
                        <p className="text-[10px] text-primary font-medium mt-0.5">
                          Will receive {distribution[agent.id]} lead{distribution[agent.id] !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${ROLE_COLORS[agent.role] ?? ROLE_COLORS.viewer}`}>
                      {agent.role}
                    </span>
                    {selectedAgentIds.includes(agent.id) && (
                      <Check size={14} className="text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Round-robin distribution preview */}
          {assignMode === 'round-robin' && selectedAgentIds.length > 0 && (
            <div className="bg-muted/30 border border-border rounded-xl p-3">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Shuffle size={11} />
                Distribution Preview
              </p>
              <div className="space-y-1.5">
                {selectedAgentIds.map(agentId => {
                  const agent = agents.find(a => a.id === agentId);
                  const count = distribution[agentId] || 0;
                  return (
                    <div key={agentId} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{agent?.full_name || 'Unknown'}</span>
                      <span className="font-semibold text-primary tabular-nums">{count} lead{count !== 1 ? 's' : ''}</span>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-1.5 flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-foreground">{selectedCount} leads</span>
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note for the agent(s)…"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!canConfirm || saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" />Assigning…</>
            ) : (
              <><UserCheck size={14} />
                {assignMode === 'round-robin'
                  ? `Distribute ${selectedCount} Leads`
                  : `Assign ${selectedCount} Lead${selectedCount !== 1 ? 's' : ''}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
