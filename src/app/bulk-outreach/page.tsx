'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Send, MessageSquare, Calendar, Plus, Trash2, Loader2, BarChart2, Play, Pause, ArrowRight, GitBranch, Shield, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp, X, Ban, Copy, BookOpen, Tag } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  stage?: string;
  prospect_score?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  assigned_agent_id?: string;
}

interface Agent {
  id: string;
  full_name?: string;
  email?: string;
  active_leads?: number;
}

interface OutreachTemplate {
  id: string;
  name: string;
  type: 'sms' | 'call';
  content: string;
  variables: string[];
}

interface ScheduledBatch {
  id: string;
  templateId: string;
  templateName: string;
  type: 'sms' | 'call';
  leadIds: string[];
  agentId: string;
  agentName: string;
  scheduledAt: string;
  status: 'pending' | 'running' | 'completed' | 'paused';
  sent: number;
  total: number;
  responses: number;
}

// ─── SMS Sequence Types ───────────────────────────────────────────────────────

type StepType = 'sms' | 'delay' | 'branch';
type BranchCondition = 'replied' | 'no_reply' | 'opted_out' | 'dnc';
type TcpaCheck = 'opt_in_confirmed' | 'consent_recorded' | 'quiet_hours' | 'dnc_scrubbed';

interface SequenceStep {
  id: string;
  type: StepType;
  label: string;
  // SMS step
  message?: string;
  tcpaChecks?: TcpaCheck[];
  // Delay step
  delayHours?: number;
  // Branch step
  condition?: BranchCondition;
  truePath?: string; // step id
  falsePath?: string; // step id
}

interface SmsSequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  autoPauseDnc: boolean;
  autoPauseUnsubscribe: boolean;
  status: 'draft' | 'active' | 'paused';
  createdAt: string;
  leadCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed', 'Lost'];
const SCORE_RANGES = [
  { label: 'All', min: 0, max: 100 },
  { label: '80+', min: 80, max: 100 },
  { label: '60–79', min: 60, max: 79 },
  { label: '40–59', min: 40, max: 59 },
  { label: 'Under 40', min: 0, max: 39 },
];

const DEFAULT_TEMPLATES: OutreachTemplate[] = [
  { id: 'tpl-1', name: 'Qualified Lead Intro', type: 'sms', content: 'Hi {{contact_name}}, this is {{agent_name}} from TRAVLR. I noticed your property at {{address}} and wanted to discuss a potential opportunity. Would you have 10 minutes this week?', variables: ['contact_name', 'agent_name', 'address'] },
  { id: 'tpl-2', name: 'Follow-Up Check-In', type: 'sms', content: 'Hi {{contact_name}}, just following up on our previous conversation about {{address}}. Have you had a chance to consider our proposal?', variables: ['contact_name', 'address'] },
  { id: 'tpl-3', name: 'Call Script — Intro', type: 'call', content: 'Hello, may I speak with {{contact_name}}? This is {{agent_name}} calling about your property at {{address}}.', variables: ['contact_name', 'agent_name', 'address'] },
];

const TCPA_CHECK_LABELS: Record<TcpaCheck, string> = {
  opt_in_confirmed: 'SMS Opt-In Confirmed',
  consent_recorded: 'TCPA Consent Recorded',
  quiet_hours: 'Quiet Hours Check (8am–9pm)',
  dnc_scrubbed: 'DNC Registry Scrubbed',
};

const BRANCH_CONDITION_LABELS: Record<BranchCondition, string> = {
  replied: 'Lead Replied',
  no_reply: 'No Reply (48h)',
  opted_out: 'Opted Out / STOP',
  dnc: 'DNC Flag Detected',
};

