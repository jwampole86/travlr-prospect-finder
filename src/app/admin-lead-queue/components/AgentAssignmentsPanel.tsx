'use client';

import { Mail, MoveRight, Phone, UserRound, Wifi } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AgentSummary, QueueLead } from './types';

function statusTone(status: string): 'success' | 'warning' | 'default' {
  const value = status.toLowerCase();
  if (value === 'active') return 'success';
  if (value === 'paused' || value === 'pending') return 'warning';
  return 'default';
}

function formatLastActive(value?: string | null) {
  if (!value) return 'No recent activity';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AgentAssignmentsPanel({
  agents,
  assignedLeadsByAgent,
  hoveredAgentId,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  agents: AgentSummary[];
  assignedLeadsByAgent: Record<string, QueueLead[]>;
  hoveredAgentId: string | null;
  onDragOver: (agentUserId: string) => void;
  onDragLeave: () => void;
  onDrop: (agentUserId: string) => void;
}) {
  return (
    <Panel
      title="Assignable agents"
      actions={<span className="text-xs text-muted-foreground">Drop a lead card onto an active agent to persist the assignment</span>}
      className="h-full"
    >
      {agents.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No active agent profiles found"
          hint="The live queue only shows real assignees from agent_profiles. Add or reactivate an agent profile to enable assignment."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {agents.map((agent) => {
            const isActive = agent.status.toLowerCase() === 'active';
            const assignedLeads = assignedLeadsByAgent[agent.userId] || [];
            const isHovering = hoveredAgentId === agent.userId;

            return (
              <section
                key={agent.userId}
                onDragOver={(event) => {
                  if (!isActive) return;
                  event.preventDefault();
                  onDragOver(agent.userId);
                }}
                onDragLeave={onDragLeave}
                onDrop={(event) => {
                  if (!isActive) return;
                  event.preventDefault();
                  onDrop(agent.userId);
                }}
                className={`rounded-2xl border p-4 transition ${isHovering ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-card'} ${!isActive ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                        {agent.avatarInitials}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <StatusPill tone={statusTone(agent.status)}>{agent.status}</StatusPill>
                          <span className="tabular-nums">{agent.assignedLeadCount} assigned</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {agent.email ? <div className="inline-flex items-center gap-1"><Mail size={12} />{agent.email}</div> : null}
                      {agent.phone ? <div className="inline-flex items-center gap-1"><Phone size={12} />{agent.phone}</div> : null}
                      <div className="inline-flex items-center gap-1"><Wifi size={12} />Last active {formatLastActive(agent.lastActiveAt)}</div>
                    </div>
                  </div>
                  {isHovering ? <StatusPill tone="primary" icon={MoveRight}>Drop to assign</StatusPill> : null}
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Portfolio scope</p>
                    <div className="flex flex-wrap gap-2">
                      {agent.portfolioKeys.length > 0 ? (
                        agent.portfolioKeys.map((portfolio) => (
                          <StatusPill key={portfolio}>{portfolio}</StatusPill>
                        ))
                      ) : (
                        <StatusPill tone="default">Unscoped</StatusPill>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visible assigned leads</p>
                    <div className="space-y-2">
                      {assignedLeads.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                          {isActive ? 'No currently loaded leads assigned to this agent.' : 'Inactive profiles are hidden from assignment actions.'}
                        </div>
                      ) : (
                        assignedLeads.slice(0, 4).map((lead) => (
                          <div key={lead.id} className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                            <p className="text-sm font-medium text-foreground">{lead.contactName || lead.address}</p>
                            <p className="text-xs text-muted-foreground">{lead.address}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
