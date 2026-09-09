'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { Play, Pause, SkipForward, Settings, Zap, Plus, Trash2, Save, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { CADENCE_STEPS } from '@/lib/cadenceSteps';

interface CadenceStage {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  delayDays: number;
  order: number;
  autoSend: boolean;
  stopAfterReply: boolean;
}

interface CadenceConfig {
  id: string;
  name: string;
  stages: CadenceStage[];
  autoPauseOnReply: boolean;
  stopAtStage: string;
  active: boolean;
}

interface LeadCadenceStatus {
  leadId: string;
  address: string;
  currentStage: string;
  nextSendAt: string;
  status: 'active' | 'paused' | 'completed' | 'replied';
  stagesCompleted: number;
  totalStages: number;
}

const defaultCadence: CadenceConfig = {
  id: 'default',
  name: 'Standard Outreach Cadence',
  autoPauseOnReply: true,
  stopAtStage: 'Proposal',
  active: true,
  stages: [
    { id: 's1', name: 'Initial Outreach', templateId: '', templateName: 'Initial Outreach', delayDays: 0, order: 1, autoSend: true, stopAfterReply: true },
    { id: 's2', name: 'Follow-Up #1', templateId: '', templateName: 'Follow-Up Email', delayDays: 4, order: 2, autoSend: true, stopAfterReply: true },
    { id: 's3', name: 'Check-In / Re-Engage', templateId: '', templateName: 'Check-In Email', delayDays: 7, order: 3, autoSend: true, stopAfterReply: true },
    { id: 's4', name: 'Proposal Introduction', templateId: '', templateName: 'Proposal Introduction', delayDays: 5, order: 4, autoSend: false, stopAfterReply: true },
    { id: 's5', name: 'Closing / Contract', templateId: '', templateName: 'Closing Email', delayDays: 7, order: 5, autoSend: false, stopAfterReply: true },
  ],
};

const mockLeadStatuses: LeadCadenceStatus[] = [
  { leadId: '1', address: '1842 Larimer St, Denver, CO', currentStage: 'Follow-Up #1', nextSendAt: '2026-08-17', status: 'active', stagesCompleted: 1, totalStages: 4 },
  { leadId: '2', address: '3301 Zuni St, Denver, CO', currentStage: 'Check-In', nextSendAt: '2026-08-19', status: 'active', stagesCompleted: 2, totalStages: 4 },
  { leadId: '3', address: '2450 W 26th Ave, Denver, CO', currentStage: 'Initial Outreach', nextSendAt: '—', status: 'replied', stagesCompleted: 1, totalStages: 4 },
  { leadId: '4', address: '1560 Blake St, Denver, CO', currentStage: 'Final Follow-Up', nextSendAt: '2026-08-20', status: 'paused', stagesCompleted: 3, totalStages: 4 },
  { leadId: '5', address: '4200 Tennyson St, Denver, CO', currentStage: 'Completed', nextSendAt: '—', status: 'completed', stagesCompleted: 4, totalStages: 4 },
];

const statusConfig = {
  active: { label: 'Active', color: 'bg-success/10 text-success border-success/30' },
  paused: { label: 'Paused', color: 'bg-warning/10 text-warning border-warning/30' },
  completed: { label: 'Completed', color: 'bg-muted text-muted-foreground border-border' },
  replied: { label: 'Replied — Paused', color: 'bg-info/10 text-info border-info/30' },
};

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-primary">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