const DEFAULT_SEQUENCE: SmsSequence = {
  id: 'seq-default',
  name: 'Standard Outreach Sequence',
  autoPauseDnc: true,
  autoPauseUnsubscribe: true,
  status: 'draft',
  createdAt: new Date().toISOString(),
  steps: [
    {
      id: 'step-1', type: 'sms', label: 'Initial SMS',
      message: 'Hi {{contact_name}}, this is {{agent_name}} from TRAVLR. Your property at {{address}} caught our attention — would you be open to a quick chat?',
      tcpaChecks: ['opt_in_confirmed', 'dnc_scrubbed', 'quiet_hours'],
    },
    { id: 'step-2', type: 'delay', label: 'Wait 48 hours', delayHours: 48 },
    {
      id: 'step-3', type: 'branch', label: 'Did they reply?',
      condition: 'replied', truePath: 'step-4', falsePath: 'step-5',
    },
    {
      id: 'step-4', type: 'sms', label: 'Engaged Follow-Up',
      message: 'Great to hear from you, {{contact_name}}! I\'d love to schedule a quick call to discuss how we can help with {{address}}. What time works for you?',
      tcpaChecks: ['consent_recorded', 'quiet_hours'],
    },
    {
      id: 'step-5', type: 'sms', label: 'No-Reply Follow-Up',
      message: 'Hi {{contact_name}}, just a quick follow-up about {{address}}. We have a program that could be a great fit. Reply STOP to opt out.',
      tcpaChecks: ['opt_in_confirmed', 'dnc_scrubbed', 'quiet_hours'],
    },
    { id: 'step-6', type: 'delay', label: 'Wait 72 hours', delayHours: 72 },
    {
      id: 'step-7', type: 'sms', label: 'Close / Final Touch',
      message: 'Last message from us, {{contact_name}} — if you\'d ever like to explore options for {{address}}, we\'re here. Reply STOP to unsubscribe.',
      tcpaChecks: ['opt_in_confirmed', 'consent_recorded', 'dnc_scrubbed', 'quiet_hours'],
    },
  ],
};

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({ step, index, onUpdate, onDelete }: {
  step: SequenceStep;
  index: number;
  onUpdate: (id: string, updates: Partial<SequenceStep>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const stepColors: Record<StepType, string> = {
    sms: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
    delay: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    branch: 'bg-purple-500/10 border-purple-500/30 text-purple-600',
  };

  const stepIcons: Record<StepType, React.ElementType> = {
    sms: MessageSquare,
    delay: Clock,
    branch: GitBranch,
  };

  const Icon = stepIcons[step.type];

  return (
    <div className="relative">
      {index > 0 && (
        <div className="flex justify-center mb-1">
          <div className="w-px h-4 bg-border" />
        </div>
      )}
      <div className={`border rounded-xl overflow-hidden ${step.type === 'sms' ? 'border-blue-500/20' : step.type === 'delay' ? 'border-amber-500/20' : 'border-purple-500/20'}`}>
        <div className="flex items-center gap-3 p-3 bg-card cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${stepColors[step.type]}`}>
            <Icon size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Step {index + 1}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${stepColors[step.type]}`}>
                {step.type.toUpperCase()}
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">{step.label}</p>
            {step.type === 'sms' && step.message && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{step.message.slice(0, 60)}…</p>
            )}
            {step.type === 'delay' && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Wait {step.delayHours}h before next step</p>
            )}
            {step.type === 'branch' && step.condition && (
              <p className="text-[10px] text-muted-foreground mt-0.5">If: {BRANCH_CONDITION_LABELS[step.condition]}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {step.type === 'sms' && step.tcpaChecks && step.tcpaChecks.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <Shield size={9} className="text-emerald-600" />
                <span className="text-[9px] font-semibold text-emerald-600">{step.tcpaChecks.length} checks</span>
              </div>
            )}
            <button onClick={e => { e.stopPropagation(); onDelete(step.id); }} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 size={12} />
            </button>
            {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border p-3 bg-muted/20 space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Step Label</label>
              <input
                value={step.label}
                onChange={e => onUpdate(step.id, { label: e.target.value })}
                className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {step.type === 'sms' && (
              <>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message</label>
                  <textarea
                    value={step.message || ''}
                    onChange={e => onUpdate(step.id, { message: e.target.value })}
                    rows={3}
                    className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="Use {{contact_name}}, {{address}}, {{agent_name}}"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">{(step.message || '').length}/160 chars · Include STOP opt-out on final messages</p>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">TCPA Compliance Checks</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(TCPA_CHECK_LABELS) as TcpaCheck[]).map(check => {
                      const active = step.tcpaChecks?.includes(check);
                      return (
                        <button
                          key={check}
                          onClick={() => {
                            const current = step.tcpaChecks || [];
                            onUpdate(step.id, { tcpaChecks: active ? current.filter(c => c !== check) : [...current, check] });
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                        >
                          {active ? <CheckCircle size={10} className="text-emerald-600" /> : <Shield size={10} />}
                          {TCPA_CHECK_LABELS[check]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {step.type === 'delay' && (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Delay (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={step.delayHours || 24}
                  onChange={e => onUpdate(step.id, { delayHours: Number(e.target.value) })}
                  className="mt-1 w-32 text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {step.type === 'branch' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Branch Condition</label>
                  <select
                    value={step.condition || 'replied'}
                    onChange={e => onUpdate(step.id, { condition: e.target.value as BranchCondition })}
                    className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                  >
                    {(Object.keys(BRANCH_CONDITION_LABELS) as BranchCondition[]).map(c => (
                      <option key={c} value={c}>{BRANCH_CONDITION_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">✓ TRUE PATH</p>
                    <p className="text-[10px] text-muted-foreground">Continue to next engaged step</p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">✗ FALSE PATH</p>
                    <p className="text-[10px] text-muted-foreground">Continue to fallback step</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sequence Builder ─────────────────────────────────────────────────────────

function SequenceBuilder({ sequence, onSave }: { sequence: SmsSequence; onSave: (s: SmsSequence) => void }) {
  const [draft, setDraft] = useState<SmsSequence>(sequence);

  function updateStep(id: string, updates: Partial<SequenceStep>) {
    setDraft(prev => ({ ...prev, steps: prev.steps.map(s => s.id === id ? { ...s, ...updates } : s) }));
  }

  function deleteStep(id: string) {
    setDraft(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== id) }));
  }

  function addStep(type: StepType) {
    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      type,
      label: type === 'sms' ? 'New SMS' : type === 'delay' ? 'Wait' : 'Branch',
      ...(type === 'sms' ? { message: '', tcpaChecks: ['opt_in_confirmed', 'dnc_scrubbed'] } : {}),
      ...(type === 'delay' ? { delayHours: 24 } : {}),
      ...(type === 'branch' ? { condition: 'replied' as BranchCondition } : {}),
    };
    setDraft(prev => ({ ...prev, steps: [...prev.steps, newStep] }));
  }

  const allTcpaPassed = draft.steps.filter(s => s.type === 'sms').every(s => (s.tcpaChecks?.length ?? 0) >= 2);

  return (
    <div className="space-y-4">
      {/* Sequence header */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <input
              value={draft.name}
              onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
              className="text-sm font-semibold bg-transparent border-none text-foreground focus:outline-none w-full"
              placeholder="Sequence name…"
            />
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${draft.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : draft.status === 'paused' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
            {draft.status.toUpperCase()}
          </span>
        </div>

        {/* Auto-pause toggles */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setDraft(prev => ({ ...prev, autoPauseDnc: !prev.autoPauseDnc }))}
              className={`w-8 h-4 rounded-full transition-colors relative ${draft.autoPauseDnc ? 'bg-red-500' : 'bg-muted'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${draft.autoPauseDnc ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-foreground flex items-center gap-1">
              <Ban size={11} className="text-red-500" />
              Auto-pause on DNC
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setDraft(prev => ({ ...prev, autoPauseUnsubscribe: !prev.autoPauseUnsubscribe }))}
              className={`w-8 h-4 rounded-full transition-colors relative ${draft.autoPauseUnsubscribe ? 'bg-red-500' : 'bg-muted'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${draft.autoPauseUnsubscribe ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-foreground flex items-center gap-1">
              <X size={11} className="text-red-500" />
              Auto-pause on STOP/Unsubscribe
            </span>
          </label>
        </div>

        {/* Compliance status */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${allTcpaPassed ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700' : 'bg-amber-500/5 border-amber-500/20 text-amber-700'}`}>
          {allTcpaPassed ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
          {allTcpaPassed ? 'All SMS steps have TCPA compliance checks configured' : 'Some SMS steps are missing TCPA compliance checks — review before activating'}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-0">
        {draft.steps.map((step, i) => (
          <StepCard key={step.id} step={step} index={i} onUpdate={updateStep} onDelete={deleteStep} />
        ))}
      </div>

      {/* Add step buttons */}
      <div className="flex gap-2 flex-wrap">
        {(['sms', 'delay', 'branch'] as StepType[]).map(type => (
          <button
            key={type}
            onClick={() => addStep(type)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            <Plus size={11} />
            Add {type === 'sms' ? 'SMS Step' : type === 'delay' ? 'Delay' : 'Branch'}
          </button>
        ))}
      </div>

      {/* Save */}
      <div className="flex gap-2">
        <button
          onClick={() => { onSave({ ...draft, status: 'active' }); toast.success('Sequence activated'); }}
          disabled={!allTcpaPassed}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40"
        >
          <Play size={12} />
          Activate Sequence
        </button>
        <button
          onClick={() => { onSave({ ...draft, status: 'draft' }); toast.success('Sequence saved as draft'); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
        >
          Save Draft
        </button>
      </div>
    </div>
  );
}

// ─── Pre-built Template Library ───────────────────────────────────────────────

type TemplateCategory = 'initial_outreach' | 'follow_up' | 'objection_handling' | 'close';

interface PresetTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  type: 'sms' | 'call';
  content: string;
  variables: string[];
}

const CATEGORY_META: Record<TemplateCategory, { label: string; color: string; icon: React.ElementType }> = {
  initial_outreach: { label: 'Initial Outreach', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Send },
  follow_up:        { label: 'Follow-Up',        color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
  objection_handling: { label: 'Objection Handling', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Shield },
  close:            { label: 'Close',            color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
};

const PRESET_TEMPLATES: PresetTemplate[] = [
  // ── Initial Outreach ──
  {
    id: 'pre-io-1', category: 'initial_outreach', type: 'sms', name: 'Friendly Intro — SMS',
    content: 'Hi {{contact_name}}, this is {{agent_name}} from TRAVLR. I came across your property at {{address}} and would love to chat about a potential opportunity. Would you have 10 minutes this week?',
    variables: ['contact_name', 'agent_name', 'address'],
  },
  {
    id: 'pre-io-2', category: 'initial_outreach', type: 'call', name: 'Cold Call Opener',
    content: 'Hello, may I speak with {{contact_name}}? Hi, this is {{agent_name}} from TRAVLR. I\'m reaching out about your property at {{address}} — we work with property owners in your area to maximize rental income. Is now a good time?',
    variables: ['contact_name', 'agent_name', 'address'],
  },
  {
    id: 'pre-io-3', category: 'initial_outreach', type: 'sms', name: 'High-Score Lead Intro',
    content: 'Hi {{contact_name}}, {{agent_name}} here from TRAVLR. Your property at {{address}} scored highly in our market analysis — we\'d love to share what we found. Reply YES to learn more or STOP to opt out.',
    variables: ['contact_name', 'agent_name', 'address'],
  },
  // ── Follow-Up ──
  {
    id: 'pre-fu-1', category: 'follow_up', type: 'sms', name: '48h No-Reply Follow-Up',
    content: 'Hi {{contact_name}}, just circling back on my message about {{address}}. We have a program that could be a great fit — happy to answer any questions. Reply STOP to opt out.',
    variables: ['contact_name', 'address'],
  },
  {
    id: 'pre-fu-2', category: 'follow_up', type: 'sms', name: 'Engaged Lead Check-In',
    content: 'Hi {{contact_name}}, great connecting earlier! I wanted to follow up on our conversation about {{address}}. Have you had a chance to review the details we discussed?',
    variables: ['contact_name', 'address'],
  },
  {
    id: 'pre-fu-3', category: 'follow_up', type: 'call', name: 'Post-Proposal Follow-Up Call',
    content: 'Hi {{contact_name}}, this is {{agent_name}} from TRAVLR. I\'m following up on the proposal we sent for {{address}}. Do you have any questions, or would you like to move forward?',
    variables: ['contact_name', 'agent_name', 'address'],
  },
  // ── Objection Handling ──
  {
    id: 'pre-oh-1', category: 'objection_handling', type: 'sms', name: 'Not Interested — Reframe',
    content: 'Hi {{contact_name}}, totally understand! Many owners feel the same way initially. We\'ve helped similar properties in {{city}} increase net income by 20–35%. Would a quick 5-min call change your mind?',
    variables: ['contact_name', 'city'],
  },
  {
    id: 'pre-oh-2', category: 'objection_handling', type: 'call', name: 'Already Have a Manager — Script',
    content: 'I completely understand, {{contact_name}}. Many of our current clients switched from other managers. May I ask — are you fully satisfied with your current returns on {{address}}? We often find a 15–25% gap we can close.',
    variables: ['contact_name', 'address'],
  },
  {
    id: 'pre-oh-3', category: 'objection_handling', type: 'sms', name: 'Too Busy — Soft Touch',
    content: 'No worries, {{contact_name}}! I\'ll keep this brief — we handle everything for {{address}} so you don\'t have to. When\'s a better time to connect? Even 10 minutes could be worth it.',
    variables: ['contact_name', 'address'],
  },
  // ── Close ──
  {
    id: 'pre-cl-1', category: 'close', type: 'sms', name: 'Final Close — SMS',
    content: 'Hi {{contact_name}}, last message from us about {{address}}. We\'re ready to move forward whenever you are — just reply YES and we\'ll handle the rest. Reply STOP to unsubscribe.',
    variables: ['contact_name', 'address'],
  },
  {
    id: 'pre-cl-2', category: 'close', type: 'call', name: 'Verbal Close Script',
    content: 'Based on everything we\'ve discussed, {{contact_name}}, I think {{address}} is a perfect fit for our program. I can have the agreement over to you today — does that work?',
    variables: ['contact_name', 'address'],
  },
  {
    id: 'pre-cl-3', category: 'close', type: 'sms', name: 'Urgency Close',
    content: 'Hi {{contact_name}}, we have limited availability in your area for {{address}} this month. Locking in now ensures priority onboarding. Ready to proceed? Reply YES or call {{agent_phone}}.',
    variables: ['contact_name', 'address', 'agent_phone'],
  },
];

// ─── Preset Template Picker ───────────────────────────────────────────────────

function PresetTemplatePicker({ onCopy }: { onCopy: (tpl: PresetTemplate) => void }) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sms' | 'call'>('all');

  const filtered = PRESET_TEMPLATES.filter(t => {
    const catMatch = activeCategory === 'all' || t.category === activeCategory;
    const typeMatch = typeFilter === 'all' || t.type === typeFilter;
    return catMatch && typeMatch;
  });

  return (
    <div className="space-y-3">
      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border font-semibold transition-all ${activeCategory === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
        >
          <BookOpen size={9} /> All
        </button>
        {(Object.keys(CATEGORY_META) as TemplateCategory[]).map(cat => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border font-semibold transition-all ${activeCategory === cat ? `${meta.color} border-current` : 'border-border text-muted-foreground hover:border-primary/40'}`}
            >
              <Icon size={9} /> {meta.label}
            </button>
          );
        })}
      </div>
      {/* Type filter */}
      <div className="flex gap-1">
        {(['all', 'sms', 'call'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-all ${typeFilter === t ? 'bg-muted text-foreground border-border' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>
            {t === 'all' ? 'All Types' : t === 'sms' ? 'SMS' : 'Call Script'}
          </button>
        ))}
      </div>
      {/* Template list */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {filtered.map(tpl => {
          const meta = CATEGORY_META[tpl.category];
          const CatIcon = meta.icon;
          return (
            <div key={tpl.id} className="bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-all group">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${meta.color}`}>
                    <CatIcon size={8} /> {meta.label}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tpl.type === 'sms' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
                    {tpl.type.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => onCopy(tpl)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Copy size={9} /> Copy & Edit
                </button>
              </div>
              <p className="text-xs font-semibold text-foreground mb-1">{tpl.name}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-2">{tpl.content}</p>
              {tpl.variables.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Tag size={8} className="text-muted-foreground" />
                  {tpl.variables.map(v => (
                    <span key={v} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No templates in this category</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BulkOutreachPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<OutreachTemplate[]>(DEFAULT_TEMPLATES);
  const [batches, setBatches] = useState<ScheduledBatch[]>([]);
  const [sequences, setSequences] = useState<SmsSequence[]>([DEFAULT_SEQUENCE]);
  const [activeSequenceId, setActiveSequenceId] = useState<string>(DEFAULT_SEQUENCE.id);

  const [activeTab, setActiveTab] = useState<'compose' | 'sequences' | 'schedule' | 'tracking'>('compose');
  const [selectedTemplate, setSelectedTemplate] = useState<OutreachTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateDraft, setTemplateDraft] = useState({ name: '', type: 'sms\' as \'sms\' | \'call', content: '' });
  const [showPresets, setShowPresets] = useState(false);

  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [scoreRange, setScoreRange] = useState(SCORE_RANGES[0]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [scheduling, setScheduling] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [leadsRes, agentsRes] = await Promise.all([
        supabase.from('leads').select('id, address, city, state, stage, prospect_score, contact_name, contact_phone, assigned_agent_id').eq('user_id', user.id).order('prospect_score', { ascending: false }).limit(200),
        supabase.from('user_profiles').select('id, full_name, email').eq('role', 'agent').limit(50),
      ]);
      setLeads(leadsRes.data || []);
      setAgents((agentsRes.data || []).map((a: Agent) => ({ ...a, active_leads: Math.floor(Math.random() * 20) + 1 })));
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredLeads = leads.filter(l => {
    if (stageFilter.length > 0 && !stageFilter.includes(l.stage || '')) return false;
    const score = l.prospect_score || 0;
    return score >= scoreRange.min && score <= scoreRange.max;
  });

  function toggleLeadSelect(id: string) {
    setSelectedLeadIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    setSelectedLeadIds(selectedLeadIds.size === filteredLeads.length ? new Set() : new Set(filteredLeads.map(l => l.id)));
  }

  function toggleStageFilter(stage: string) {
    setStageFilter(prev => prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]);
  }

  function saveTemplate() {
    if (!templateDraft.name || !templateDraft.content) { toast.error('Name and content required'); return; }
    const vars = [...templateDraft.content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
    setTemplates(prev => [...prev, { id: `tpl-${Date.now()}`, name: templateDraft.name, type: templateDraft.type, content: templateDraft.content, variables: [...new Set(vars)] }]);
    setEditingTemplate(false);
    setTemplateDraft({ name: '', type: 'sms', content: '' });
    toast.success('Template saved');
  }

  function deleteTemplate(id: string) {
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
  }

  async function scheduleBatch() {
    if (!selectedTemplate) { toast.error('Select a template'); return; }
    if (selectedLeadIds.size === 0) { toast.error('Select at least one lead'); return; }
    if (!selectedAgentId) { toast.error('Select an agent'); return; }
    if (!scheduledDate) { toast.error('Set a scheduled date'); return; }
    setScheduling(true);
    await new Promise(r => setTimeout(r, 800));
    const agent = agents.find(a => a.id === selectedAgentId);
    setBatches(prev => [{
      id: `batch-${Date.now()}`,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      type: selectedTemplate.type,
      leadIds: [...selectedLeadIds],
      agentId: selectedAgentId,
      agentName: agent?.full_name || agent?.email || 'Unknown',
      scheduledAt: `${scheduledDate}T${scheduledTime}:00`,
      status: 'pending',
      sent: 0,
      total: selectedLeadIds.size,
      responses: 0,
    }, ...prev]);
    setScheduling(false);
    setSelectedLeadIds(new Set());
    setActiveTab('tracking');
    toast.success(`Batch of ${selectedLeadIds.size} ${selectedTemplate.type === 'sms' ? 'SMS' : 'calls'} scheduled`);
  }

  function toggleBatchStatus(id: string) {
    setBatches(prev => prev.map(b => {
      if (b.id !== id) return b;
      if (b.status === 'pending') return { ...b, status: 'running' as const };
      if (b.status === 'running') return { ...b, status: 'paused' as const };
      if (b.status === 'paused') return { ...b, status: 'running' as const };
      return b;
    }));
  }

  function saveSequence(updated: SmsSequence) {
    setSequences(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  function addNewSequence() {
    const newSeq: SmsSequence = {
      id: `seq-${Date.now()}`,
      name: 'New Sequence',
      steps: [
        { id: `step-${Date.now()}`, type: 'sms', label: 'Initial SMS', message: 'Hi {{contact_name}}, …', tcpaChecks: ['opt_in_confirmed', 'dnc_scrubbed'] },
        { id: `step-${Date.now() + 1}`, type: 'delay', label: 'Wait 48 hours', delayHours: 48 },
      ],
      autoPauseDnc: true,
      autoPauseUnsubscribe: true,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    setSequences(prev => [...prev, newSeq]);
    setActiveSequenceId(newSeq.id);
  }

  const sortedAgents = [...agents].sort((a, b) => (a.active_leads || 0) - (b.active_leads || 0));
  const totalSent = batches.reduce((s, b) => s + b.sent, 0);
  const totalResponses = batches.reduce((s, b) => s + b.responses, 0);
  const responseRate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 100) : 0;
  const activeSeq = sequences.find(s => s.id === activeSequenceId) || sequences[0];

  const TABS = [
    { key: 'compose', label: 'Compose', icon: Send },
    { key: 'sequences', label: 'SMS Sequences', icon: GitBranch },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'tracking', label: 'Tracking', icon: BarChart2 },
  ] as const;

  function copyPreset(preset: PresetTemplate) {
    setTemplateDraft({ name: `${preset.name} (copy)`, type: preset.type, content: preset.content });
    setEditingTemplate(true);
    setShowPresets(false);
    toast.success('Template copied — customize and save');
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Bulk Outreach Composer</h1>
              <p className="text-xs text-muted-foreground">Compose, schedule, SMS sequences, and track campaigns</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs text-muted-foreground">
              <BarChart2 size={12} />
              {totalSent} sent · {responseRate}% response
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <Icon size={12} />
                {t.label}
                {t.key === 'sequences' && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 text-[9px] font-bold">NEW</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* ── COMPOSE TAB ── */}
              {activeTab === 'compose' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Templates */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <p className="text-xs font-semibold text-foreground">Templates</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowPresets(p => !p)}
                          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-semibold transition-all ${showPresets ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                        >
                          <BookOpen size={9} /> Library
                        </button>
                        <button onClick={() => { setShowPresets(false); setEditingTemplate(true); }} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                          <Plus size={10} /> New
                        </button>
                      </div>
                    </div>

                    {/* Preset library panel */}
                    {showPresets && (
                      <div className="p-3 border-b border-border bg-muted/10">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pre-built Template Library</p>
                        <PresetTemplatePicker onCopy={copyPreset} />
                      </div>
                    )}

                    {editingTemplate && (
                      <div className="p-3 border-b border-border bg-muted/20 space-y-2">
                        <input value={templateDraft.name} onChange={e => setTemplateDraft(p => ({ ...p, name: e.target.value }))} placeholder="Template name" className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none" />
                        <select value={templateDraft.type} onChange={e => setTemplateDraft(p => ({ ...p, type: e.target.value as 'sms' | 'call' }))} className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none">
                          <option value="sms">SMS</option>
                          <option value="call">Call Script</option>
                        </select>
                        <textarea value={templateDraft.content} onChange={e => setTemplateDraft(p => ({ ...p, content: e.target.value }))} rows={3} placeholder="Message content…" className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none resize-none" />
                        <div className="flex gap-2">
                          <button onClick={saveTemplate} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Save</button>
                          <button onClick={() => setEditingTemplate(false)} className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground">Cancel</button>
                        </div>
                      </div>
                    )}
                    <div className="divide-y divide-border">
                      {templates.map(tpl => (
                        <div
                          key={tpl.id}
                          onClick={() => setSelectedTemplate(tpl)}
                          className={`p-3 cursor-pointer hover:bg-muted/30 transition-colors ${selectedTemplate?.id === tpl.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-foreground">{tpl.name}</span>
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tpl.type === 'sms' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
                                {tpl.type.toUpperCase()}
                              </span>
                              <button onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }} className="p-0.5 rounded hover:text-red-500 text-muted-foreground transition-colors">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground line-clamp-2">{tpl.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lead selector */}
                  <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-foreground">Select Leads</p>
                        <span className="text-[10px] text-muted-foreground">{selectedLeadIds.size} selected</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <div className="relative">
                          <select value={scoreRange.label} onChange={e => setScoreRange(SCORE_RANGES.find(r => r.label === e.target.value) || SCORE_RANGES[0])} className="text-[10px] bg-background border border-border rounded-lg pl-2 pr-5 py-1 text-foreground focus:outline-none appearance-none">
                            {SCORE_RANGES.map(r => <option key={r.label} value={r.label}>{r.label} score</option>)}
                          </select>
                          <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                        {STAGES.map(s => (
                          <button key={s} onClick={() => toggleStageFilter(s)} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all ${stageFilter.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-auto max-h-72">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border">
                            <th className="py-2 px-3 text-left">
                              <input type="checkbox" checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0} onChange={toggleAll} className="rounded" />
                            </th>
                            <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lead</th>
                            <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</th>
                            <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.slice(0, 50).map(lead => (
                            <tr key={lead.id} onClick={() => toggleLeadSelect(lead.id)} className={`border-b border-border cursor-pointer hover:bg-muted/30 transition-colors ${selectedLeadIds.has(lead.id) ? 'bg-primary/5' : ''}`}>
                              <td className="py-2 px-3">
                                <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={() => toggleLeadSelect(lead.id)} onClick={e => e.stopPropagation()} className="rounded" />
                              </td>
                              <td className="py-2 px-3">
                                <p className="text-xs font-medium text-foreground">{lead.contact_name || 'Unknown'}</p>
                                <p className="text-[10px] text-muted-foreground">{lead.address || '—'}</p>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{lead.stage || '—'}</span>
                              </td>
                              <td className="py-2 px-3 text-xs font-semibold text-foreground">{lead.prospect_score || '—'}</td>
                            </tr>
                          ))}
                          {filteredLeads.length === 0 && (
                            <tr><td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">No leads match filters</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {selectedLeadIds.size > 0 && selectedTemplate && (
                      <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Ready to schedule: <span className="font-semibold text-foreground">{selectedLeadIds.size} leads</span> · <span className="font-semibold text-foreground">{selectedTemplate.name}</span>
                        </p>
                        <button onClick={() => setActiveTab('schedule')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all">
                          Schedule <ArrowRight size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SEQUENCES TAB ── */}
              {activeTab === 'sequences' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* Sequence list */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <p className="text-xs font-semibold text-foreground">Sequences</p>
                      <button onClick={addNewSequence} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                        <Plus size={10} /> New
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {sequences.map(seq => (
                        <div
                          key={seq.id}
                          onClick={() => setActiveSequenceId(seq.id)}
                          className={`p-3 cursor-pointer hover:bg-muted/30 transition-colors ${activeSequenceId === seq.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-foreground truncate">{seq.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${seq.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : seq.status === 'paused' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                              {seq.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{seq.steps.length} steps · {seq.steps.filter(s => s.type === 'sms').length} SMS</p>
                          <div className="flex gap-1 mt-1">
                            {seq.autoPauseDnc && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-600">DNC</span>}
                            {seq.autoPauseUnsubscribe && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-600">STOP</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sequence builder */}
                  <div className="lg:col-span-3">
                    {activeSeq && <SequenceBuilder sequence={activeSeq} onSave={saveSequence} />}
                  </div>
                </div>
              )}

              {/* ── SCHEDULE TAB ── */}
              {activeTab === 'schedule' && (
                <div className="max-w-lg space-y-4">
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Schedule Batch</p>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assign Agent</label>
                      <select value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)} className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none">
                        <option value="">Select agent…</option>
                        {sortedAgents.map(a => (
                          <option key={a.id} value={a.id}>{a.full_name || a.email} ({a.active_leads} active leads)</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
                        <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Time</label>
                        <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none" />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
                      <p><span className="font-semibold text-foreground">Template:</span> {selectedTemplate?.name || 'None selected'}</p>
                      <p><span className="font-semibold text-foreground">Leads:</span> {selectedLeadIds.size} selected</p>
                    </div>
                    <button onClick={scheduleBatch} disabled={scheduling} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                      {scheduling ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
                      {scheduling ? 'Scheduling…' : 'Schedule Batch'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TRACKING TAB ── */}
              {activeTab === 'tracking' && (
                <div className="space-y-3">
                  {batches.length === 0 && (
                    <div className="py-16 text-center text-sm text-muted-foreground">No batches scheduled yet</div>
                  )}
                  {batches.map(batch => (
                    <div key={batch.id} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground">{batch.templateName}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${batch.type === 'sms' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
                              {batch.type.toUpperCase()}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${batch.status === 'running' ? 'bg-emerald-500/10 text-emerald-600' : batch.status === 'paused' ? 'bg-amber-500/10 text-amber-600' : batch.status === 'completed' ? 'bg-blue-500/10 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                              {batch.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Agent: {batch.agentName} · {batch.total} leads · {new Date(batch.scheduledAt).toLocaleString()}</p>
                          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-1.5 bg-primary rounded-full transition-all" style={{ width: batch.total > 0 ? `${(batch.sent / batch.total) * 100}%` : '0%' }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">{batch.sent}/{batch.total} sent · {batch.responses} responses</p>
                        </div>
                        <button onClick={() => toggleBatchStatus(batch.id)} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                          {batch.status === 'running' ? <Pause size={13} className="text-amber-500" /> : <Play size={13} className="text-emerald-600" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
