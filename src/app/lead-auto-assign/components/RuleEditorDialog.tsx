'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import type { Portfolio } from '@/contexts/PortfolioContext';
import type { AgentOption, AssignmentRuleRecord } from './types';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ToggleChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
    >
      {label}
    </button>
  );
}

export function RuleEditorDialog({
  rule,
  agents,
  portfolios,
  stageOptions,
  onClose,
  onSave,
}: {
  rule: AssignmentRuleRecord | null;
  agents: AgentOption[];
  portfolios: Portfolio[];
  stageOptions: string[];
  onClose: () => void;
  onSave: (payload: Omit<AssignmentRuleRecord, 'id' | 'last_run_at' | 'total_assigned'> & { id?: string; total_assigned?: number; last_run_at?: string | null }) => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? 1);
  const [minScore, setMinScore] = useState(rule?.min_ai_score ?? 0);
  const [maxScore, setMaxScore] = useState(rule?.max_ai_score ?? 100);
  const [scoreThreshold, setScoreThreshold] = useState(rule?.score_threshold ?? 0);
  const [regions, setRegions] = useState<string[]>(rule?.regions ?? []);
  const [expertiseTags, setExpertiseTags] = useState<string[]>(rule?.expertise_tags ?? []);
  const [leadStages, setLeadStages] = useState<string[]>(rule?.lead_stages ?? []);
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>(rule?.portfolios ?? []);
  const [availabilityStart, setAvailabilityStart] = useState(rule?.availability_start?.slice(0, 5) ?? '');
  const [availabilityEnd, setAvailabilityEnd] = useState(rule?.availability_end?.slice(0, 5) ?? '');
  const [availabilityDays, setAvailabilityDays] = useState<string[]>(rule?.availability_days ?? []);
  const [targetAgentId, setTargetAgentId] = useState(rule?.target_agent_id ?? '');
  const [maxWorkload, setMaxWorkload] = useState(rule?.max_workload ?? 50);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(rule?.auto_assign_enabled ?? true);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.userId === targetAgentId) ?? null,
    [agents, targetAgentId],
  );

  const toggle = (items: string[], next: string, setter: (value: string[]) => void) => {
    setter(items.includes(next) ? items.filter((item) => item !== next) : [...items, next]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{rule ? 'Edit assignment rule' : 'Create assignment rule'}</h2>
            <p className="text-sm text-muted-foreground">Rules are stored in lead_assignment_rules and evaluated against live leads.</p>
          </div>
          <button type="button" aria-label="Close rule editor" onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_140px]">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rule name</label>
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Colorado high-score handoff" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Priority</label>
              <input type="number" min={1} value={priority} onChange={(event) => setPriority(Number(event.target.value))} className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Assign to agent</label>
              <select value={targetAgentId} onChange={(event) => setTargetAgentId(event.target.value)} className={inputClass}>
                <option value="">Select an active agent…</option>
                {agents.map((agent) => (
                  <option key={agent.userId} value={agent.userId}>
                    {agent.fullName} · {agent.assignedLeadCount} leads
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Max workload</label>
              <input type="number" min={1} value={maxWorkload} onChange={(event) => setMaxWorkload(Number(event.target.value))} className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Min score</label>
              <input type="number" min={0} max={100} value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Max score</label>
              <input type="number" min={0} max={100} value={maxScore} onChange={(event) => setMaxScore(Number(event.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Required threshold</label>
              <input type="number" min={0} max={100} value={scoreThreshold} onChange={(event) => setScoreThreshold(Number(event.target.value))} className={inputClass} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Portfolio scope</p>
              <div className="flex flex-wrap gap-2">
                {portfolios.map((portfolio) => (
                  <ToggleChip
                    key={portfolio.key}
                    label={portfolio.stateCode}
                    selected={selectedPortfolios.includes(portfolio.stateCode)}
                    onClick={() => toggle(selectedPortfolios, portfolio.stateCode, setSelectedPortfolios)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Region filter</p>
              <div className="flex flex-wrap gap-2">
                {portfolios.map((portfolio) => (
                  <ToggleChip
                    key={`${portfolio.key}-region`}
                    label={portfolio.stateCode}
                    selected={regions.includes(portfolio.stateCode)}
                    onClick={() => toggle(regions, portfolio.stateCode, setRegions)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Lead stages</p>
              <div className="flex flex-wrap gap-2">
                {stageOptions.map((stage) => (
                  <ToggleChip
                    key={stage}
                    label={stage}
                    selected={leadStages.includes(stage)}
                    onClick={() => toggle(leadStages, stage, setLeadStages)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expertise tags</label>
              <input
                value={expertiseTags.join(', ')}
                onChange={(event) =>
                  setExpertiseTags(
                    event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
                className={inputClass}
                placeholder="luxury, vacation-rental, urban"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Available from</label>
              <input type="time" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Available until</label>
              <input type="time" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Active days</p>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <ToggleChip
                  key={day}
                  label={day}
                  selected={availabilityDays.includes(day)}
                  onClick={() => toggle(availabilityDays, day, setAvailabilityDays)}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Rule enabled</p>
                  <p className="text-xs text-muted-foreground">Stored as the lead_assignment_rules.enabled flag.</p>
                </div>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-run enabled</p>
                  <p className="text-xs text-muted-foreground">Stored as the auto_assign_enabled flag.</p>
                </div>
                <input type="checkbox" checked={autoAssignEnabled} onChange={(event) => setAutoAssignEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />
              </div>
            </div>
          </div>

          {selectedAgent ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Target agent preview</p>
              <p className="mt-1">{selectedAgent.fullName} · {selectedAgent.assignedLeadCount} assigned leads · {selectedAgent.portfolioKeys.length > 0 ? selectedAgent.portfolioKeys.join(', ') : 'No explicit portfolio scope'}</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button
            type="button"
            onClick={() => onSave({
              id: rule?.id,
              name: name.trim(),
              priority,
              enabled,
              min_ai_score: minScore,
              max_ai_score: maxScore,
              regions,
              expertise_tags: expertiseTags,
              lead_stages: leadStages,
              portfolios: selectedPortfolios,
              score_threshold: scoreThreshold,
              availability_start: availabilityStart || null,
              availability_end: availabilityEnd || null,
              availability_days: availabilityDays,
              auto_assign_enabled: autoAssignEnabled,
              target_agent_id: selectedAgent?.userId || null,
              target_agent_name: selectedAgent?.fullName || '',
              max_workload: maxWorkload,
              total_assigned: rule?.total_assigned ?? 0,
              last_run_at: rule?.last_run_at ?? null,
            })}
            disabled={!name.trim() || !selectedAgent}
            className={buttonPrimary}
          >
            {rule ? 'Save rule' : 'Create rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
