'use client';

import { Edit3, Plus, Trash2 } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonPrimary, buttonSecondary } from '@/components/ops';
import type { AgentOption, AssignmentRuleRecord } from './types';

function formatTimestamp(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function RulesPanel({
  rules,
  agents,
  onCreate,
  onEdit,
  onDelete,
  onToggle,
}: {
  rules: AssignmentRuleRecord[];
  agents: AgentOption[];
  onCreate: () => void;
  onEdit: (rule: AssignmentRuleRecord) => void;
  onDelete: (ruleId: string) => void;
  onToggle: (rule: AssignmentRuleRecord) => void;
}) {
  return (
    <Panel
      title="Assignment rules"
      actions={(
        <button type="button" onClick={onCreate} className={buttonPrimary}>
          <Plus size={14} /> New rule
        </button>
      )}
    >
      {rules.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No assignment rules are stored in the database"
          hint="lead_assignment_rules exists in the live schema, but it currently has zero rows. Create the first real rule instead of relying on local mock data."
          action={<button type="button" onClick={onCreate} className={buttonPrimary}>Create first rule</button>}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const targetAgent = agents.find((agent) => agent.userId === rule.target_agent_id);
            return (
              <section key={rule.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{rule.name}</h3>
                      <StatusPill tone={rule.enabled ? 'success' : 'default'}>{rule.enabled ? 'Enabled' : 'Disabled'}</StatusPill>
                      <StatusPill tone={rule.auto_assign_enabled ? 'primary' : 'warning'}>{rule.auto_assign_enabled ? 'Auto-run on' : 'Auto-run off'}</StatusPill>
                      <StatusPill>Priority {rule.priority}</StatusPill>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {targetAgent?.fullName || rule.target_agent_name || 'No agent selected'} · {targetAgent ? `${targetAgent.assignedLeadCount} assigned leads` : 'Target agent could not be resolved from active profiles'}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <StatusPill tone="primary">Score {rule.min_ai_score}-{rule.max_ai_score}</StatusPill>
                      {rule.score_threshold > 0 ? <StatusPill tone="warning">Threshold {rule.score_threshold}+</StatusPill> : null}
                      {rule.portfolios.length > 0 ? <StatusPill>{rule.portfolios.join(', ')}</StatusPill> : <StatusPill>All portfolios</StatusPill>}
                      {rule.lead_stages.length > 0 ? <StatusPill>{rule.lead_stages.join(', ')}</StatusPill> : <StatusPill>All queue stages</StatusPill>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onToggle(rule)} className={buttonSecondary}>
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" onClick={() => onEdit(rule)} className={buttonSecondary}>
                      <Edit3 size={14} /> Edit
                    </button>
                    <button type="button" onClick={() => onDelete(rule.id)} className={buttonSecondary}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Workload cap</p>
                    <p className="mt-1">{rule.max_workload} leads</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Runs completed</p>
                    <p className="mt-1">{rule.total_assigned} assignments · last run {formatTimestamp(rule.last_run_at)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Availability</p>
                    <p className="mt-1">
                      {rule.availability_days.length > 0 ? rule.availability_days.join(', ') : 'Every day'}
                      {' · '}
                      {rule.availability_start && rule.availability_end ? `${rule.availability_start.slice(0, 5)}-${rule.availability_end.slice(0, 5)}` : 'Any time'}
                    </p>
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
