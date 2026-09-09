'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Zap, Plus, Trash2, Save, Play, Pause, GripVertical, Mail, MessageSquare, Settings, Info, ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle, ArrowRight, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface CadenceStep {
  step: number;
  label: string;
  channel: 'email' | 'sms';
  delay_days: number;
  delay_hours: number;
  template_key: string;
  subject: string | null;
}

interface CadenceSequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  trigger_stage: string;
  steps: CadenceStep[];
  created_at: string;
}

interface EnrollmentSummary {
  active: number;
  paused: number;
  completed: number;
  escalated: number;
}

const CHANNEL_ICONS = { email: Mail, sms: MessageSquare };
const CHANNEL_COLORS = { email: 'text-primary bg-primary/10 border-primary/30', sms: 'text-success bg-success/10 border-success/30' };

function StepCard({ step, index, onChange, onRemove, totalSteps }: {
  step: CadenceStep; index: number; onChange: (s: CadenceStep) => void; onRemove: () => void; totalSteps: number;
}) {
  const Icon = CHANNEL_ICONS[step.channel];
  return (
    <div className="flex items-start gap-3 p-4 bg-muted/40 border border-border rounded-xl group">
      <div className="flex flex-col items-center gap-1 pt-1">
        <GripVertical size={14} className="text-muted-foreground cursor-grab" />
        <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] font-bold text-primary">
          {index + 1}
        </div>
        {index < totalSteps - 1 && <div className="w-px h-4 bg-border" />}
      </div>
      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={step.label}
            onChange={e => onChange({ ...step, label: e.target.value })}
            className="flex-1 min-w-32 px-2.5 py-1.5 text-sm font-medium bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Step name"
          />
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
            {(['email', 'sms'] as const).map(ch => {
              const ChIcon = CHANNEL_ICONS[ch];
              return (
                <button
                  key={ch}
                  onClick={() => onChange({ ...step, channel: ch })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${step.channel === ch ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <ChIcon size={11} />
                  {ch.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Delay (days)</label>
            <input
              type="number"
              min={0}
              value={step.delay_days}
              onChange={e => onChange({ ...step, delay_days: parseInt(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Delay (hours)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={step.delay_hours}
              onChange={e => onChange({ ...step, delay_hours: parseInt(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Template Key</label>
            <input
              type="text"
              value={step.template_key}
              onChange={e => onChange({ ...step, template_key: e.target.value })}
              placeholder="e.g. initial_outreach"
              className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        {step.channel === 'email' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">Email Subject</label>
            <input
              type="text"
              value={step.subject || ''}
              onChange={e => onChange({ ...step, subject: e.target.value })}
              placeholder="Subject line (supports {{leadName}}, {{address}})"
              className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function NurtureCadencePage() {
  const { isAdmin } = useAuth();
  const supabase = createClient();
  const [sequences, setSequences] = useState<CadenceSequence[]>([]);
  const [activeSeqId, setActiveSeqId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary>({ active: 0, paused: 0, completed: 0, escalated: 0 });
  const [runningJob, setRunningJob] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);

  const activeSeq = sequences.find(s => s.id === activeSeqId) || null;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [seqResult, enrollResult] = await Promise.all([
      supabase.from('cadence_sequences').select('*').order('created_at'),
      supabase.from('cadence_enrollments').select('status'),
    ]);
    const seqs = seqResult.data;
    const enrollments = enrollResult.data;
    if (seqs) {
      const parsed = seqs.map(s => ({ ...s, steps: Array.isArray(s.steps) ? s.steps : [] }));
      setSequences(parsed);
      if (!activeSeqId && parsed.length > 0) setActiveSeqId(parsed[0].id);
    }
    if (enrollments) {
      const summary = { active: 0, paused: 0, completed: 0, escalated: 0 };
      enrollments.forEach(e => { if (e.status in summary) summary[e.status as keyof EnrollmentSummary]++; });
      setEnrollmentSummary(summary);
    }
    setLoading(false);
  }, [supabase, activeSeqId]);

  useEffect(() => { loadData(); }, []);

  function updateActiveSeq(updates: Partial<CadenceSequence>) {
    if (!activeSeqId) return;
    setSequences(prev => prev.map(s => s.id === activeSeqId ? { ...s, ...updates } : s));
  }

  function updateStep(index: number, step: CadenceStep) {
    if (!activeSeq) return;
    const newSteps = [...activeSeq.steps];
    newSteps[index] = step;
    updateActiveSeq({ steps: newSteps });
  }

  function addStep() {
    if (!activeSeq) return;
    const newStep: CadenceStep = {
      step: activeSeq.steps.length,
      label: `Step ${activeSeq.steps.length + 1}`,
      channel: 'email',
      delay_days: 7,
      delay_hours: 0,
      template_key: '',
      subject: '',
    };
    updateActiveSeq({ steps: [...activeSeq.steps, newStep] });
  }

  function removeStep(index: number) {
    if (!activeSeq) return;
    const newSteps = activeSeq.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i }));
    updateActiveSeq({ steps: newSteps });
  }

  async function handleSave() {
    if (!activeSeq) return;
    setSaving(true);
    const { error } = await supabase
      .from('cadence_sequences')
      .update({ name: activeSeq.name, description: activeSeq.description, is_active: activeSeq.is_active, trigger_stage: activeSeq.trigger_stage, steps: activeSeq.steps, updated_at: new Date().toISOString() })
      .eq('id', activeSeq.id);
    setSaving(false);
    if (error) toast.error('Failed to save sequence');
    else toast.success('Cadence sequence saved');
  }

  async function handleNewSequence() {
    const { data, error } = await supabase
      .from('cadence_sequences')
      .insert({ name: 'New Sequence', description: '', is_active: false, is_default: false, trigger_stage: 'nurturing', steps: [] })
      .select()
      .single();
    if (data) {
      setSequences(prev => [...prev, { ...data, steps: [] }]);
      setActiveSeqId(data.id);
      toast.success('New sequence created');
    } else {
      toast.error('Failed to create sequence');
    }
  }

  async function runCadenceJob() {
    setRunningJob(true);
    try {
      const res = await fetch('/api/cadence/run', { method: 'POST', headers: { 'x-job-secret': process.env.NEXT_PUBLIC_SEQUENCE_JOB_SECRET || '' } });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else toast.success(`Cadence job complete: ${data.sendsDispatched || 0} sends dispatched, ${data.escalations || 0} escalations`);
    } catch {
      toast.error('Failed to run cadence job');
    }
    setRunningJob(false);
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Nurture Cadence Engine</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Admin-editable automated sequences with compliance guardrails</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin() && (
              <button
                onClick={runCadenceJob}
                disabled={runningJob}
                className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/30 text-success rounded-lg text-sm font-medium hover:bg-success/20 transition-all disabled:opacity-60"
              >
                {runningJob ? <div className="w-4 h-4 border-2 border-success/30 border-t-success rounded-full animate-spin" /> : <Play size={13} />}
                Run Job Now
              </button>
            )}
            <button
              onClick={handleNewSequence}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={13} />
              New Sequence
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active', value: enrollmentSummary.active, color: 'text-success' },
            { label: 'Paused', value: enrollmentSummary.paused, color: 'text-warning' },
            { label: 'Completed', value: enrollmentSummary.completed, color: 'text-muted-foreground' },
            { label: 'Escalated', value: enrollmentSummary.escalated, color: 'text-primary' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label} Enrollments</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Compliance notice */}
        <button
          onClick={() => setShowCompliance(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-warning/10 border border-warning/30 rounded-xl text-left"
        >
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-warning" />
            <span className="text-xs font-semibold text-warning">Compliance Guardrails Active</span>
          </div>
          {showCompliance ? <ChevronDown size={13} className="text-warning" /> : <ChevronRight size={13} className="text-warning" />}
        </button>
        {showCompliance && (
          <div className="px-4 py-3 bg-warning/5 border border-warning/20 rounded-xl space-y-1.5">
            {[
              'SMS only sent to leads with sms_opt_in = true. Email only sent to leads with email_opt_in = true.',
              'No automated message may claim to be a live person or confirm/schedule appointments.',
              'STOP keyword on SMS auto-sets sms_opt_in = false. One-click unsubscribe on email auto-sets email_opt_in = false.',
              'Leads completing the full cadence with no engagement are auto-set to closed_dead.',
              'Twilio A2P 10DLC campaign registration required before SMS goes live.',
              'All opt-in timestamps are stored and queryable for compliance audits.',
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle size={11} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-5">
          {/* Sequence list */}
          <div className="w-52 shrink-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-2">Sequences</p>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : sequences.map(seq => (
              <button
                key={seq.id}
                onClick={() => setActiveSeqId(seq.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${activeSeqId === seq.id ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'}`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${seq.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="truncate text-xs font-medium">{seq.name}</span>
                {seq.is_default && <span className="text-[9px] px-1 bg-primary/10 text-primary rounded shrink-0">DEFAULT</span>}
              </button>
            ))}
          </div>

          {/* Sequence editor */}
          {activeSeq ? (
            <div className="flex-1 space-y-4">
              {/* Sequence settings */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Sequence Settings</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateActiveSeq({ is_active: !activeSeq.is_active })}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${activeSeq.is_active ? 'bg-success/10 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'}`}
                    >
                      {activeSeq.is_active ? <><Play size={10} /> Active</> : <><Pause size={10} /> Paused</>}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={11} />}
                      Save
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Sequence Name</label>
                    <input
                      type="text"
                      value={activeSeq.name}
                      onChange={e => updateActiveSeq({ name: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Trigger Stage</label>
                    <select
                      value={activeSeq.trigger_stage}
                      onChange={e => updateActiveSeq({ trigger_stage: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="nurturing">nurturing (form submission)</option>
                      <option value="new">new (manual trigger)</option>
                      <option value="engaged">engaged</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-foreground mb-1.5">Description</label>
                    <input
                      type="text"
                      value={activeSeq.description || ''}
                      onChange={e => updateActiveSeq({ description: e.target.value })}
                      placeholder="Brief description of this sequence's purpose"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Steps ({activeSeq.steps.length})</h2>
                  </div>
                  <button
                    onClick={addStep}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
                  >
                    <Plus size={11} />
                    Add Step
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {activeSeq.steps.length === 0 ? (
                    <div className="text-center py-6">
                      <Clock size={24} className="text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No steps yet. Add your first step above.</p>
                    </div>
                  ) : (
                    activeSeq.steps.map((step, i) => (
                      <StepCard
                        key={i}
                        step={step}
                        index={i}
                        onChange={s => updateStep(i, s)}
                        onRemove={() => removeStep(i)}
                        totalSteps={activeSeq.steps.length}
                      />
                    ))
                  )}

                  {activeSeq.steps.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border border-border rounded-xl">
                      <ArrowRight size={13} className="text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        After all steps complete with no engagement → lead auto-set to <span className="font-semibold text-foreground">closed_dead</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Personalization variables */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Info size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Template Variables</h2>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-muted-foreground mb-3">Use these variables in email subjects and template content. They are resolved from the lead record at send time.</p>
                  <div className="flex flex-wrap gap-2">
                    {['{{leadName}}', '{{address}}', '{{city}}', '{{price}}', '{{bedrooms}}', '{{bathrooms}}', '{{estNetMonthly}}', '{{agentName}}', '{{unsubscribeUrl}}'].map(v => (
                      <code key={v} className="text-[11px] px-2 py-1 bg-muted border border-border rounded font-mono text-foreground">{v}</code>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 mt-3 p-3 bg-danger/5 border border-danger/20 rounded-lg">
                    <AlertTriangle size={12} className="text-danger shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">Templates are human-approved. The system does not generate freeform message content. All wording must be reviewed before activation to comply with fair housing regulations.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <div className="text-center">
                <Zap size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Select a sequence to edit or create a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
