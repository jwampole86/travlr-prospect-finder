'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { List, Map as MapIcon, Bell, Phone, Star, ChevronDown, X, CheckCircle, AlertTriangle, Clock, Loader2, RefreshCw, MessageSquare, Navigation, Briefcase, TrendingUp, Mic, ThumbsUp, ThumbsDown, Zap, MapPin, BookOpen, Copy, Flame, Shield, Activity, UserCheck, ChevronUp, Filter, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';
// anthropicBatchService imported dynamically via runBatchValidation below

// ─── Lazy batch validation (client-only) ─────────────────────────────────────
async function runBatchValidation(
  requests: Array<{ leadId: string; address: string; city: string; state: string }>,
  concurrency: number,
): Promise<Map<string, { leadId: string; ownershipConfidence: number | null; marketCompConfidence: number | null; overallConfidence: number | null; recommendation: string; anomalies: string[]; cacheHit: boolean }>> {
  const { validateBatch } = await import('@/lib/services/anthropicBatchService');
  return validateBatch(requests, concurrency);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ValidationResult = {
  leadId: string;
  ownershipConfidence: number | null;
  marketCompConfidence: number | null;
  overallConfidence: number | null;
  recommendation: string;
  anomalies: string[];
  cacheHit: boolean;
};

interface Lead {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  stage?: string;
  prospect_score?: number;
  contact_name?: string;
  contact_phone?: string;
  regulation_category?: string;
  assigned_agent_id?: string;
  confidence_band?: string;
  overall_confidence?: number;
  pipeline_status?: string;
  source?: string;
  archived_at?: string | null;
}

interface AgentOption {
  id: string;
  full_name: string;
  email?: string;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'lead' | 'coaching' | 'workload' | 'system';
  read: boolean;
  createdAt: string;
}

interface CallFeedback {
  leadId: string;
  pace: number;
  rapport: number;
  objection: number;
  closeTrigger: number;
  notes: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  'New': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'Contacted': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'Qualified': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'Proposal': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'Live': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Not a Fit': 'bg-red-500/10 text-red-600 border-red-500/20',
};

function getHeatLevel(score: number): { label: string; color: string; bg: string; dot: string } {
  if (score >= 80) return { label: 'Hot', color: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-500' };
  if (score >= 60) return { label: 'Warm', color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' };
  return { label: 'Cold', color: 'text-indigo-600', bg: 'bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-400' };
}

function getConfidenceColor(conf: number | null | undefined): string {
  if (conf == null) return 'text-muted-foreground';
  if (conf >= 75) return 'text-emerald-600';
  if (conf >= 50) return 'text-amber-600';
  return 'text-red-500';
}

function getConfidenceBg(conf: number | null | undefined): string {
  if (conf == null) return 'bg-muted/30';
  if (conf >= 75) return 'bg-emerald-500/10';
  if (conf >= 50) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Confidence Score Bar ─────────────────────────────────────────────────────

function ConfidenceBar({ value, label }: { value: number | null | undefined; label: string }) {
  const pct = value ?? 0;
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-bold ${getConfidenceColor(value)}`}>
          {value != null ? `${value}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Quick Assign Modal (with Override) ──────────────────────────────────────

function QuickAssignModal({
  lead,
  agents,
  onClose,
  onAssigned,
}: {
  lead: Lead;
  agents: AgentOption[];
  onClose: () => void;
  onAssigned: (leadId: string, agentId: string, agentName: string) => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const isAutoAssigned = !!lead.assigned_agent_id;

  async function handleAssign() {
    if (!selectedAgent) return;
    setAssigning(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('leads')
        .update({ assigned_agent_id: selectedAgent })
        .eq('id', lead.id);

      if (error) throw error;

      // Log assignment with override flag if previously assigned
      await supabase.from('lead_assignment_log').insert({
        lead_id: lead.id,
        assigned_to_agent_name: agents.find(a => a.id === selectedAgent)?.full_name ?? '',
        assigned_at: new Date().toISOString(),
        is_override: isAutoAssigned,
        override_reason: isAutoAssigned ? (overrideReason || 'Manual override from field view') : null,
        reason: isAutoAssigned ? `Manual override: ${overrideReason || 'Field view reassignment'}` : 'Manual assignment from field view',
      }).catch(() => {});

      // Also log to lead_assignments for audit trail
      await supabase.from('lead_assignments').insert({
        lead_id: lead.id,
        agent_user_id: selectedAgent,
        assigned_by: 'field_view_override',
        notes: isAutoAssigned ? `Override: ${overrideReason || 'Manual reassignment from field view'}` : 'Assigned from field view',
      }).catch(() => {});

      const agent = agents.find(a => a.id === selectedAgent);
      onAssigned(lead.id, selectedAgent, agent?.full_name ?? 'Agent');
      toast.success(`${isAutoAssigned ? 'Reassigned' : 'Assigned'} to ${agent?.full_name ?? 'agent'}`);
      onClose();
    } catch {
      toast.error('Assignment failed');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isAutoAssigned ? '⚡ Override Assignment' : 'Quick Assign'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {lead.contact_name || lead.address || 'Lead'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* Override warning banner */}
          {isAutoAssigned && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Override Auto-Assignment</p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  This lead was auto-assigned. Reassigning will log an override event.
                </p>
              </div>
            </div>
          )}

          {/* Lead score summary */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${getConfidenceBg(lead.prospect_score)}`}>
              <span className={getConfidenceColor(lead.prospect_score)}>{lead.prospect_score ?? '—'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{lead.address || '—'}</p>
              <p className="text-[10px] text-muted-foreground">{lead.city}{lead.state ? `, ${lead.state}` : ''}</p>
            </div>
            {lead.prospect_score != null && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold ${getHeatLevel(lead.prospect_score).bg} ${getHeatLevel(lead.prospect_score).color}`}>
                <Flame size={9} />
                {getHeatLevel(lead.prospect_score).label}
              </div>
            )}
          </div>

          {/* Agent selector */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Select Agent
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No agents available</p>
              ) : (
                agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedAgent === agent.id
                        ? 'border-primary bg-primary/5' :'border-border hover:border-primary/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                      {agent.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{agent.full_name}</p>
                      {agent.email && <p className="text-[10px] text-muted-foreground truncate">{agent.email}</p>}
                    </div>
                    {selectedAgent === agent.id && (
                      <CheckCircle size={14} className="text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Override reason (only shown when overriding) */}
          {isAutoAssigned && (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Override Reason (optional)
              </label>
              <input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Agent requested, territory change…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={handleAssign}
            disabled={!selectedAgent || assigning}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {assigning ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            {assigning ? 'Assigning…' : isAutoAssigned ? 'Override & Reassign' : 'Assign Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hot Lead Card ────────────────────────────────────────────────────────────

function HotLeadCard({
  lead,
  validationResult,
  agents,
  onCallFeedback,
  onQuickAssign,
}: {
  lead: Lead;
  validationResult?: ValidationResult;
  agents: AgentOption[];
  onCallFeedback: (lead: Lead) => void;
  onQuickAssign: (lead: Lead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stageClass = STAGE_COLORS[lead.stage || ''] || 'bg-muted text-muted-foreground border-border';
  const heat = getHeatLevel(lead.prospect_score ?? 0);

  const confidence = validationResult?.overallConfidence ?? lead.overall_confidence;
  const anomalies = validationResult?.anomalies ?? [];
  const isHot = (lead.prospect_score ?? 0) >= 80;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${isHot ? 'border-red-500/30 shadow-sm shadow-red-500/10' : 'border-border'}`}>
      {/* Hot indicator strip */}
      {isHot && <div className="h-0.5 bg-gradient-to-r from-red-500 to-orange-400" />}

      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Score badge */}
        <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border ${heat.bg}`}>
          <span className={`text-sm font-bold leading-none ${heat.color}`}>{lead.prospect_score ?? '—'}</span>
          <span className={`text-[8px] font-semibold mt-0.5 ${heat.color}`}>{heat.label}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{lead.contact_name || 'Unknown'}</p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${stageClass}`}>
              {lead.stage || '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <MapPin size={9} />
            <span className="truncate">{lead.address || '—'}{lead.city ? `, ${lead.city}` : ''}</span>
          </div>
          {/* Confidence indicator */}
          {confidence != null && (
            <div className="flex items-center gap-1 mt-1">
              <Shield size={8} className={getConfidenceColor(confidence)} />
              <span className={`text-[9px] font-semibold ${getConfidenceColor(confidence)}`}>
                {confidence}% confidence
              </span>
              {anomalies.length > 0 && (
                <span className="text-[9px] text-amber-600 flex items-center gap-0.5">
                  <AlertTriangle size={8} />
                  {anomalies.length} flag{anomalies.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Quick assign button */}
          <button
            onClick={e => { e.stopPropagation(); onQuickAssign(lead); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary hover:text-primary-foreground transition-all border border-primary/20"
          >
            <UserCheck size={10} />
            Assign
          </button>
          {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3 bg-muted/10 space-y-3">
          {/* Confidence scores */}
          {(validationResult || lead.overall_confidence != null) && (
            <div className="space-y-2 p-3 rounded-xl bg-background border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={11} className="text-primary" />
                <span className="text-[10px] font-semibold text-foreground">Validation Scores</span>
                {validationResult?.cacheHit && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">cached</span>
                )}
              </div>
              <ConfidenceBar value={validationResult?.ownershipConfidence ?? null} label="Ownership" />
              <ConfidenceBar value={validationResult?.marketCompConfidence ?? null} label="Market Comps" />
              <ConfidenceBar value={validationResult?.overallConfidence ?? lead.overall_confidence} label="Overall" />
              {anomalies.length > 0 && (
                <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-[9px] font-semibold text-amber-700 mb-1">Flagged Anomalies</p>
                  {anomalies.slice(0, 3).map((a, i) => (
                    <p key={i} className="text-[9px] text-amber-600">• {a}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contact details */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">Phone</p>
              <p className="font-medium text-foreground">{lead.contact_phone || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Regulation</p>
              <p className="font-medium text-foreground">{lead.regulation_category || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Source</p>
              <p className="font-medium text-foreground truncate">{lead.source || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Pipeline</p>
              <p className="font-medium text-foreground">{lead.pipeline_status || '—'}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {lead.contact_phone && (
              <a
                href={`tel:${lead.contact_phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold active:scale-95 transition-transform"
              >
                <Phone size={13} />
                Call
              </a>
            )}
            {lead.contact_phone && (
              <a
                href={`sms:${lead.contact_phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-semibold active:scale-95 transition-transform"
              >
                <MessageSquare size={13} />
                SMS
              </a>
            )}
            <button
              onClick={() => onCallFeedback(lead)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-semibold active:scale-95 transition-transform"
            >
              <Star size={13} />
              Rate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hot Lead Queue Header ────────────────────────────────────────────────────

function HotQueueHeader({
  hotCount,
  warmCount,
  coldCount,
  validating,
}: {
  hotCount: number;
  warmCount: number;
  coldCount: number;
  validating: boolean;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2">
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
        <Flame size={12} className="text-red-600" />
        <span className="text-xs font-bold text-red-600">{hotCount} Hot</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
        <Activity size={12} className="text-amber-600" />
        <span className="text-xs font-bold text-amber-600">{warmCount} Warm</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shrink-0">
        <BarChart2 size={12} className="text-indigo-600" />
        <span className="text-xs font-bold text-indigo-600">{coldCount} Cold</span>
      </div>
      {validating && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
          <Loader2 size={11} className="text-primary animate-spin" />
          <span className="text-[10px] font-semibold text-primary">Validating…</span>
        </div>
      )}
    </div>
  );
}

// ─── Call Quality Capture ─────────────────────────────────────────────────────

function CallQualityCapture({ leadId, leadName, onClose, onSubmit }: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSubmit: (fb: CallFeedback) => void;
}) {
  const [fb, setFb] = useState<CallFeedback>({ leadId, pace: 3, rapport: 3, objection: 3, closeTrigger: 3, notes: '' });

  const dims = [
    { key: 'pace' as const, label: 'Pace', icon: Mic },
    { key: 'rapport' as const, label: 'Rapport', icon: ThumbsUp },
    { key: 'objection' as const, label: 'Objection Handling', icon: ThumbsDown },
    { key: 'closeTrigger' as const, label: 'Close Trigger', icon: Zap },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Call Quality Feedback</p>
            <p className="text-[10px] text-muted-foreground">{leadName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {dims.map(d => {
            const DimIcon = d.icon;
            return (
              <div key={d.key}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <DimIcon size={12} className="text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{d.label}</span>
                  </div>
                  <span className="text-xs font-bold text-primary">{fb[d.key]}/5</span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setFb(p => ({ ...p, [d.key]: v }))}
                      className={`flex-1 h-8 rounded-lg border text-xs font-bold transition-all ${fb[d.key] >= v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Notes</label>
            <textarea
              value={fb.notes}
              onChange={e => setFb(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Key observations…"
              className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none resize-none"
            />
          </div>
          <button
            onClick={() => { onSubmit(fb); onClose(); toast.success('Call feedback saved'); }}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
          >
            Save Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Map Placeholder ──────────────────────────────────────────────────────────

function MobileMapView({ leads, onCallFeedback }: { leads: Lead[]; onCallFeedback: (lead: Lead) => void }) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <div className="relative h-full min-h-[60vh]">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-emerald-50 dark:from-blue-950/20 dark:to-emerald-950/20 rounded-xl border border-border overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Navigation size={32} className="text-primary mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Map View</p>
            <p className="text-[10px] text-muted-foreground">Touch pins to view lead details</p>
          </div>
        </div>
        {leads.slice(0, 8).map((lead, i) => {
          const top = 15 + (i % 4) * 18;
          const left = 10 + Math.floor(i / 4) * 45;
          const score = lead.prospect_score ?? 0;
          return (
            <button
              key={lead.id}
              onClick={() => setSelectedLead(lead)}
              style={{ top: `${top}%`, left: `${left}%` }}
              className={`absolute w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold transition-transform active:scale-110 ${score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-amber-500' : 'bg-indigo-500'}`}
            >
              {score || '?'}
            </button>
          );
        })}
      </div>

      {selectedLead && (
        <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl shadow-2xl p-4 z-10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedLead.contact_name || 'Unknown'}</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin size={9} />
                {selectedLead.address || '—'}{selectedLead.city ? `, ${selectedLead.city}` : ''}
              </p>
            </div>
            <button onClick={() => setSelectedLead(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-sm font-bold text-foreground">{selectedLead.prospect_score || '—'}</p>
              <p className="text-[9px] text-muted-foreground">Score</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs font-semibold text-foreground">{selectedLead.stage || '—'}</p>
              <p className="text-[9px] text-muted-foreground">Stage</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs font-semibold text-foreground truncate">{selectedLead.regulation_category || '—'}</p>
              <p className="text-[9px] text-muted-foreground">Reg</p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedLead.contact_phone && (
              <a href={`tel:${selectedLead.contact_phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 text-white text-xs font-semibold">
                <Phone size={13} /> Call
              </a>
            )}
            <button onClick={() => { onCallFeedback(selectedLead); setSelectedLead(null); }} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-500 text-white text-xs font-semibold">
              <Star size={13} /> Rate Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template Panel ───────────────────────────────────────────────────────────

type TemplateCategory = 'initial_outreach' | 'follow_up' | 'objection_handling' | 'close';

interface FieldTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  type: 'sms' | 'call';
  content: string;
}

const FIELD_CATEGORY_META: Record<TemplateCategory, { label: string; color: string }> = {
  initial_outreach:   { label: 'Initial Outreach',   color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  follow_up:          { label: 'Follow-Up',           color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  objection_handling: { label: 'Objection Handling',  color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  close:              { label: 'Close',               color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
};

const FIELD_PRESET_TEMPLATES: FieldTemplate[] = [
  { id: 'f-io-1', category: 'initial_outreach', type: 'sms', name: 'Friendly Intro', content: 'Hi {{contact_name}}, this is {{agent_name}} from TRAVLR. I noticed your property at {{address}} and would love to chat. Would you have 10 minutes this week?' },
  { id: 'f-io-2', category: 'initial_outreach', type: 'call', name: 'Cold Call Opener', content: 'Hello, may I speak with {{contact_name}}? Hi, this is {{agent_name}} from TRAVLR calling about {{address}}. Is now a good time?' },
  { id: 'f-fu-1', category: 'follow_up', type: 'sms', name: '48h No-Reply', content: 'Hi {{contact_name}}, just circling back about {{address}}. Happy to answer any questions. Reply STOP to opt out.' },
  { id: 'f-fu-2', category: 'follow_up', type: 'call', name: 'Post-Proposal Check-In', content: 'Hi {{contact_name}}, {{agent_name}} here. Following up on the proposal for {{address}} — do you have any questions or are you ready to move forward?' },
  { id: 'f-oh-1', category: 'objection_handling', type: 'sms', name: 'Not Interested — Reframe', content: 'Totally understand, {{contact_name}}! We\'ve helped similar properties in {{city}} increase net income by 20–35%. Would a quick 5-min call change your mind?' },
  { id: 'f-oh-2', category: 'objection_handling', type: 'call', name: 'Already Have Manager', content: 'I understand, {{contact_name}}. Are you fully satisfied with your current returns on {{address}}? We often find a 15–25% gap we can close.' },
  { id: 'f-cl-1', category: 'close', type: 'sms', name: 'Final Close', content: 'Hi {{contact_name}}, last message about {{address}}. Ready to move forward whenever you are — just reply YES. Reply STOP to unsubscribe.' },
  { id: 'f-cl-2', category: 'close', type: 'call', name: 'Verbal Close', content: 'Based on everything we\'ve discussed, {{contact_name}}, I think {{address}} is a perfect fit. I can have the agreement over today — does that work?' },
];

function FieldTemplatePanel({ onClose }: { onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = FIELD_PRESET_TEMPLATES.filter(t => activeCategory === 'all' || t.category === activeCategory);

  function handleCopy(tpl: FieldTemplate) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(tpl.content).catch(() => {});
    }
    setCopied(tpl.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card rounded-t-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen size={13} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Message Templates</p>
              <p className="text-[10px] text-muted-foreground">Copy & customize for outreach</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setActiveCategory('all')} className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border font-semibold transition-all ${activeCategory === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>All</button>
            {(Object.keys(FIELD_CATEGORY_META) as TemplateCategory[]).map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border font-semibold transition-all ${activeCategory === cat ? `${FIELD_CATEGORY_META[cat].color} border-current` : 'border-border text-muted-foreground'}`}>
                {FIELD_CATEGORY_META[cat].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.map(tpl => (
            <div key={tpl.id} className="bg-background border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${FIELD_CATEGORY_META[tpl.category].color}`}>{FIELD_CATEGORY_META[tpl.category].label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tpl.type === 'sms' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>{tpl.type.toUpperCase()}</span>
                </div>
                <button onClick={() => handleCopy(tpl)} className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border font-semibold transition-all ${copied === tpl.id ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground'}`}>
                  {copied === tpl.id ? <CheckCircle size={9} /> : <Copy size={9} />}
                  {copied === tpl.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-semibold text-foreground mb-1">{tpl.name}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{tpl.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentFieldViewPage() {
  const { user } = useAuth();
  const { selectedPortfolio, filterLeadsByPortfolio } = usePortfolio();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<Map<string, ValidationResult>>(new Map());
  const [activeTab, setActiveTab] = useState<'queue' | 'map' | 'workload' | 'notifications'>('queue');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [callFeedbackLead, setCallFeedbackLead] = useState<Lead | null>(null);
  const [quickAssignLead, setQuickAssignLead] = useState<Lead | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [heatFilter, setHeatFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();

      // Load leads assigned to this agent, portfolio-filtered via RLS
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, address, city, state, stage, prospect_score, contact_name, contact_phone, regulation_category, assigned_agent_id, confidence_band, overall_confidence, pipeline_status, source, archived_at')
        .eq('assigned_agent_id', user.id)
        .is('archived_at', null)
        .order('prospect_score', { ascending: false })
        .limit(150);

      const portfolioFiltered = filterLeadsByPortfolio(leadsData || []);
      setLeads(portfolioFiltered);

      // Load agents for quick-assign
      const { data: agentsData } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('app_role', ['agent', 'admin', 'ops'])
        .limit(50);
      setAgents(agentsData || []);

      // Load notifications
      const { data: notifData } = await supabase
        .from('app_notifications')
        .select('id, title, body, type, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setNotifications(
        (notifData || []).map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          type: (n.type as Notification['type']) || 'system',
          read: n.read ?? false,
          createdAt: n.created_at,
        }))
      );

      // Trigger batch validation for hot leads (score >= 60) that lack confidence scores
      const needsValidation = portfolioFiltered
        .filter(l => (l.prospect_score ?? 0) >= 60 && l.overall_confidence == null)
        .slice(0, 20);

      if (needsValidation.length > 0) {
        setValidating(true);
        const batchReqs = needsValidation.map(l => ({
          leadId: l.id,
          address: l.address || '',
          city: l.city || '',
          state: l.state || '',
        }));

        runBatchValidation(batchReqs, 4)
          .then(results => {
            setValidationResults(prev => {
              const next = new Map(prev);
              results.forEach((v, k) => next.set(k, v));
              return next;
            });
          })
          .catch(() => {})
          .finally(() => setValidating(false));
      }
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [user, filterLeadsByPortfolio]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Filtered + sorted leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchSearch = !searchQuery ||
        (l.contact_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.address || '').toLowerCase().includes(searchQuery.toLowerCase());

      const score = l.prospect_score ?? 0;
      const matchHeat =
        heatFilter === 'all' ||
        (heatFilter === 'hot' && score >= 80) ||
        (heatFilter === 'warm' && score >= 60 && score < 80) ||
        (heatFilter === 'cold' && score < 60);

      const matchUnassigned = !showUnassignedOnly || !l.assigned_agent_id;

      return matchSearch && matchHeat && matchUnassigned;
    });
  }, [leads, searchQuery, heatFilter, showUnassignedOnly]);

  const hotLeads = useMemo(() => leads.filter(l => (l.prospect_score ?? 0) >= 80), [leads]);
  const warmLeads = useMemo(() => leads.filter(l => { const s = l.prospect_score ?? 0; return s >= 60 && s < 80; }), [leads]);
  const coldLeads = useMemo(() => leads.filter(l => (l.prospect_score ?? 0) < 60), [leads]);

  const unreadCount = notifications.filter(n => !n.read).length;

  function handleAssigned(leadId: string, agentId: string) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, assigned_agent_id: agentId } : l));
  }

  const TABS = [
    { key: 'queue' as const, label: 'Queue', icon: Flame },
        { key: 'map' as const, label: 'Map', icon: MapIcon },
    { key: 'workload' as const, label: 'Stats', icon: Briefcase },
    { key: 'notifications' as const, label: 'Alerts', icon: Bell, badge: unreadCount },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-lg font-bold text-foreground">Field View</h1>
              <p className="text-[11px] text-muted-foreground">
                {selectedPortfolio.key !== 'all' ? `${selectedPortfolio.label} · ` : ''}{leads.length} leads
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-xs font-semibold text-foreground"
              >
                <BookOpen size={13} className="text-primary" />
                Templates
              </button>
              <button onClick={loadLeads} disabled={loading} className="p-2 rounded-xl border border-border hover:bg-muted transition-colors">
                <RefreshCw size={15} className={`text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex bg-muted/50 rounded-xl p-1 gap-1">
            {TABS.map(t => {
              const TabIcon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-semibold transition-all relative ${activeTab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  <TabIcon size={16} />
                  {t.label}
                  {t.badge != null && t.badge > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* ── HOT LEAD QUEUE TAB ── */}
              {activeTab === 'queue' && (
                <div className="space-y-3">
                  {/* Heat band summary */}
                  <HotQueueHeader
                    hotCount={hotLeads.length}
                    warmCount={warmLeads.length}
                    coldCount={coldLeads.length}
                    validating={validating}
                  />

                  {/* Search + filters */}
                  <div className="flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search leads…"
                      className="flex-1 text-sm bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <select
                      value={heatFilter}
                      onChange={e => setHeatFilter(e.target.value as typeof heatFilter)}
                      className="text-xs bg-background border border-border rounded-xl px-3 py-2.5 text-foreground focus:outline-none"
                    >
                      <option value="all">All</option>
                      <option value="hot">🔥 Hot</option>
                      <option value="warm">⚡ Warm</option>
                      <option value="cold">❄️ Cold</option>
                    </select>
                  </div>

                  {/* Unassigned toggle */}
                  <button
                    onClick={() => setShowUnassignedOnly(p => !p)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${showUnassignedOnly ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    <Filter size={11} />
                    Unassigned only
                  </button>

                  {filteredLeads.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">No leads match filters</div>
                  ) : (
                    filteredLeads.map(lead => (
                      <HotLeadCard
                        key={lead.id}
                        lead={lead}
                        validationResult={validationResults.get(lead.id)}
                        agents={agents}
                        onCallFeedback={setCallFeedbackLead}
                        onQuickAssign={setQuickAssignLead}
                      />
                    ))
                  )}
                </div>
              )}

              {/* ── MAP TAB ── */}
              {activeTab === 'map' && (
                <div className="pt-2">
                  <MobileMapView leads={filteredLeads} onCallFeedback={setCallFeedbackLead} />
                </div>
              )}

              {/* ── WORKLOAD / STATS TAB ── */}
              {activeTab === 'workload' && (
                <div className="pt-2 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Leads', value: leads.length, icon: List, color: 'bg-blue-500/10 text-blue-600' },
                      { label: 'Hot Leads', value: hotLeads.length, icon: Flame, color: 'bg-red-500/10 text-red-600' },
                      { label: 'Avg Score', value: leads.length > 0 ? Math.round(leads.reduce((s, l) => s + (l.prospect_score || 0), 0) / leads.length) : 0, icon: Star, color: 'bg-amber-500/10 text-amber-600' },
                      { label: 'Validated', value: validationResults.size, icon: Shield, color: 'bg-emerald-500/10 text-emerald-600' },
                    ].map(kpi => {
                      const KpiIcon = kpi.icon;
                      return (
                        <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                          <div className={`w-8 h-8 rounded-lg ${kpi.color} flex items-center justify-center mb-2`}>
                            <KpiIcon size={15} />
                          </div>
                          <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                          <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Confidence distribution */}
                  {validationResults.size > 0 && (
                    <div className="bg-card border border-border rounded-xl p-4">
                      <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Shield size={14} className="text-primary" />
                        Validation Summary
                      </p>
                      {(() => {
                        const vals = Array.from(validationResults.values());
                        const high = vals.filter(v => (v.overallConfidence ?? 0) >= 75).length;
                        const med = vals.filter(v => { const c = v.overallConfidence ?? 0; return c >= 50 && c < 75; }).length;
                        const low = vals.filter(v => (v.overallConfidence ?? 0) < 50).length;
                        const cached = vals.filter(v => v.cacheHit).length;
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-emerald-600 font-semibold">High confidence (≥75%)</span>
                              <span className="font-bold text-foreground">{high}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-amber-600 font-semibold">Medium confidence (50–74%)</span>
                              <span className="font-bold text-foreground">{med}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-red-500 font-semibold">Low confidence (&lt;50%)</span>
                              <span className="font-bold text-foreground">{low}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-t border-border pt-2 mt-2">
                              <span className="text-blue-600 font-semibold">Cache hits (7-day)</span>
                              <span className="font-bold text-foreground">{cached}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Stage breakdown */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Pipeline by Stage</p>
                    <div className="space-y-2.5">
                      {Object.keys(STAGE_COLORS).map(stage => {
                        const count = leads.filter(l => l.stage === stage).length;
                        const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                        const stageClass = STAGE_COLORS[stage];
                        return (
                          <div key={stage}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${stageClass}`}>{stage}</span>
                              <span className="text-xs font-bold text-foreground">{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-1.5 rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS TAB ── */}
              {activeTab === 'notifications' && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{unreadCount} unread</p>
                    <button
                      onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">No notifications</div>
                  ) : (
                    notifications.map(notif => {
                      const typeColors: Record<string, string> = {
                        lead: 'bg-blue-500/10 text-blue-600',
                        coaching: 'bg-amber-500/10 text-amber-600',
                        workload: 'bg-purple-500/10 text-purple-600',
                        system: 'bg-muted text-muted-foreground',
                      };
                      const typeIcons: Record<string, React.ElementType> = {
                        lead: TrendingUp,
                        coaching: Star,
                        workload: AlertTriangle,
                        system: Bell,
                      };
                      const NotifIcon = typeIcons[notif.type] || Bell;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))}
                          className={`bg-card border rounded-xl p-4 cursor-pointer transition-all ${notif.read ? 'border-border opacity-70' : 'border-primary/30 shadow-sm'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColors[notif.type]}`}>
                              <NotifIcon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <p className="text-xs font-semibold text-foreground">{notif.title}</p>
                                {!notif.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{notif.body}</p>
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock size={9} />
                                {timeAgo(notif.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modals */}
        {callFeedbackLead && (
          <CallQualityCapture
            leadId={callFeedbackLead.id}
            leadName={callFeedbackLead.contact_name || 'Lead'}
            onClose={() => setCallFeedbackLead(null)}
            onSubmit={fb => console.log('Call feedback:', fb)}
          />
        )}

        {quickAssignLead && (
          <QuickAssignModal
            lead={quickAssignLead}
            agents={agents}
            onClose={() => setQuickAssignLead(null)}
            onAssigned={handleAssigned}
          />
        )}

        {showTemplates && <FieldTemplatePanel onClose={() => setShowTemplates(false)} />}
      </div>
    </AppLayout>
  );
}
