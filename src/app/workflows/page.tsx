'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Zap, Plus, Pencil, Trash2, Mail, MessageSquare, ChevronDown, ChevronUp,
  X, Check, Loader2, AlertCircle, Activity, ArrowRight, Bell, Eye, Reply,
  Send, MoreHorizontal, PlayCircle, PauseCircle, Users, CheckSquare, Square,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface SequenceWorkflow {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  status: string;
  total_steps: number;
  created_at: string;
  steps?: SequenceStep[];
  escalation_rules?: EscalationRule[];
}

interface SequenceStep {
  id: string;
  workflow_id: string;
  step_number: number;
  channel: string;
  label: string;
  subject: string;
  body: string;
  delay_days: number;
  delay_hours: number;
  send_time: string;
}

interface EscalationRule {
  id: string;
  workflow_id: string;
  trigger_condition: string;
  trigger_after_days: number;
  action: string;
  notify_owner: boolean;
}

interface ActivityLog {
  id: string;
  surplus_lead_id: string | null;
  workflow_id: string | null;
  step_id: string | null;
  event_type: string;
  channel: string;
  subject: string;
  body_preview: string;
  status: string;
  opened_at: string | null;
  replied_at: string | null;
  clicked_at: string | null;
  notes: string;
  created_at: string;
}

interface Lead {
  id: string;
  address: string;
  contact_name: string | null;
  stage: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail size={13} />,
  sms: <MessageSquare size={13} />,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'bg-blue-500/15 text-blue-400',
  sms: 'bg-emerald-500/15 text-emerald-400',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-400',
  archived: 'bg-slate-500/15 text-slate-400',
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  sent: <Send size={12} />,
  opened: <Eye size={12} />,
  replied: <Reply size={12} />,
  clicked: <ArrowRight size={12} />,
  escalated: <Bell size={12} />,
  failed: <AlertCircle size={12} />,
};

const EVENT_COLORS: Record<string, string> = {
  sent: 'bg-blue-500/15 text-blue-400',
  opened: 'bg-emerald-500/15 text-emerald-400',
  replied: 'bg-purple-500/15 text-purple-400',
  clicked: 'bg-cyan-500/15 text-cyan-400',
  escalated: 'bg-amber-500/15 text-amber-400',
  failed: 'bg-red-500/15 text-red-400',
};

