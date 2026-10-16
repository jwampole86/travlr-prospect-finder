'use client';

import { ClipboardList, History, Users } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AgentOption, AssignmentLogRecord, AssignmentPreviewRecord } from './types';

function formatRelativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AgentsPanel({ agents }: { agents: AgentOption[] }) {
  return (
    <Panel title="Target agents" icon={Users}>
      {agents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active agent profiles found"
          hint="The live database only returned inactive or missing agent_profiles rows, so assignments cannot target a real assignee yet."
        />
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.userId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{agent.fullName}</h3>
                  <p className="text-sm text-muted-foreground">{agent.email || 'No email on file'}</p>
                </div>
                <StatusPill tone={agent.status.toLowerCase() === 'active' ? 'success' : 'default'}>{agent.status}</StatusPill>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <StatusPill tone="primary">{agent.assignedLeadCount} assigned leads</StatusPill>
                {agent.portfolioKeys.length > 0 ? (
                  agent.portfolioKeys.map((portfolio) => <StatusPill key={`${agent.userId}-${portfolio}`}>{portfolio}</StatusPill>)
                ) : (
                  <StatusPill>Unscoped</StatusPill>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function PreviewPanel({ preview }: { preview: AssignmentPreviewRecord[] }) {
  return (
    <Panel title="Dry-run preview" icon={ClipboardList}>
      {preview.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No preview results yet"
          hint="Run a dry preview to inspect which real leads and agents match the stored rules before you trigger a live assignment run."
        />
      ) : (
        <div className="space-y-3">
          {preview.map((item) => (
            <div key={`${item.ruleId}-${item.leadId}`} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.leadName || item.leadAddress || item.leadId}</h3>
                  <p className="text-sm text-muted-foreground">{item.leadAddress || 'Address unavailable'}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <StatusPill tone="primary">{item.agentName}</StatusPill>
                  <StatusPill>Score {item.aiScore}</StatusPill>
                  <StatusPill>{item.region || 'No state'}</StatusPill>
                  {item.stage ? <StatusPill>{item.stage}</StatusPill> : null}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{item.ruleName} · {item.reason}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function HistoryPanel({ log }: { log: AssignmentLogRecord[] }) {
  return (
    <Panel title="Recent assignment history" icon={History}>
      {log.length === 0 ? (
        <EmptyState
          icon={History}
          title="No assignment history has been logged"
          hint="The lead_assignment_log table exists in the live schema, but it currently has zero rows. Successful auto-assign runs will appear here."
        />
      ) : (
        <div className="space-y-3">
          {log.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.lead_address || item.lead_id}</h3>
                  <p className="text-sm text-muted-foreground">{item.assigned_to_agent_name || 'Unknown agent'} via {item.rule_name || 'manual rule'}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {item.ai_score != null ? <StatusPill>Score {item.ai_score}</StatusPill> : null}
                  {item.region ? <StatusPill>{item.region}</StatusPill> : null}
                  {item.stage ? <StatusPill>{item.stage}</StatusPill> : null}
                  <StatusPill tone="primary">{formatRelativeTime(item.assigned_at)}</StatusPill>
                </div>
              </div>
              {item.reason ? <p className="mt-3 text-xs text-muted-foreground">{item.reason}</p> : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
