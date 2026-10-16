'use client';

import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  GripVertical,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Shield,
  Trash2,
} from 'lucide-react';
import { Panel, StatusPill, buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import type { CadenceSequence, CadenceStep } from './types';

const CHANNEL_META = {
  email: { label: 'Email', icon: Mail, tone: 'primary' as const },
  sms: { label: 'SMS', icon: MessageSquare, tone: 'success' as const },
};

function StepEditor({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: CadenceStep;
  index: number;
  onChange: (value: CadenceStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-2 pt-1 text-muted-foreground">
          <GripVertical size={15} />
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <input
              value={step.label}
              onChange={(event) => onChange({ ...step, label: event.target.value })}
              className={inputClass}
              placeholder="Step label"
            />
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-1">
              {(['email', 'sms'] as const).map((channel) => {
                const Icon = CHANNEL_META[channel].icon;
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => onChange({ ...step, channel })}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${step.channel === channel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon size={14} /> {CHANNEL_META[channel].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Delay days</span>
              <input
                type="number"
                min={0}
                value={step.delay_days}
                onChange={(event) => onChange({ ...step, delay_days: Math.max(0, Number(event.target.value) || 0) })}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Delay hours</span>
              <input
                type="number"
                min={0}
                max={23}
                value={step.delay_hours}
                onChange={(event) => onChange({ ...step, delay_hours: Math.max(0, Math.min(23, Number(event.target.value) || 0)) })}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground md:col-span-2">
              <span>Template key</span>
              <input
                value={step.template_key}
                onChange={(event) => onChange({ ...step, template_key: event.target.value })}
                className={inputClass}
                placeholder="initial_outreach"
              />
            </label>
          </div>

          {step.channel === 'email' && (
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Email subject</span>
              <input
                value={step.subject || ''}
                onChange={(event) => onChange({ ...step, subject: event.target.value })}
                className={inputClass}
                placeholder="Quick question about your property"
              />
            </label>
          )}
        </div>
        <button
          type="button"
          aria-label={`Remove step ${index + 1}`}
          onClick={onRemove}
          className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export default function CadenceSequenceEditor({
  sequence,
  onChange,
  onAddStep,
  onRemoveStep,
  onSave,
  saving,
  triggerStageSuggestions,
}: {
  sequence: CadenceSequence;
  onChange: (updates: Partial<CadenceSequence>) => void;
  onAddStep: () => void;
  onRemoveStep: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  triggerStageSuggestions: string[];
}) {
  const normalizedSteps = sequence.steps.map((step, index) => ({ ...step, step: index }));

  return (
    <div className="space-y-4">
      <Panel
        title="Sequence settings"
        icon={Settings2}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ is_active: !sequence.is_active })}
              className={buttonSecondary}
            >
              {sequence.is_active ? 'Pause sequence' : 'Activate sequence'}
            </button>
            <button type="button" onClick={onSave} disabled={saving} className={buttonPrimary}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save sequence'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Sequence name</span>
            <input
              value={sequence.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Trigger stage label</span>
            <>
              <input
                list="cadence-trigger-stage-options"
                value={sequence.trigger_stage}
                onChange={(event) => onChange({ trigger_stage: event.target.value })}
                className={inputClass}
              />
              <datalist id="cadence-trigger-stage-options">
                {triggerStageSuggestions.map((stage) => (
                  <option key={stage} value={stage} />
                ))}
              </datalist>
            </>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">
            <span>Description</span>
            <textarea
              value={sequence.description || ''}
              onChange={(event) => onChange({ description: event.target.value })}
              className={`${inputClass} min-h-[92px] resize-y`}
              placeholder="What this sequence is for"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current behavior</p>
            <p className="mt-2 text-sm text-foreground">
              <strong>{sequence.trigger_stage || 'Unset'}</strong> is stored on the sequence, but the live cadence routes currently enroll the default active sequence or match by sequence name tag.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone={sequence.is_active ? 'success' : 'default'}>{sequence.is_active ? 'Active' : 'Paused'}</StatusPill>
              {sequence.is_default && <StatusPill tone="primary">Default sequence</StatusPill>}
              <StatusPill tone="default">{normalizedSteps.length} steps</StatusPill>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-warning/5 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-warning">
              <Shield size={15} />
              <span className="font-semibold">Safety note</span>
            </div>
            <p className="mt-2">This page edits sequence metadata only. It does not trigger sends, and it must never be used to bypass protected-contact, suppression, or opt-in safeguards.</p>
          </div>
        </div>
      </Panel>

      <Panel
        title={`Steps (${normalizedSteps.length})`}
        icon={Clock3}
        actions={
          <button type="button" onClick={onAddStep} className={buttonSecondary}>
            <Plus size={14} /> Add step
          </button>
        }
      >
        <div className="space-y-3">
          {normalizedSteps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-10 text-center">
              <Clock3 size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No steps configured yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add email or SMS steps to define the sequence.</p>
            </div>
          ) : (
            normalizedSteps.map((step, index) => (
              <StepEditor
                key={`${sequence.id}-${index}`}
                step={step}
                index={index}
                onChange={(value) => {
                  const next = normalizedSteps.slice();
                  next[index] = value;
                  onChange({ steps: next.map((item, itemIndex) => ({ ...item, step: itemIndex })) });
                }}
                onRemove={() => onRemoveStep(index)}
              />
            ))
          )}

          {normalizedSteps.length > 0 && (
            <div className="flex items-start gap-2 rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-muted-foreground">
              <ArrowRight size={16} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">Completion rule in the live run route</p>
                <p className="mt-1">After the last step, the cadence job marks the enrollment completed and may set the lead stage to <code className="rounded bg-muted px-1 py-0.5 text-[11px]">closed_dead</code> when no engagement is detected.</p>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Template variables & compliance" icon={AlertTriangle}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {['{{leadName}}', '{{address}}', '{{agentName}}', '{{unsubscribeUrl}}'].map((token) => (
              <code key={token} className="rounded-xl border border-border bg-muted px-2 py-1 text-foreground">{token}</code>
            ))}
          </div>
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Human-approved content only</p>
            <p className="mt-1">The cadence system stores predefined template keys and subjects. It does not generate freeform outreach copy here, and it must not suggest messaging that bypasses consent or protected-contact rules.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
