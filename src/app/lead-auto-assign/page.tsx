'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Zap, Target, BarChart2, Plus, Trash2, Settings, RefreshCw, CheckCircle, AlertTriangle, Play, X, ChevronDown, ChevronUp, TrendingUp, Brain, Clock } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import { usePortfolio } from '@/contexts/PortfolioContext';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  minAiScore: number;
  maxAiScore: number;
  regions: string[];
  expertiseTags: string[];
  leadStages: string[];
  portfolios: string[];
  scoreThreshold: number;
  availabilityStart: string;
  availabilityEnd: string;
  availabilityDays: string[];
  targetAgentName: string;
  maxWorkload: number;
  autoAssignEnabled: boolean;
}

interface AgentWorkload {
  agentName: string;
  assignedLeads: number;
  maxWorkload: number;
  utilizationPct: number;
  regions: string[];
  expertiseTags: string[];
  avgAiScore: number;
  conversionRate: number;
}

interface AssignmentLogEntry {
  id: string;
  leadAddress: string;
  assignedToAgentName: string;
  ruleName: string;
  aiScore: number;
  region: string;
  reason: string;
  assignedAt: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_AGENTS: AgentWorkload[] = [
  { agentName: 'Sarah M.', assignedLeads: 28, maxWorkload: 50, utilizationPct: 56, regions: ['CA', 'NV', 'AZ'], expertiseTags: ['luxury', 'vacation-rental'], avgAiScore: 82, conversionRate: 34 },
  { agentName: 'James T.', assignedLeads: 45, maxWorkload: 50, utilizationPct: 90, regions: ['TX', 'FL', 'GA'], expertiseTags: ['single-family', 'high-regulation'], avgAiScore: 71, conversionRate: 28 },
  { agentName: 'Priya K.', assignedLeads: 12, maxWorkload: 40, utilizationPct: 30, regions: ['NY', 'NJ', 'CT'], expertiseTags: ['condo', 'urban'], avgAiScore: 88, conversionRate: 41 },
  { agentName: 'Carlos R.', assignedLeads: 33, maxWorkload: 50, utilizationPct: 66, regions: ['WA', 'OR', 'ID'], expertiseTags: ['vacation-rental', 'mountain'], avgAiScore: 75, conversionRate: 31 },
  { agentName: 'Dana L.', assignedLeads: 8, maxWorkload: 35, utilizationPct: 23, regions: ['CO', 'UT', 'NM'], expertiseTags: ['ski-resort', 'luxury'], avgAiScore: 91, conversionRate: 45 },
];

const MOCK_LOG: AssignmentLogEntry[] = [
  { id: '1', leadAddress: '1234 Ocean Dr, Miami FL', assignedToAgentName: 'James T.', ruleName: 'FL High-Score Leads', aiScore: 87, region: 'FL', reason: 'AI score 87 ≥ 80, region FL matches, workload 45/50', assignedAt: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: '2', leadAddress: '567 Sunset Blvd, Los Angeles CA', assignedToAgentName: 'Sarah M.', ruleName: 'CA Luxury Leads', aiScore: 92, region: 'CA', reason: 'AI score 92 ≥ 85, luxury tag match, lowest workload in CA pool', assignedAt: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: '3', leadAddress: '890 Park Ave, New York NY', assignedToAgentName: 'Priya K.', ruleName: 'NY Urban Condo', aiScore: 78, region: 'NY', reason: 'Region NY, condo tag match, workload 12/40 (optimal)', assignedAt: new Date(Date.now() - 28 * 60000).toISOString() },
  { id: '4', leadAddress: '321 Mountain Rd, Denver CO', assignedToAgentName: 'Dana L.', ruleName: 'CO Ski Resort', aiScore: 95, region: 'CO', reason: 'AI score 95 (high priority), ski-resort tag, Dana lowest utilization', assignedAt: new Date(Date.now() - 45 * 60000).toISOString() },
  { id: '5', leadAddress: '654 Pine St, Seattle WA', assignedToAgentName: 'Carlos R.', ruleName: 'WA Vacation Rental', aiScore: 73, region: 'WA', reason: 'Region WA, vacation-rental tag, workload balanced', assignedAt: new Date(Date.now() - 90 * 60000).toISOString() },
];

const DEFAULT_RULES: AssignmentRule[] = [
  { id: 'rule-1', name: 'High-Score Priority Leads (AI ≥ 85)', priority: 1, enabled: true, minAiScore: 85, maxAiScore: 100, regions: [], expertiseTags: [], leadStages: ['new', 'contacted'], targetAgentName: 'Dana L.', maxWorkload: 35 },
  { id: 'rule-2', name: 'CA/NV Luxury Vacation Rentals', priority: 2, enabled: true, minAiScore: 70, maxAiScore: 100, regions: ['CA', 'NV', 'AZ'], expertiseTags: ['luxury', 'vacation-rental'], leadStages: [], targetAgentName: 'Sarah M.', maxWorkload: 50 },
  { id: 'rule-3', name: 'NY/NJ Urban Condo Leads', priority: 3, enabled: true, minAiScore: 60, maxAiScore: 100, regions: ['NY', 'NJ', 'CT'], expertiseTags: ['condo', 'urban'], leadStages: [], targetAgentName: 'Priya K.', maxWorkload: 40 },
  { id: 'rule-4', name: 'TX/FL High-Volume Outreach', priority: 4, enabled: false, minAiScore: 50, maxAiScore: 84, regions: ['TX', 'FL', 'GA'], expertiseTags: [], leadStages: [], targetAgentName: 'James T.', maxWorkload: 50 },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const EXPERTISE_OPTIONS = ['luxury', 'vacation-rental', 'single-family', 'condo', 'urban', 'high-regulation', 'ski-resort', 'mountain', 'beach', 'commercial'];
const STAGE_OPTIONS = ['new', 'contacted', 'interested', 'callback', 'proposal', 'closed'];

const REAL_PORTFOLIOS = PORTFOLIOS.filter(p => p.key !== 'all');
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Rule Editor Modal ────────────────────────────────────────────────────────

function RuleEditorModal({
  rule,
  onClose,
  onSave,
}: {
  rule: AssignmentRule | null;
  onClose: () => void;
  onSave: (r: AssignmentRule) => void;
}) {
  const { configuredPortfolios } = usePortfolio();
  const [name, setName] = useState(rule?.name ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? 1);
  const [minScore, setMinScore] = useState(rule?.minAiScore ?? 0);
  const [maxScore, setMaxScore] = useState(rule?.maxAiScore ?? 100);
  const [scoreThreshold, setScoreThreshold] = useState(rule?.scoreThreshold ?? 0);
  const [regions, setRegions] = useState<string[]>(rule?.regions ?? []);
  const [tags, setTags] = useState<string[]>(rule?.expertiseTags ?? []);
  const [stages, setStages] = useState<string[]>(rule?.leadStages ?? []);
  const [portfolios, setPortfolios] = useState<string[]>(rule?.portfolios ?? []);
  const [availStart, setAvailStart] = useState(rule?.availabilityStart ?? '');
  const [availEnd, setAvailEnd] = useState(rule?.availabilityEnd ?? '');
  const [availDays, setAvailDays] = useState<string[]>(rule?.availabilityDays ?? []);
  const [agentName, setAgentName] = useState(rule?.targetAgentName ?? '');
  const [maxWorkload, setMaxWorkload] = useState(rule?.maxWorkload ?? 50);
  const [autoAssign, setAutoAssign] = useState(rule?.autoAssignEnabled ?? true);

  const toggle = (arr: string[], val: string, set: (v: string[]) => void) => {
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const handleSave = () => {
    if (!name.trim() || !agentName.trim()) return;
    onSave({
      id: rule?.id ?? `rule-${Date.now()}`,
      name: name.trim(),
      priority,
      enabled: rule?.enabled ?? true,
      minAiScore: minScore,
      maxAiScore: maxScore,
      scoreThreshold,
      regions,
      expertiseTags: tags,
      leadStages: stages,
      portfolios,
      availabilityStart: availStart,
      availabilityEnd: availEnd,
      availabilityDays: availDays,
      targetAgentName: agentName.trim(),
      maxWorkload,
      autoAssignEnabled: autoAssign,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            {rule ? 'Edit Assignment Rule' : 'New Assignment Rule'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Rule Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. CA Luxury High-Score" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Priority</label>
              <input type="number" min={1} value={priority} onChange={e => setPriority(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Assign To Agent</label>
            <input value={agentName} onChange={e => setAgentName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" placeholder="Agent name" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Min AI Score</label>
              <input type="number" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Max AI Score</label>
              <input type="number" min={0} max={100} value={maxScore} onChange={e => setMaxScore(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Score Threshold</label>
              <input type="number" min={0} max={100} value={scoreThreshold} onChange={e => setScoreThreshold(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" placeholder="Min to qualify" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Max Workload</label>
            <input type="number" min={1} value={maxWorkload} onChange={e => setMaxWorkload(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none" />
          </div>

          {/* Portfolios */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Portfolios (empty = any)</label>
            <div className="flex flex-wrap gap-1.5">
              {configuredPortfolios.map(p => (
                <button key={p.key} onClick={() => toggle(portfolios, p.label, setPortfolios)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${portfolios.includes(p.label) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                  {p.stateCode}
                </button>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Regions (empty = any)</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {US_STATES.map(s => (
                <button key={s} onClick={() => toggle(regions, s, setRegions)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors ${regions.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Expertise Tags */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Expertise Tags (empty = any)</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPERTISE_OPTIONS.map(t => (
                <button key={t} onClick={() => toggle(tags, t, setTags)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${tags.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Stages */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Lead Stages (empty = any)</label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_OPTIONS.map(s => (
                <button key={s} onClick={() => toggle(stages, s, setStages)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors capitalize ${stages.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Availability */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              <Clock size={11} className="inline mr-1" />
              Availability Window (leave empty = always available)
            </label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Start Time</label>
                <input type="time" value={availStart} onChange={e => setAvailStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none mt-1" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">End Time</label>
                <input type="time" value={availEnd} onChange={e => setAvailEnd(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none mt-1" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map(d => (
                <button key={d} onClick={() => toggle(availDays, d, setAvailDays)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${availDays.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-assign toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border">
            <div>
              <div className="text-sm font-semibold text-foreground">Auto-Assign Enabled</div>
              <div className="text-[10px] text-muted-foreground">Automatically assign matching leads without manual trigger</div>
            </div>
            <button
              onClick={() => setAutoAssign(!autoAssign)}
              className={`relative w-10 h-5 rounded-full transition-colors ${autoAssign ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoAssign ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || !agentName.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {rule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadAutoAssignPage() {
  const [rules, setRules] = useState<AssignmentRule[]>(DEFAULT_RULES);
  const [agents] = useState<AgentWorkload[]>(MOCK_AGENTS);
  const [log] = useState<AssignmentLogEntry[]>(MOCK_LOG);
  const [liveLog, setLiveLog] = useState<AssignmentLogEntry[]>([]);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null | undefined>(undefined);
  const [runningAssign, setRunningAssign] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assigned: number; skipped: number } | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lead_assignment_rules');
      if (stored) setRules(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Load recent assignment log from API
  useEffect(() => {
    fetch('/api/leads/auto-assign')
      .then(r => r.json())
      .then(data => {
        if (data.log && data.log.length > 0) {
          const apiLog: AssignmentLogEntry[] = data.log.map((row: any) => ({
            id: row.id,
            leadAddress: row.lead_address || '',
            assignedToAgentName: row.assigned_to_agent_name || '',
            ruleName: row.rule_name || '',
            aiScore: row.ai_score || 0,
            region: row.region || '',
            reason: row.reason || '',
            assignedAt: row.assigned_at || new Date().toISOString(),
          }));
          setLiveLog(apiLog);
        }
      })
      .catch(() => {});
  }, []);

  const saveRules = (updated: AssignmentRule[]) => {
    setRules(updated);
    try { localStorage.setItem('lead_assignment_rules', JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const handleSaveRule = (rule: AssignmentRule) => {
    const updated = editingRule
      ? rules.map(r => r.id === rule.id ? rule : r)
      : [...rules, rule];
    saveRules(updated.sort((a, b) => a.priority - b.priority));
    setEditingRule(undefined);
  };

  const handleDeleteRule = (id: string) => {
    saveRules(rules.filter(r => r.id !== id));
  };

  const handleToggleRule = (id: string) => {
    saveRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const handleRunAssignment = async () => {
    setRunningAssign(true);
    setAssignResult(null);
    try {
      const enabledRules = rules.filter(r => r.enabled);
      if (enabledRules.length === 0) {
        toast.error('No active rules to run. Enable at least one rule first.');
        setRunningAssign(false);
        return;
      }

      const res = await fetch('/api/leads/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: enabledRules }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Auto-assignment failed');
        setRunningAssign(false);
        return;
      }

      const data = await res.json();
      setAssignResult({ assigned: data.assigned ?? 0, skipped: data.skipped ?? 0 });

      // Refresh log from API
      if (data.results && data.results.length > 0) {
        const newEntries: AssignmentLogEntry[] = data.results.map((r: any) => ({
          id: crypto.randomUUID(),
          leadAddress: r.leadAddress,
          assignedToAgentName: r.agentName,
          ruleName: r.ruleName,
          aiScore: r.aiScore,
          region: r.region,
          reason: r.reason,
          assignedAt: new Date().toISOString(),
        }));
        setLiveLog(prev => [...newEntries, ...prev].slice(0, 50));
      }
    } catch {
      toast.error('Network error — could not run auto-assignment');
    } finally {
      setRunningAssign(false);
    }
  };

  const workloadChartData = agents.map(a => ({
    name: a.agentName.split(' ')[0],
    assigned: a.assignedLeads,
    capacity: a.maxWorkload - a.assignedLeads,
  }));

  const totalAssigned = agents.reduce((s, a) => s + a.assignedLeads, 0);
  const totalCapacity = agents.reduce((s, a) => s + a.maxWorkload, 0);
  const overloadedAgents = agents.filter(a => a.utilizationPct >= 85).length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        <Toaster position="top-right" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Brain size={18} className="text-primary" />
              AI Lead Auto-Assignment
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Route leads to agents based on AI score, region, expertise tags, and workload balance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingRule(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <Plus size={12} />New Rule
            </button>
            <button
              onClick={handleRunAssignment}
              disabled={runningAssign}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {runningAssign ? <><RefreshCw size={12} className="animate-spin" />Running…</> : <><Play size={12} />Run Auto-Assign</>}
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Result banner */}
          {assignResult && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <span>
                Auto-assignment complete: <strong>{assignResult.assigned} leads assigned</strong> across {rules.filter(r => r.enabled).length} active rules.
                {assignResult.skipped > 0 && ` ${assignResult.skipped} leads skipped (workload limits reached).`}
              </span>
              <button onClick={() => setAssignResult(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">
                <X size={14} />
              </button>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Zap size={16} /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Rules</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{rules.filter(r => r.enabled).length}</p>
                <p className="text-[10px] text-muted-foreground">{rules.length} total</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0"><Users size={16} /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Leads Assigned</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{totalAssigned}</p>
                <p className="text-[10px] text-muted-foreground">of {totalCapacity} capacity</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${overloadedAgents > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                {overloadedAgents > 0 ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overloaded</p>
                <p className={`text-xl font-bold mt-0.5 ${overloadedAgents > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{overloadedAgents}</p>
                <p className="text-[10px] text-muted-foreground">agents ≥85% capacity</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0"><TrendingUp size={16} /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Performer</p>
                <p className="text-sm font-bold text-foreground mt-0.5 truncate">{agents.sort((a, b) => b.conversionRate - a.conversionRate)[0]?.agentName}</p>
                <p className="text-[10px] text-purple-600">{agents.sort((a, b) => b.conversionRate - a.conversionRate)[0]?.conversionRate}% conv.</p>
              </div>
            </div>
          </div>

          {/* Workload Chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <BarChart2 size={12} />Agent Workload Balance
            </h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={workloadChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="assigned" name="Assigned" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="capacity" name="Available" stackId="a" fill="var(--border)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Agent Workload Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users size={12} />Agent Capacity & Expertise
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Workload</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Utilization</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Regions</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Expertise</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Avg AI Score</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.sort((a, b) => b.utilizationPct - a.utilizationPct).map((agent) => (
                    <tr key={agent.agentName} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                            {agent.agentName.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{agent.agentName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold ${agent.utilizationPct >= 85 ? 'text-red-500' : agent.utilizationPct >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {agent.assignedLeads}/{agent.maxWorkload}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden min-w-[60px]">
                            <div
                              className={`h-full rounded-full ${agent.utilizationPct >= 85 ? 'bg-red-400' : agent.utilizationPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${agent.utilizationPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{agent.utilizationPct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {agent.regions.map(r => (
                            <span key={r} className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-full font-medium">{r}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {agent.expertiseTags.map(t => (
                            <span key={t} className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 rounded-full font-medium">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold ${agent.avgAiScore >= 80 ? 'text-emerald-600' : agent.avgAiScore >= 65 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {agent.avgAiScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${agent.conversionRate >= 35 ? 'text-emerald-600' : agent.conversionRate >= 25 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                          {agent.conversionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assignment Rules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap size={12} />Assignment Rules
                <span className="text-primary font-medium normal-case">({rules.filter(r => r.enabled).length} active)</span>
              </h2>
              <button onClick={() => setEditingRule(null)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus size={11} />Add Rule
              </button>
            </div>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className={`bg-card border rounded-xl overflow-hidden transition-all ${rule.enabled ? 'border-border' : 'border-border/50 opacity-60'}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">#{rule.priority}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{rule.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        → <strong>{rule.targetAgentName}</strong> · AI {rule.minAiScore}–{rule.maxAiScore}
                        {rule.regions.length > 0 && ` · ${rule.regions.slice(0, 3).join(', ')}${rule.regions.length > 3 ? '…' : ''}`}
                        {rule.expertiseTags.length > 0 && ` · ${rule.expertiseTags.slice(0, 2).join(', ')}${rule.expertiseTags.length > 2 ? '…' : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleRule(rule.id)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-border'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={() => setEditingRule(rule)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Settings size={12} /></button>
                      <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 size={12} /></button>
                      <button onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                        {expandedRule === rule.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>
                  {expandedRule === rule.id && (
                    <div className="border-t border-border px-4 py-3 bg-muted/20 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">AI Score Range</p>
                        <p className="text-foreground font-medium">{rule.minAiScore} – {rule.maxAiScore}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Max Workload</p>
                        <p className="text-foreground font-medium">{rule.maxWorkload} leads</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Regions</p>
                        <p className="text-foreground">{rule.regions.length > 0 ? rule.regions.join(', ') : 'Any'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expertise Tags</p>
                        <p className="text-foreground">{rule.expertiseTags.length > 0 ? rule.expertiseTags.join(', ') : 'Any'}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Assignment Log */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target size={12} />Recent Assignment Log
                {liveLog.length > 0 && (
                  <span className="ml-1 text-emerald-600 font-medium normal-case">(live)</span>
                )}
              </h2>
            </div>
            <div className="divide-y divide-border/50">
              {(liveLog.length > 0 ? liveLog : log).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0 mt-0.5">
                    {entry.assignedToAgentName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{entry.leadAddress}</span>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">AI {entry.aiScore}</span>
                      {entry.region && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">{entry.region}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      → <strong>{entry.assignedToAgentName}</strong> via <em>{entry.ruleName}</em>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{entry.reason}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {Math.round((Date.now() - new Date(entry.assignedAt).getTime()) / 60000)}m ago
                  </span>
                </div>
              ))}
              {liveLog.length === 0 && log.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No assignments yet. Run auto-assign to populate this log.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingRule !== undefined && (
        <RuleEditorModal
          rule={editingRule}
          onClose={() => setEditingRule(undefined)}
          onSave={handleSaveRule}
        />
      )}
    </AppLayout>
  );
}