export default function CadenceEnginePage() {
  const [cadence, setCadence] = useState<CadenceConfig>(defaultCadence);
  const [leadStatuses, setLeadStatuses] = useState<LeadCadenceStatus[]>(mockLeadStatuses);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'leads'>('config');

  function updateStage(id: string, updates: Partial<CadenceStage>) {
    setCadence(prev => ({
      ...prev,
      stages: prev.stages.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  }

  function addStage() {
    const maxOrder = Math.max(...cadence.stages.map(s => s.order), 0);
    setCadence(prev => ({
      ...prev,
      stages: [...prev.stages, {
        id: `s${Date.now()}`,
        name: 'New Stage',
        templateId: '',
        templateName: '',
        delayDays: 7,
        order: maxOrder + 1,
        autoSend: true,
        stopAfterReply: true,
      }],
    }));
  }

  function removeStage(id: string) {
    setCadence(prev => ({ ...prev, stages: prev.stages.filter(s => s.id !== id) }));
  }

  function toggleLeadStatus(leadId: string) {
    setLeadStatuses(prev => prev.map(l => {
      if (l.leadId !== leadId) return l;
      return { ...l, status: l.status === 'active' ? 'paused' : 'active' };
    }));
    toast.success('Cadence status updated');
  }

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success('Cadence configuration saved');
  }

  const activeCount = leadStatuses.filter(l => l.status === 'active').length;
  const pausedCount = leadStatuses.filter(l => l.status === 'paused').length;
  const repliedCount = leadStatuses.filter(l => l.status === 'replied').length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Cadence Engine</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure automated send sequences with auto-pause on reply</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">{activeCount} leads active</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              Save Config
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {[{ key: 'config', label: 'Configuration' }, { key: 'leads', label: `Active Leads (${leadStatuses.length})` }].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'config' | 'leads')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'config' && (
          <>
            {/* Cadence order notice */}
            <div className="flex items-start gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
              <Info size={15} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Required 5-Step Cadence Order</p>
                <div className="flex flex-wrap gap-2">
                  {CADENCE_STEPS.map(step => (
                    <span key={step.category} className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-primary">{step.step}.</span> {step.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Global Settings */}
            <Section title="Global Settings" icon={<Settings size={16} />}>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Auto-Pause on Reply</p>
                    <p className="text-xs text-muted-foreground">Immediately pause cadence when a reply is detected or agent logs a response</p>
                  </div>
                  <button
                    onClick={() => setCadence(prev => ({ ...prev, autoPauseOnReply: !prev.autoPauseOnReply }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${cadence.autoPauseOnReply ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cadence.autoPauseOnReply ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Stop Auto-Send at Stage</p>
                    <p className="text-xs text-muted-foreground">Stages at or beyond this point require manual sends (real conversations)</p>
                  </div>
                  <select
                    value={cadence.stopAtStage}
                    onChange={e => setCadence(prev => ({ ...prev, stopAtStage: e.target.value }))}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    {['Follow-Up', 'Check-In', 'Proposal', 'Closing'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
                  <Info size={13} className="text-info mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Auto-send stops at <strong>{cadence.stopAtStage}</strong> stage and beyond. These stages require real conversations and should not be automated.
                  </p>
                </div>
              </div>
            </Section>

            {/* Cadence Stages */}
            <Section title="Cadence Stages" icon={<Zap size={16} />}>
              <div className="space-y-3">
                {cadence.stages.sort((a, b) => a.order - b.order).map((stage, idx) => (
                  <div key={stage.id} className="border border-border rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{idx + 1}</span>
                      </div>
                      <input
                        value={stage.name}
                        onChange={e => updateStage(stage.id, { name: e.target.value })}
                        className="flex-1 text-sm font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none transition-colors"
                      />
                      <button onClick={() => removeStage(stage.id)} className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-muted-foreground transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                          {idx === 0 ? 'Send Immediately' : 'Delay (Days After Previous)'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={stage.delayDays}
                          disabled={idx === 0}
                          onChange={e => updateStage(stage.id, { delayDays: Number(e.target.value) })}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Template</label>
                        <input
                          value={stage.templateName}
                          onChange={e => updateStage(stage.id, { templateName: e.target.value })}
                          placeholder="Template name..."
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                      <div className="flex flex-col gap-2 justify-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage.autoSend}
                            onChange={e => updateStage(stage.id, { autoSend: e.target.checked })}
                            className="accent-primary"
                          />
                          <span className="text-xs text-foreground">Auto-send</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage.stopAfterReply}
                            onChange={e => updateStage(stage.id, { stopAfterReply: e.target.checked })}
                            className="accent-primary"
                          />
                          <span className="text-xs text-foreground">Pause on reply</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addStage}
                  className="flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all w-full justify-center"
                >
                  <Plus size={14} />
                  Add Stage
                </button>
              </div>
            </Section>
          </>
        )}

        {activeTab === 'leads' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Active', value: activeCount, color: 'text-success' },
                { label: 'Paused', value: pausedCount, color: 'text-warning' },
                { label: 'Replied', value: repliedCount, color: 'text-info' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Lead Cadence Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <h3 className="text-sm font-semibold text-foreground">Lead Cadence Status</h3>
              </div>
              <div className="divide-y divide-border">
                {leadStatuses.map(lead => {
                  const cfg = statusConfig[lead.status];
                  return (
                    <div key={lead.leadId} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lead.address}</p>
                        <p className="text-xs text-muted-foreground">Current: {lead.currentStage} · Next: {lead.nextSendAt}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: lead.totalStages }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${i < lead.stagesCompleted ? 'bg-primary' : 'bg-muted'}`}
                            />
                          ))}
                        </div>
                        <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleLeadStatus(lead.leadId)}
                            title={lead.status === 'active' ? 'Pause' : 'Resume'}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            {lead.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button
                            title="Skip to next stage"
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <SkipForward size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
