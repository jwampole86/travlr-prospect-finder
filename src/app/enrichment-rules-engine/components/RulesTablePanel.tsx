'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Power, Trash2 } from 'lucide-react';
import { EmptyState, Panel, StatusPill, inputClass } from '@/components/ops';
import { RULE_TYPE_DESCRIPTIONS, RULE_TYPE_LABELS } from './RuleComposerPanel';
import type { ConfidenceRule, RuleAction, RuleSeverity, RuleType } from './types';

function severityTone(severity: RuleSeverity) {
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'primary' as const;
}

function actionTone(action: RuleAction) {
  if (action === 'block') return 'danger' as const;
  if (action === 'flag') return 'warning' as const;
  return 'primary' as const;
}

function ThresholdEditor({
  value,
  ruleType,
  saving,
  onSave,
}: {
  value: number;
  ruleType: RuleType;
  saving: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const unit =
    ruleType === 'market_comp_freshness_days'
      ? ' days'
      : ruleType === 'price_anomaly_pct'
        ? '%'
        : '';

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {value}
        {unit}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        className="w-24 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
      />
      <button
        type="button"
        aria-label="Save threshold"
        disabled={saving}
        onClick={() => {
          onSave(draft);
          setEditing(false);
        }}
        className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <CheckCircle2 size={14} />
      </button>
    </div>
  );
}

export default function RulesTablePanel({
  rules,
  savingId,
  onToggle,
  onDelete,
  onThresholdSave,
  onActionChange,
  onSeverityChange,
}: {
  rules: ConfidenceRule[];
  savingId: string | null;
  onToggle: (rule: ConfidenceRule) => void;
  onDelete: (ruleId: string) => void;
  onThresholdSave: (ruleId: string, value: number) => void;
  onActionChange: (ruleId: string, value: RuleAction) => void;
  onSeverityChange: (ruleId: string, value: RuleSeverity) => void;
}) {
  return (
    <Panel title="Persisted rules" icon={Power} padded={false} className="rounded-2xl">
      {rules.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={AlertTriangle}
            title="No rules found"
            hint="The live enrichment_confidence_rules table returned zero rows."
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <div key={rule.id} className={`p-4 ${!rule.enabled ? 'opacity-60' : ''}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                <button
                  type="button"
                  aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.rule_name}`}
                  onClick={() => onToggle(rule)}
                  disabled={savingId === rule.id}
                  className={`mt-1 inline-flex h-6 w-11 rounded-full transition-colors ${
                    rule.enabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`m-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-foreground">{rule.rule_name}</div>
                    <StatusPill tone={severityTone(rule.severity)}>{rule.severity}</StatusPill>
                    <StatusPill tone={actionTone(rule.action)}>{rule.action}</StatusPill>
                    <StatusPill tone={rule.enabled ? 'success' : 'default'}>
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </StatusPill>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {RULE_TYPE_LABELS[rule.rule_type]} · {RULE_TYPE_DESCRIPTIONS[rule.rule_type]}
                    {rule.target_field ? ` Field: ${rule.target_field}.` : ''}
                  </div>
                  {rule.description && (
                    <div className="text-sm text-foreground">{rule.description}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(rule.updated_at).toLocaleString()}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Threshold
                    </div>
                    <ThresholdEditor
                      value={rule.threshold_value}
                      ruleType={rule.rule_type}
                      saving={savingId === rule.id}
                      onSave={(value) => onThresholdSave(rule.id, value)}
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Action
                    </div>
                    <select
                      value={rule.action}
                      onChange={(event) =>
                        onActionChange(rule.id, event.target.value as RuleAction)
                      }
                      className={inputClass}
                    >
                      <option value="flag">Flag</option>
                      <option value="block">Block</option>
                      <option value="notify">Notify</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Severity
                    </div>
                    <select
                      value={rule.severity}
                      onChange={(event) =>
                        onSeverityChange(rule.id, event.target.value as RuleSeverity)
                      }
                      className={inputClass}
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Delete ${rule.rule_name}`}
                  onClick={() => onDelete(rule.id)}
                  className="inline-flex items-center gap-2 self-start rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
