'use client';

import { Plus, Save } from 'lucide-react';
import { buttonPrimary, buttonSecondary, inputClass, Panel } from '@/components/ops';
import type { ConfidenceRule, RuleAction, RuleSeverity, RuleType } from './types';

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  ownership_min_confidence: 'Ownership minimum confidence',
  market_comp_freshness_days: 'Market comp freshness (days)',
  price_anomaly_pct: 'Price anomaly (%)',
  overall_min_confidence: 'Overall minimum confidence',
  field_min_confidence: 'Field minimum confidence',
};

export const RULE_TYPE_DESCRIPTIONS: Record<RuleType, string> = {
  ownership_min_confidence: 'Triggers when ownership confidence drops below the threshold.',
  market_comp_freshness_days: 'Triggers when market comp data is older than the threshold.',
  price_anomaly_pct: 'Triggers when listing price deviates too far from estimated value.',
  overall_min_confidence: 'Triggers when overall validation confidence is below the threshold.',
  field_min_confidence: 'Triggers when a specific field confidence is below the threshold.',
};

export default function RuleComposerPanel({
  open,
  saving,
  newRule,
  onClose,
  onSave,
  onChange,
}: {
  open: boolean;
  saving: boolean;
  newRule: Partial<ConfidenceRule>;
  onClose: () => void;
  onSave: () => void;
  onChange: (patch: Partial<ConfidenceRule>) => void;
}) {
  if (!open) return null;

  return (
    <Panel title="Create confidence rule" icon={Plus} className="rounded-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Rule name</label>
          <input
            value={newRule.rule_name || ''}
            onChange={(event) => onChange({ rule_name: event.target.value })}
            placeholder="Strict ownership review"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Rule type</label>
          <select
            value={newRule.rule_type}
            onChange={(event) => onChange({ rule_type: event.target.value as RuleType })}
            className={inputClass}
          >
            {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {RULE_TYPE_DESCRIPTIONS[(newRule.rule_type || 'ownership_min_confidence') as RuleType]}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Threshold value
          </label>
          <input
            type="number"
            value={newRule.threshold_value ?? 70}
            onChange={(event) => onChange({ threshold_value: Number(event.target.value) })}
            className={inputClass}
          />
        </div>

        {(newRule.rule_type || 'ownership_min_confidence') === 'field_min_confidence' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Target field
            </label>
            <input
              value={newRule.target_field || ''}
              onChange={(event) => onChange({ target_field: event.target.value })}
              placeholder="ownerName"
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Action</label>
          <select
            value={newRule.action}
            onChange={(event) => onChange({ action: event.target.value as RuleAction })}
            className={inputClass}
          >
            <option value="flag">Flag</option>
            <option value="block">Block</option>
            <option value="notify">Notify</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Severity</label>
          <select
            value={newRule.severity}
            onChange={(event) => onChange({ severity: event.target.value as RuleSeverity })}
            className={inputClass}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <input
            value={newRule.description || ''}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="Explain when this rule should fire."
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Cancel
        </button>
        <button type="button" onClick={onSave} className={buttonPrimary} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </Panel>
  );
}
