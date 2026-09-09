'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, Edit3, Save, X, ChevronDown, ChevronUp, Mail, MessageSquare, Phone, Clock, GitBranch, RefreshCw, AlertCircle, Loader2, Copy, ToggleLeft, ToggleRight, ArrowDown, Zap, Flag, RotateCcw, Sliders, Play, Pause, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import AutoSendBatchConfig from './components/AutoSendBatchConfig';
import ScheduledQueuePanel from './components/ScheduledQueuePanel';

// ─── RunSequenceJobButton ─────────────────────────────────────────────────────

function RunSequenceJobButton() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ newEnrollments: number; sendsScheduled: number } | null>(null);

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch('/api/sequence-job', { method: 'POST' });
      const data = await res.json();
      setLastResult({ newEnrollments: data.newEnrollments ?? 0, sendsScheduled: data.sendsScheduled ?? 0 });
      toast.success(`Job complete — ${data.newEnrollments ?? 0} new enrollments, ${data.sendsScheduled ?? 0} sends scheduled`);
    } catch {
      toast.error('Sequence job failed — check console');
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      onClick={handleRun}
      disabled={running}
      title="Run auto-enrollment background job now"
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
    >
      {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      {running ? 'Running…' : 'Run Job'}
      {lastResult && !running && (
        <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full">
          +{lastResult.newEnrollments}
        </span>
      )}
    </button>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelType = 'email' | 'sms' | 'call';
type TriggerType = 'delay' | 'stage_change' | 'no_reply' | 'bounce';
type RetryTrigger = 'bounce' | 'no_reply' | 'both';

// ─── NEW: Conditional auto-enrollment trigger ─────────────────────────────────
interface AutoEnrollTrigger {
  enabled: boolean;
  scoreThreshold: number | null;       // enroll when score crosses this value
  scoreDirection: 'above' | 'below';
  stageChangeTo: string | null;        // enroll when stage changes to this
  leadAgeDays: number | null;          // enroll when lead hasn't been contacted in N days
}

function makeAutoEnrollTrigger(): AutoEnrollTrigger {
  return {
    enabled: false,
    scoreThreshold: null,
    scoreDirection: 'above',
    stageChangeTo: null,
    leadAgeDays: null,
  };
}

interface SequenceStep {
  id: string;
  step_number: number;
  channel: ChannelType;
  template_id: string | null;
  template_name: string;
  trigger_type: TriggerType;
  delay_days: number;
  delay_hours: number;
  trigger_stage: string | null;
  retry_on: RetryTrigger | null;
  retry_max: number;
  retry_delay_hours: number;
  subject_override: string;
  notes: string;
}

interface FollowUpSequence {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  steps: SequenceStep[];
  created_at: string;
  updated_at: string;
  auto_enroll_trigger?: AutoEnrollTrigger;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];

const CHANNEL_CONFIG: Record<ChannelType, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: 'Email', icon: <Mail size={13} />, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  sms: { label: 'SMS', icon: <MessageSquare size={13} />, color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  call: { label: 'Call', icon: <Phone size={13} />, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
};

const TRIGGER_CONFIG: Record<TriggerType, { label: string; icon: React.ReactNode }> = {
  delay: { label: 'After delay', icon: <Clock size={12} /> },
  stage_change: { label: 'On stage change', icon: <GitBranch size={12} /> },
  no_reply: { label: 'No reply after', icon: <AlertCircle size={12} /> },
  bounce: { label: 'On bounce', icon: <RefreshCw size={12} /> },
};

function makeStep(stepNumber: number): SequenceStep {
  return {
    id: `step-${Date.now()}-${stepNumber}`,
    step_number: stepNumber,
    channel: 'email',
    template_id: null,
    template_name: '',
    trigger_type: 'delay',
    delay_days: stepNumber === 1 ? 0 : 3,
    delay_hours: 0,
    trigger_stage: null,
    retry_on: null,
    retry_max: 2,
    retry_delay_hours: 24,
    subject_override: '',
    notes: '',
  };
}

function makeSequence(): FollowUpSequence {
  return {
    id: `seq-${Date.now()}`,
    name: '',
    description: '',
    is_active: true,
    steps: [makeStep(1)],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    auto_enroll_trigger: makeAutoEnrollTrigger(),
  };
}

// ─── Step Editor ──────────────────────────────────────────────────────────────

interface StepEditorProps {
  step: SequenceStep;
  index: number;
  total: number;
  templates: EmailTemplate[];
  onChange: (updated: SequenceStep) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function StepEditor({ step, index, total, templates, onChange, onDelete, onMoveUp, onMoveDown }: StepEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const ch = CHANNEL_CONFIG[step.channel];
  const tr = TRIGGER_CONFIG[step.trigger_type];

  function set<K extends keyof SequenceStep>(key: K, val: SequenceStep[K]) {
    onChange({ ...step, [key]: val });
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Step header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {index + 1}
        </div>
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${ch.color}`}>
          {ch.icon}{ch.label}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {tr.icon}{tr.label}
          {step.trigger_type === 'delay' && (step.delay_days > 0 || step.delay_hours > 0) && (
            <span className="ml-1 font-medium text-foreground">
              {step.delay_days > 0 ? `${step.delay_days}d ` : ''}{step.delay_hours > 0 ? `${step.delay_hours}h` : ''}
            </span>
          )}
          {step.trigger_type === 'stage_change' && step.trigger_stage && (
            <span className="ml-1 font-medium text-foreground">→ {step.trigger_stage}</span>
          )}
        </span>
        {step.template_name && (
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[160px]">{step.template_name}</span>
        )}
        {step.retry_on && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[10px] font-medium">
            <RotateCcw size={10} />retry
          </span>
        )}
        <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Move up">
            <ChevronUp size={13} />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Move down">
            <ChevronDown size={13} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors" title="Delete step">
            <Trash2 size={13} />
          </button>
          <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Step body */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Channel */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Channel</label>
              <select
                value={step.channel}
                onChange={e => set('channel', e.target.value as ChannelType)}
                className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="call">Call reminder</option>
              </select>
            </div>

            {/* Trigger type */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Send trigger</label>
              <select
                value={step.trigger_type}
                onChange={e => set('trigger_type', e.target.value as TriggerType)}
                className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="delay">After delay</option>
                <option value="stage_change">On stage change</option>
                <option value="no_reply">No reply after</option>
                <option value="bounce">On bounce</option>
              </select>
            </div>

            {/* Delay / Stage */}
            {(step.trigger_type === 'delay' || step.trigger_type === 'no_reply') && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Days</label>
                  <input
                    type="number" min={0} max={365}
                    value={step.delay_days}
                    onChange={e => set('delay_days', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Hours</label>
                  <input
                    type="number" min={0} max={23}
                    value={step.delay_hours}
                    onChange={e => set('delay_hours', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </>
            )}
            {step.trigger_type === 'stage_change' && (
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Trigger stage</label>
                <select
                  value={step.trigger_stage ?? ''}
                  onChange={e => set('trigger_stage', e.target.value || null)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Select stage —</option>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Template selection */}
          {step.channel !== 'call' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Template</label>
                <select
                  value={step.template_id ?? ''}
                  onChange={e => {
                    const tpl = templates.find(t => t.id === e.target.value);
                    set('template_id', e.target.value || null);
                    set('template_name', tpl?.name ?? '');
                  }}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— No template (custom) —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Subject override</label>
                <input
                  type="text"
                  placeholder="Leave blank to use template subject"
                  value={step.subject_override}
                  onChange={e => set('subject_override', e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* Retry logic */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={13} className="text-orange-500" />
              <span className="text-xs font-semibold text-foreground">Retry logic</span>
              <span className="text-[10px] text-muted-foreground ml-1">— auto-resend on failure</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Retry on</label>
                <select
                  value={step.retry_on ?? ''}
                  onChange={e => set('retry_on', (e.target.value as RetryTrigger) || null)}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Disabled</option>
                  <option value="bounce">Bounce</option>
                  <option value="no_reply">No reply</option>
                  <option value="both">Bounce + No reply</option>
                </select>
              </div>
              {step.retry_on && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Max retries</label>
                    <input
                      type="number" min={1} max={5}
                      value={step.retry_max}
                      onChange={e => set('retry_max', parseInt(e.target.value) || 1)}
                      className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Retry after (hrs)</label>
                    <input
                      type="number" min={1} max={168}
                      value={step.retry_delay_hours}
                      onChange={e => set('retry_delay_hours', parseInt(e.target.value) || 24)}
                      className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Step notes (internal)</label>
            <input
              type="text"
              placeholder="Optional internal note for this step"
              value={step.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Auto-Enroll Trigger Editor ───────────────────────────────────────────────

interface AutoEnrollEditorProps {
  trigger: AutoEnrollTrigger;
  onChange: (t: AutoEnrollTrigger) => void;
}

function AutoEnrollEditor({ trigger, onChange }: AutoEnrollEditorProps) {
  function set<K extends keyof AutoEnrollTrigger>(key: K, val: AutoEnrollTrigger[K]) {
    onChange({ ...trigger, [key]: val });
  }

  const hasAnyCondition = trigger.scoreThreshold !== null || trigger.stageChangeTo !== null || trigger.leadAgeDays !== null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Sliders size={13} className="text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Conditional Auto-Enrollment</h3>
            <p className="text-[11px] text-muted-foreground">Auto-enroll leads when any condition is met — no manual action needed</p>
          </div>
        </div>
        <button
          onClick={() => set('enabled', !trigger.enabled)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            trigger.enabled
              ? 'bg-violet-500/10 border-violet-500/30 text-violet-600'
              : 'bg-muted border-border text-muted-foreground'
          }`}
        >
          {trigger.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {trigger.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {trigger.enabled && (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground bg-violet-500/5 border border-violet-500/10 rounded-lg px-3 py-2">
            Leads matching <strong>any</strong> active condition below will be automatically enrolled in this sequence.
          </p>

          {/* Condition 1: Score threshold */}
          <div className="p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="score-cond"
                checked={trigger.scoreThreshold !== null}
                onChange={e => set('scoreThreshold', e.target.checked ? 75 : null)}
                className="w-3.5 h-3.5 accent-primary"
              />
              <label htmlFor="score-cond" className="text-xs font-semibold text-foreground cursor-pointer">
                Score crosses threshold
              </label>
            </div>
            {trigger.scoreThreshold !== null && (
              <div className="flex items-center gap-3 ml-5">
                <select
                  value={trigger.scoreDirection}
                  onChange={e => set('scoreDirection', e.target.value as 'above' | 'below')}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="above">Score goes above</option>
                  <option value="below">Score drops below</option>
                </select>
                <input
                  type="number" min={0} max={100}
                  value={trigger.scoreThreshold}
                  onChange={e => set('scoreThreshold', parseInt(e.target.value) || 0)}
                  className="w-20 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">points</span>
              </div>
            )}
          </div>

          {/* Condition 2: Stage change */}
          <div className="p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="stage-cond"
                checked={trigger.stageChangeTo !== null}
                onChange={e => set('stageChangeTo', e.target.checked ? 'Contacted' : null)}
                className="w-3.5 h-3.5 accent-primary"
              />
              <label htmlFor="stage-cond" className="text-xs font-semibold text-foreground cursor-pointer">
                Stage changes to
              </label>
            </div>
            {trigger.stageChangeTo !== null && (
              <div className="ml-5">
                <select
                  value={trigger.stageChangeTo}
                  onChange={e => set('stageChangeTo', e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Condition 3: Lead age without contact */}
          <div className="p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="age-cond"
                checked={trigger.leadAgeDays !== null}
                onChange={e => set('leadAgeDays', e.target.checked ? 14 : null)}
                className="w-3.5 h-3.5 accent-primary"
              />
              <label htmlFor="age-cond" className="text-xs font-semibold text-foreground cursor-pointer">
                Lead ages without contact
              </label>
            </div>
            {trigger.leadAgeDays !== null && (
              <div className="flex items-center gap-3 ml-5">
                <span className="text-xs text-muted-foreground">No contact for more than</span>
                <input
                  type="number" min={1} max={365}
                  value={trigger.leadAgeDays}
                  onChange={e => set('leadAgeDays', parseInt(e.target.value) || 1)}
                  className="w-20 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            )}
          </div>

          {!hasAnyCondition && (
            <p className="text-[11px] text-amber-600 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠ Enable at least one condition above, or auto-enrollment won't trigger.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sequence Form ─────────────────────────────────────────────────────────────

interface SequenceFormProps {
  initial: FollowUpSequence;
  templates: EmailTemplate[];
  onSave: (seq: FollowUpSequence) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function SequenceForm({ initial, templates, onSave, onCancel, saving }: SequenceFormProps) {
  const [seq, setSeq] = useState<FollowUpSequence>({
    ...initial,
    auto_enroll_trigger: initial.auto_enroll_trigger ?? makeAutoEnrollTrigger(),
  });

  function setField<K extends keyof FollowUpSequence>(key: K, val: FollowUpSequence[K]) {
    setSeq(s => ({ ...s, [key]: val }));
  }

  function addStep() {
    setSeq(s => ({
      ...s,
      steps: [...s.steps, makeStep(s.steps.length + 1)],
    }));
  }

  function updateStep(idx: number, updated: SequenceStep) {
    setSeq(s => {
      const steps = [...s.steps];
      steps[idx] = updated;
      return { ...s, steps };
    });
  }

  function deleteStep(idx: number) {
    setSeq(s => ({
      ...s,
      steps: s.steps.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step_number: i + 1 })),
    }));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setSeq(s => {
      const steps = [...s.steps];
      const target = idx + dir;
      if (target < 0 || target >= steps.length) return s;
      [steps[idx], steps[target]] = [steps[target], steps[idx]];
      return { ...s, steps: steps.map((st, i) => ({ ...st, step_number: i + 1 })) };
    });
  }

  const isValid = seq.name.trim().length > 0 && seq.steps.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Sequence meta */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Sequence details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Name *</label>
            <input
              type="text"
              placeholder="e.g. Initial outreach → follow-up cadence"
              value={seq.name}
              onChange={e => setField('name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</label>
            <input
              type="text"
              placeholder="Optional description"
              value={seq.description}
              onChange={e => setField('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setField('is_active', !seq.is_active)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${seq.is_active ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-muted border-border text-muted-foreground'}`}
          >
            {seq.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {seq.is_active ? 'Active' : 'Inactive'}
          </button>
          <span className="text-xs text-muted-foreground">Inactive sequences won't trigger automatically</span>
        </div>
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Steps <span className="text-muted-foreground font-normal">({seq.steps.length})</span>
          </h3>
          <button
            onClick={addStep}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} />
            Add step
          </button>
        </div>

        <div className="space-y-2">
          {seq.steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <StepEditor
                step={step}
                index={idx}
                total={seq.steps.length}
                templates={templates}
                onChange={updated => updateStep(idx, updated)}
                onDelete={() => deleteStep(idx)}
                onMoveUp={() => moveStep(idx, -1)}
                onMoveDown={() => moveStep(idx, 1)}
              />
              {idx < seq.steps.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown size={14} className="text-muted-foreground/40" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {seq.steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-xl text-center">
            <Zap size={24} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No steps yet — add your first step above</p>
          </div>
        )}
      </div>

      {/* Auto-enrollment triggers */}
      <AutoEnrollEditor
        trigger={seq.auto_enroll_trigger ?? makeAutoEnrollTrigger()}
        onChange={t => setSeq(s => ({ ...s, auto_enroll_trigger: t }))}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all">
          Cancel
        </button>
        <button
          onClick={() => onSave(seq)}
          disabled={!isValid || saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save sequence'}
        </button>
      </div>
    </div>
  );
}

// ─── Sequence Card ─────────────────────────────────────────────────────────────

interface SequenceCardProps {
  seq: FollowUpSequence;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onPause: () => void;
  onResume: () => void;
  onClone: () => void;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}

function SequenceCard({ seq, onEdit, onDelete, onDuplicate, onToggle, onPause, onResume, onClone, selected, onSelect }: SequenceCardProps) {
  const channelCounts = seq.steps.reduce<Record<string, number>>((acc, s) => {
    acc[s.channel] = (acc[s.channel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={`bg-card border rounded-xl p-4 hover:border-primary/30 transition-all group ${selected ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        {/* Checkbox for bulk select */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(e.target.checked)}
            className="w-4 h-4 accent-primary shrink-0 mt-0.5 cursor-pointer"
            onClick={e => e.stopPropagation()}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold text-foreground truncate">{seq.name}</h3>
              <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${seq.is_active ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
                {seq.is_active ? 'Active' : 'Paused'}
              </span>
            </div>
            {seq.description && <p className="text-xs text-muted-foreground truncate">{seq.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Pause / Resume */}
          {seq.is_active ? (
            <button
              onClick={onPause}
              title="Pause sequence"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20 transition-all"
            >
              <Pause size={11} />
              Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              title="Resume sequence"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20 transition-all"
            >
              <Play size={11} />
              Resume
            </button>
          )}
          {/* Clone */}
          <button
            onClick={onClone}
            title="Clone as new template"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-500/20 transition-all"
          >
            <Copy size={11} />
            Clone
          </button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button onClick={onDuplicate} title="Duplicate (edit copy)" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
              <Copy size={14} />
            </button>
            <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
              <Edit3 size={14} />
            </button>
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Step summary */}
      <div className="flex items-center gap-2 flex-wrap ml-7">
        <span className="text-xs text-muted-foreground">{seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}</span>
        <span className="text-muted-foreground/40">·</span>
        {Object.entries(channelCounts).map(([ch, count]) => {
          const cfg = CHANNEL_CONFIG[ch as ChannelType];
          return (
            <span key={ch} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
              {cfg.icon}{count} {cfg.label}
            </span>
          );
        })}
        {seq.steps.some(s => s.retry_on) && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <RotateCcw size={10} />retry
          </span>
        )}
      </div>

      {/* Mini timeline */}
      <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 ml-7">
        {seq.steps.map((step, idx) => {
          const cfg = CHANNEL_CONFIG[step.channel];
          return (
            <React.Fragment key={step.id}>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border shrink-0 ${cfg.color}`}>
                {cfg.icon}
                <span>
                  {step.trigger_type === 'delay' && step.delay_days > 0 ? `+${step.delay_days}d` : ''}
                  {step.trigger_type === 'stage_change' ? <Flag size={9} /> : ''}
                  {step.trigger_type === 'no_reply' ? `NR+${step.delay_days}d` : ''}
                  {step.trigger_type === 'bounce' ? 'bounce' : ''}
                </span>
              </div>
              {idx < seq.steps.length - 1 && <span className="text-muted-foreground/30 text-[10px] shrink-0">→</span>}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FollowUpSequencesPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingSeq, setEditingSeq] = useState<FollowUpSequence | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, seqRes] = await Promise.all([
        supabase.from('email_templates').select('id, name, subject, category').order('name'),
        supabase.from('follow_up_sequences').select('*').eq('owner_user_id', user?.id).order('created_at', { ascending: false }),
      ]);
      if (tplRes.data) setTemplates(tplRes.data as EmailTemplate[]);
      if (seqRes.data) {
        setSequences(seqRes.data.map((r: any) => ({
          ...r,
          steps: Array.isArray(r.steps) ? r.steps : [],
        })));
      }
    } catch {
      // Use local state only
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSave(seq: FollowUpSequence) {
    setSaving(true);
    try {
      const payload = {
        id: seq.id,
        owner_user_id: user?.id,
        name: seq.name,
        description: seq.description,
        is_active: seq.is_active,
        steps: seq.steps,
        updated_at: new Date().toISOString(),
      };

      const { error } = mode === 'create' ? await supabase.from('follow_up_sequences').upsert({ ...payload, created_at: seq.created_at })
        : await supabase.from('follow_up_sequences').update(payload).eq('id', seq.id);

      if (error) throw error;

      toast.success(mode === 'create' ? 'Sequence created' : 'Sequence updated');
      setMode('list');
      setEditingSeq(null);
      await loadData();
    } catch (err: any) {
      // Fallback: store locally if table doesn't exist yet
      if (mode === 'create') {
        setSequences(prev => [seq, ...prev]);
        toast.success('Sequence saved locally (DB table pending migration)');
      } else {
        setSequences(prev => prev.map(s => s.id === seq.id ? seq : s));
        toast.success('Sequence updated locally');
      }
      setMode('list');
      setEditingSeq(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await supabase.from('follow_up_sequences').delete().eq('id', id);
    } catch { /* silent */ }
    setSequences(prev => prev.filter(s => s.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success('Sequence deleted');
  }

  function handleDuplicate(seq: FollowUpSequence) {
    const copy: FollowUpSequence = {
      ...seq,
      id: `seq-${Date.now()}`,
      name: `${seq.name} (copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: seq.steps.map(s => ({ ...s, id: `step-${Date.now()}-${s.step_number}` })),
    };
    setEditingSeq(copy);
    setMode('create');
  }

  // Clone: opens create form with copy prefixed "Clone of …" for A/B setup
  function handleClone(seq: FollowUpSequence) {
    const copy: FollowUpSequence = {
      ...seq,
      id: `seq-${Date.now()}`,
      name: `Clone of ${seq.name}`,
      description: seq.description ? `A/B variant of: ${seq.description}` : `A/B variant of ${seq.name}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      steps: seq.steps.map(s => ({ ...s, id: `step-${Date.now()}-${s.step_number}` })),
    };
    setEditingSeq(copy);
    setMode('create');
    toast.info('Cloned — edit and save to create your A/B variant');
  }

  async function handleToggle(seq: FollowUpSequence) {
    const updated = { ...seq, is_active: !seq.is_active };
    try {
      await supabase.from('follow_up_sequences').update({ is_active: updated.is_active }).eq('id', seq.id);
    } catch { /* silent */ }
    setSequences(prev => prev.map(s => s.id === seq.id ? updated : s));
    toast.success(updated.is_active ? 'Sequence activated' : 'Sequence deactivated');
  }

  async function handlePause(seq: FollowUpSequence) {
    const updated = { ...seq, is_active: false };
    try {
      await supabase.from('follow_up_sequences').update({ is_active: false }).eq('id', seq.id);
    } catch { /* silent */ }
    setSequences(prev => prev.map(s => s.id === seq.id ? updated : s));
    toast.success(`"${seq.name}" paused — no new sends will trigger`);
  }

  async function handleResume(seq: FollowUpSequence) {
    const updated = { ...seq, is_active: true };
    try {
      await supabase.from('follow_up_sequences').update({ is_active: true }).eq('id', seq.id);
    } catch { /* silent */ }
    setSequences(prev => prev.map(s => s.id === seq.id ? updated : s));
    toast.success(`"${seq.name}" resumed`);
  }

  // Bulk actions
  async function handleBulkPause() {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          supabase.from('follow_up_sequences').update({ is_active: false }).eq('id', id).then(() => {})
        )
      );
    } catch { /* silent */ }
    setSequences(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, is_active: false } : s));
    toast.success(`${selectedIds.size} sequence${selectedIds.size !== 1 ? 's' : ''} paused`);
    setSelectedIds(new Set());
    setBulkActing(false);
  }

  async function handleBulkResume() {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          supabase.from('follow_up_sequences').update({ is_active: true }).eq('id', id).then(() => {})
        )
      );
    } catch { /* silent */ }
    setSequences(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, is_active: true } : s));
    toast.success(`${selectedIds.size} sequence${selectedIds.size !== 1 ? 's' : ''} resumed`);
    setSelectedIds(new Set());
    setBulkActing(false);
  }

  const filtered = sequences.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = sequences.filter(s => s.is_active).length;
  const pausedCount = sequences.filter(s => !s.is_active).length;
  const selectedActive = filtered.filter(s => selectedIds.has(s.id) && s.is_active).length;
  const selectedPaused = filtered.filter(s => selectedIds.has(s.id) && !s.is_active).length;

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  }

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Follow-Up Sequences</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sequences.length} sequence{sequences.length !== 1 ? 's' : ''} · <span className="text-green-600 font-medium">{activeCount} active</span>
              {pausedCount > 0 && <span className="text-amber-600 font-medium"> · {pausedCount} paused</span>}
            </p>
          </div>
          {mode === 'list' && (
            <div className="flex items-center gap-2">
              <RunSequenceJobButton />
              <button
                onClick={() => { setEditingSeq(makeSequence()); setMode('create'); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus size={15} />
                New sequence
              </button>
            </div>
          )}
          {mode !== 'list' && (
            <button
              onClick={() => { setMode('list'); setEditingSeq(null); }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all"
            >
              <X size={14} />
              Back to list
            </button>
          )}
        </div>

        {/* Create / Edit form */}
        {(mode === 'create' || mode === 'edit') && editingSeq && (
          <SequenceForm
            initial={editingSeq}
            templates={templates}
            onSave={handleSave}
            onCancel={() => { setMode('list'); setEditingSeq(null); }}
            saving={saving}
          />
        )}

        {/* List */}
        {mode === 'list' && (
          <>
            {/* Search + Bulk Bar */}
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search sequences…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full sm:w-72 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {filtered.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <CheckSquare size={13} />
                    {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {/* Bulk Action Bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedActive > 0 && (
                      <button
                        onClick={handleBulkPause}
                        disabled={bulkActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50"
                      >
                        {bulkActing ? <Loader2 size={11} className="animate-spin" /> : <Pause size={11} />}
                        Pause {selectedActive} Active
                      </button>
                    )}
                    {selectedPaused > 0 && (
                      <button
                        onClick={handleBulkResume}
                        disabled={bulkActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-700 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-50"
                      >
                        {bulkActing ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                        Resume {selectedPaused} Paused
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all"
                    >
                      <X size={11} />
                      Clear
                    </button>
                  </div>
                  <div className="ml-auto text-[11px] text-muted-foreground">
                    {selectedActive > 0 && `${selectedActive} active`}
                    {selectedActive > 0 && selectedPaused > 0 && ' · '}
                    {selectedPaused > 0 && `${selectedPaused} paused`}
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl text-center">
                <GitBranch size={32} className="text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {sequences.length === 0 ? 'No sequences yet' : 'No sequences match your search'}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {sequences.length === 0 ? 'Create your first follow-up sequence to automate outreach' : 'Try a different search term'}
                </p>
                {sequences.length === 0 && (
                  <button
                    onClick={() => { setEditingSeq(makeSequence()); setMode('create'); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={14} />
                    Create first sequence
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filtered.map(seq => (
                  <div key={seq.id} className="space-y-2">
                    <SequenceCard
                      seq={seq}
                      onEdit={() => { setEditingSeq(seq); setMode('edit'); }}
                      onDelete={() => handleDelete(seq.id)}
                      onDuplicate={() => handleDuplicate(seq)}
                      onToggle={() => handleToggle(seq)}
                      onPause={() => handlePause(seq)}
                      onResume={() => handleResume(seq)}
                      onClone={() => handleClone(seq)}
                      selected={selectedIds.has(seq.id)}
                      onSelect={checked => {
                        setSelectedIds(prev => {
                          const n = new Set(prev);
                          checked ? n.add(seq.id) : n.delete(seq.id);
                          return n;
                        });
                      }}
                    />
                    <AutoSendBatchConfig
                      sequenceId={seq.id}
                      sequenceName={seq.name}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Scheduled SMS Queue — global view */}
            {!loading && sequences.length > 0 && (
              <div className="mt-6">
                <ScheduledQueuePanel />
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