function StepEditor({
  step, index, onChange, onDelete,
}: {
  step: Partial<SequenceStep>;
  index: number;
  onChange: (s: Partial<SequenceStep>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-border rounded-xl bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{index + 1}</span>
          </div>
          <span className="text-xs font-semibold text-foreground">Step {index + 1}</span>
        </div>
        <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
          <X size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Channel</label>
          <select
            value={step.channel || 'email'}
            onChange={(e) => onChange({ ...step, channel: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Label</label>
          <input
            value={step.label || ''}
            onChange={(e) => onChange({ ...step, label: e.target.value })}
            placeholder="Initial outreach"
            className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Delay (days)</label>
          <input
            type="number"
            min={0}
            value={step.delay_days ?? 0}
            onChange={(e) => onChange({ ...step, delay_days: parseInt(e.target.value) || 0 })}
            className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Send Time</label>
          <input
            type="time"
            value={step.send_time || '09:00'}
            onChange={(e) => onChange({ ...step, send_time: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>
      {(step.channel === 'email' || !step.channel) && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
          <input
            value={step.subject || ''}
            onChange={(e) => onChange({ ...step, subject: e.target.value })}
            placeholder="Following up on your property at {{address}}"
            className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Message Body</label>
        <textarea
          value={step.body || ''}
          onChange={(e) => onChange({ ...step, body: e.target.value })}
          rows={3}
          placeholder="Hi {{contact_name}}, I wanted to reach out about your property..."
          className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
        />
      </div>
    </div>
  );
}

// Send Now Modal
function SendNowModal({
  step,
  workflowId,
  onClose,
  onSent,
}: {
  step: SequenceStep;
  workflowId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from('leads')
        .select('id, address, contact_name, stage')
        .not('stage', 'eq', 'Not a Fit')
        .order('created_at', { ascending: false })
        .limit(100);
      setLeads(data || []);
      setLoading(false);
    }
    fetchLeads();
  }, [supabase]);

  function toggleAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  }

  function toggleLead(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (selectedIds.size === 0) {
      setError('Select at least one lead.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/send-workflow-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: step.id,
          leadIds: Array.from(selectedIds),
          workflowId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ sent: data.sent, failed: data.failed });
        onSent();
      } else {
        setError(data.error || 'Failed to send.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">Send Now</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CHANNEL_COLORS[step.channel] || 'bg-muted text-muted-foreground'}`}>
              {step.channel}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="px-6 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-medium text-foreground">{step.label || `Step ${step.step_number}`}</p>
          {step.subject && <p className="text-xs text-muted-foreground mt-0.5">Subject: {step.subject}</p>}
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.body}</p>
        </div>

        {result ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
              <Check size={24} className="text-success" />
            </div>
            <p className="text-base font-semibold text-foreground">Sent successfully</p>
            <p className="text-sm text-muted-foreground">
              <span className="text-success font-medium">{result.sent} sent</span>
              {result.failed > 0 && <span className="text-danger font-medium ml-2">{result.failed} failed</span>}
            </p>
            <p className="text-xs text-muted-foreground">Activity log has been updated.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={13} className="text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Select leads to send to</span>
              </div>
              <button
                onClick={toggleAll}
                className="text-xs text-primary hover:underline"
              >
                {selectedIds.size === leads.length ? 'Deselect all' : `Select all (${leads.length})`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No leads available</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {leads.map(lead => (
                    <button
                      key={lead.id}
                      onClick={() => toggleLead(lead.id)}
                      className="w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      {selectedIds.has(lead.id)
                        ? <CheckSquare size={15} className="text-primary shrink-0" />
                        : <Square size={15} className="text-muted-foreground shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{lead.address}</p>
                        <p className="text-[10px] text-muted-foreground">{lead.contact_name || 'No contact'} · {lead.stage}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="mx-6 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle size={13} />{error}
              </div>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <span className="text-xs text-muted-foreground">{selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selected</span>
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  onClick={handleSend}
                  disabled={sending || selectedIds.size === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sending ? 'Sending…' : `Send to ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WorkflowModal({
  workflow,
  onClose,
  onSave,
}: {
  workflow: SequenceWorkflow | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const { user } = useAuth();
  const isNew = !workflow;

  const [form, setForm] = useState({
    name: workflow?.name || '',
    description: workflow?.description || '',
    status: workflow?.status || 'active',
  });
  const [steps, setSteps] = useState<Partial<SequenceStep>[]>(
    workflow?.steps || [{ channel: 'email', label: 'Initial Outreach', delay_days: 0, delay_hours: 0, send_time: '09:00', subject: '', body: '' }]
  );
  const [escalationRules, setEscalationRules] = useState<Partial<EscalationRule>[]>(
    workflow?.escalation_rules || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'steps' | 'escalation'>('steps');

  function addStep() {
    setSteps((s) => [...s, { channel: 'email', label: '', delay_days: 3, delay_hours: 0, send_time: '09:00', subject: '', body: '' }]);
  }

  function addEscalation() {
    setEscalationRules((r) => [...r, { trigger_condition: 'no_open', trigger_after_days: 7, action: 'notify', notify_owner: true }]);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Workflow name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      let workflowId = workflow?.id;
      if (isNew) {
        const { data, error: err } = await supabase
          .from('sequence_workflows')
          .insert({ ...form, owner_user_id: user?.id, total_steps: steps.length })
          .select('id')
          .single();
        if (err) throw err;
        workflowId = data.id;
      } else {
        const { error: err } = await supabase
          .from('sequence_workflows')
          .update({ ...form, total_steps: steps.length })
          .eq('id', workflow!.id);
        if (err) throw err;
        await supabase.from('sequence_steps').delete().eq('workflow_id', workflow!.id);
        await supabase.from('escalation_rules').delete().eq('workflow_id', workflow!.id);
      }

      if (workflowId) {
        if (steps.length > 0) {
          await supabase.from('sequence_steps').insert(
            steps.map((s, i) => ({ ...s, workflow_id: workflowId, step_number: i + 1 }))
          );
        }
        if (escalationRules.length > 0) {
          await supabase.from('escalation_rules').insert(
            escalationRules.map((r) => ({ ...r, workflow_id: workflowId, owner_user_id: user?.id }))
          );
        }
      }

      onSave();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save workflow.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{isNew ? 'Create Workflow' : 'Edit Workflow'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 border-b border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Workflow Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Cold Outreach Sequence"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {['active', 'paused', 'archived'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Automated outreach for new STR leads..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex border-b border-border px-6">
          {[
            { key: 'steps', label: `Steps (${steps.length})` },
            { key: 'escalation', label: `Escalation Rules (${escalationRules.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as 'steps' | 'escalation')}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'steps' && (
            <>
              {steps.map((step, i) => (
                <StepEditor
                  key={i}
                  step={step}
                  index={i}
                  onChange={(s) => setSteps((prev) => prev.map((x, j) => (j === i ? s : x)))}
                  onDelete={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              <button
                onClick={addStep}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
              >
                <Plus size={13} />
                Add Step
              </button>
            </>
          )}

          {activeTab === 'escalation' && (
            <>
              {escalationRules.map((rule, i) => (
                <div key={i} className="border border-border rounded-xl bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Rule {i + 1}</span>
                    <button onClick={() => setEscalationRules((r) => r.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-red-400">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Trigger Condition</label>
                      <select
                        value={rule.trigger_condition || 'no_open'}
                        onChange={(e) => setEscalationRules((r) => r.map((x, j) => j === i ? { ...x, trigger_condition: e.target.value } : x))}
                        className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none"
                      >
                        <option value="no_open">No Open</option>
                        <option value="no_reply">No Reply</option>
                        <option value="no_click">No Click</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">After (days)</label>
                      <input
                        type="number"
                        min={1}
                        value={rule.trigger_after_days ?? 7}
                        onChange={(e) => setEscalationRules((r) => r.map((x, j) => j === i ? { ...x, trigger_after_days: parseInt(e.target.value) || 7 } : x))}
                        className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Action</label>
                      <select
                        value={rule.action || 'notify'}
                        onChange={(e) => setEscalationRules((r) => r.map((x, j) => j === i ? { ...x, action: e.target.value } : x))}
                        className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none"
                      >
                        <option value="notify">Notify Owner</option>
                        <option value="reassign">Reassign Lead</option>
                        <option value="pause">Pause Sequence</option>
                        <option value="archive">Archive Lead</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.notify_owner ?? true}
                          onChange={(e) => setEscalationRules((r) => r.map((x, j) => j === i ? { ...x, notify_owner: e.target.checked } : x))}
                          className="accent-primary"
                        />
                        <span className="text-xs text-foreground">Notify owner</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addEscalation}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
              >
                <Plus size={13} />
                Add Escalation Rule
              </button>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle size={13} />{error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isNew ? 'Create Workflow' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [workflows, setWorkflows] = useState<SequenceWorkflow[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workflows' | 'activity'>('workflows');
  const [modal, setModal] = useState<{ open: boolean; workflow: SequenceWorkflow | null }>({ open: false, workflow: null });
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [sendNowModal, setSendNowModal] = useState<{ open: boolean; step: SequenceStep | null; workflowId: string }>({ open: false, step: null, workflowId: '' });

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [wfRes, logsRes] = await Promise.all([
        supabase.from('sequence_workflows').select('*').eq('owner_user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('sequence_activity_log').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      const wfList: SequenceWorkflow[] = wfRes.data || [];

      if (wfList.length > 0) {
        const wfIds = wfList.map((w) => w.id);
        const [stepsRes, escRes] = await Promise.all([
          supabase.from('sequence_steps').select('*').in('workflow_id', wfIds).order('step_number'),
          supabase.from('escalation_rules').select('*').in('workflow_id', wfIds),
        ]);
        wfList.forEach((wf) => {
          wf.steps = (stepsRes.data || []).filter((s) => s.workflow_id === wf.id);
          wf.escalation_rules = (escRes.data || []).filter((r) => r.workflow_id === wf.id);
        });
      }

      setWorkflows(wfList);
      setActivityLogs(logsRes.data || []);
    } catch (err) {
      console.error('Failed to load workflows', err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleWorkflowStatus(wf: SequenceWorkflow) {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    await supabase.from('sequence_workflows').update({ status: newStatus }).eq('id', wf.id);
    loadData();
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow? All steps and rules will be removed.')) return;
    await supabase.from('sequence_steps').delete().eq('workflow_id', id);
    await supabase.from('escalation_rules').delete().eq('workflow_id', id);
    await supabase.from('sequence_workflows').delete().eq('id', id);
    loadData();
  }

  const openLogs = activityLogs.filter((l) => l.opened_at).length;
  const repliedLogs = activityLogs.filter((l) => l.replied_at).length;
  const sentLogs = activityLogs.filter((l) => l.event_type === 'sent').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">Workflows</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {workflows.length} sequences · {activityLogs.length} activity events
            </p>
          </div>
          {activeTab === 'workflows' && (
            <button
              onClick={() => setModal({ open: true, workflow: null })}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              <Plus size={15} />
              New Workflow
            </button>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-px bg-border border-b border-border shrink-0">
          {[
            { label: 'Active Workflows', value: workflows.filter((w) => w.status === 'active').length, color: 'text-emerald-400' },
            { label: 'Emails Sent', value: sentLogs, color: 'text-blue-400' },
            { label: 'Opens', value: openLogs, color: 'text-purple-400' },
            { label: 'Replies', value: repliedLogs, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card px-5 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold ${color} mt-0.5`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 bg-card shrink-0">
          {[
            { key: 'workflows', label: 'Sequences', icon: Zap },
            { key: 'activity', label: 'Activity Timeline', icon: Activity },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as 'workflows' | 'activity')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'workflows' ? (
            workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Zap size={40} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No workflows yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first email/SMS sequence to automate outreach.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {workflows.map((wf) => {
                  const expanded = expandedWorkflow === wf.id;
                  return (
                    <div key={wf.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-4 px-5 py-4">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${wf.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{wf.name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[wf.status] || 'bg-muted text-muted-foreground'}`}>
                              {wf.status}
                            </span>
                          </div>
                          {wf.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{wf.description}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Zap size={11} />{wf.total_steps} steps</span>
                            <span className="flex items-center gap-1"><Bell size={11} />{wf.escalation_rules?.length || 0} rules</span>
                          </div>
                          <button
                            onClick={() => toggleWorkflowStatus(wf)}
                            className={`p-1.5 rounded-lg transition-all ${wf.status === 'active' ? 'text-amber-400 hover:bg-amber-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                            title={wf.status === 'active' ? 'Pause' : 'Activate'}
                          >
                            {wf.status === 'active' ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                          </button>
                          <button
                            onClick={() => setModal({ open: true, workflow: wf })}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteWorkflow(wf.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            onClick={() => setExpandedWorkflow(expanded ? null : wf.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                          >
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="border-t border-border bg-muted/30 p-5 space-y-4">
                          {wf.steps && wf.steps.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sequence Steps</p>
                              <div className="flex items-start gap-0 overflow-x-auto pb-2">
                                {wf.steps.map((step, i) => (
                                  <React.Fragment key={step.id}>
                                    <div className="flex flex-col items-center min-w-[160px]">
                                      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${CHANNEL_COLORS[step.channel] || 'bg-muted text-muted-foreground'} border-current/20`}>
                                        {CHANNEL_ICONS[step.channel]}
                                        {step.label || `Step ${i + 1}`}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        {step.delay_days > 0 ? `+${step.delay_days}d` : 'Immediately'} · {step.send_time}
                                      </p>
                                      {/* Send Now button per step */}
                                      <button
                                        onClick={() => setSendNowModal({ open: true, step, workflowId: wf.id })}
                                        className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
                                        title="Send this step immediately to selected leads"
                                      >
                                        <Send size={9} />
                                        Send Now
                                      </button>
                                    </div>
                                    {i < wf.steps!.length - 1 && (
                                      <div className="flex items-center mt-3 mx-1">
                                        <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                                      </div>
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}

                          {wf.escalation_rules && wf.escalation_rules.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Escalation Rules</p>
                              <div className="space-y-1.5">
                                {wf.escalation_rules.map((rule) => (
                                  <div key={rule.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-background rounded-lg px-3 py-2">
                                    <Bell size={11} className="text-amber-400 shrink-0" />
                                    <span>
                                      If <span className="text-foreground font-medium">{rule.trigger_condition.replace('_', ' ')}</span> after{' '}
                                      <span className="text-foreground font-medium">{rule.trigger_after_days} days</span> →{' '}
                                      <span className="text-foreground font-medium">{rule.action}</span>
                                      {rule.notify_owner && ' + notify owner'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Activity size={40} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">Activity will appear here as sequences run.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3 pl-12">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="relative">
                      <div className={`absolute -left-7 w-5 h-5 rounded-full flex items-center justify-center ${EVENT_COLORS[log.event_type] || 'bg-muted text-muted-foreground'}`}>
                        {EVENT_ICONS[log.event_type] || <MoreHorizontal size={10} />}
                      </div>
                      <div className="bg-card border border-border rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${EVENT_COLORS[log.event_type] || 'bg-muted text-muted-foreground'}`}>
                                {log.event_type}
                              </span>
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${CHANNEL_COLORS[log.channel] || 'bg-muted text-muted-foreground'}`}>
                                {CHANNEL_ICONS[log.channel]}
                                {log.channel}
                              </span>
                              {log.status && log.status !== 'pending' && (
                                <span className="text-[10px] text-muted-foreground">{log.status}</span>
                              )}
                            </div>
                            {log.subject && <p className="text-xs font-medium text-foreground mt-1">{log.subject}</p>}
                            {log.body_preview && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.body_preview}</p>}
                            <div className="flex items-center gap-3 mt-1.5">
                              {log.opened_at && (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                  <Eye size={9} />Opened
                                </span>
                              )}
                              {log.replied_at && (
                                <span className="flex items-center gap-1 text-[10px] text-purple-400">
                                  <Reply size={9} />Replied
                                </span>
                              )}
                              {log.clicked_at && (
                                <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                                  <ArrowRight size={9} />Clicked
                                </span>
                              )}
                            </div>
                          </div>
                          <time className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                            {new Date(log.created_at).toLocaleDateString()}
                          </time>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {modal.open && (
        <WorkflowModal
          workflow={modal.workflow}
          onClose={() => setModal({ open: false, workflow: null })}
          onSave={loadData}
        />
      )}

      {sendNowModal.open && sendNowModal.step && (
        <SendNowModal
          step={sendNowModal.step}
          workflowId={sendNowModal.workflowId}
          onClose={() => setSendNowModal({ open: false, step: null, workflowId: '' })}
          onSent={loadData}
        />
      )}
    </AppLayout>
  );
}
