'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { SlidersHorizontal, Shield, Phone, User, Star, ToggleLeft, ToggleRight, Edit2, Check, X, FlaskConical, History, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown, Minus, Download, Info, CheckCircle, XCircle, Clock,  } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleCategory = 'enrichment' | 'confidence' | 'phone' | 'profile';

interface ScoringRule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  weight: number;
  enabled: boolean;
  condition: string;
  impact: 'high' | 'medium' | 'low';
  affectedLeads: number;
  avgScoreDelta: number;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  ruleId: string;
  ruleName: string;
  oldValue: string;
  newValue: string;
  reasonCode: string;
  reason: string;
}

interface TestResult {
  leadId: string;
  leadName: string;
  oldScore: number;
  newScore: number;
  delta: number;
  triggered: string[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_RULES: ScoringRule[] = [
  {
    id: 'rule-enrich-stage',
    name: 'Enrichment Stage Completion',
    description: 'Scores leads higher when enrichment pipeline has completed more stages (contact discovery, property data, social profiles).',
    category: 'enrichment',
    weight: 25,
    enabled: true,
    condition: 'enrichment_stage >= 3',
    impact: 'high',
    affectedLeads: 1842,
    avgScoreDelta: 18,
  },
  {
    id: 'rule-enrich-freshness',
    name: 'Enrichment Data Freshness',
    description: 'Penalizes leads whose enrichment data is older than 90 days, as contact details may be stale.',
    category: 'enrichment',
    weight: 10,
    enabled: true,
    condition: 'days_since_enrichment < 90',
    impact: 'medium',
    affectedLeads: 634,
    avgScoreDelta: -8,
  },
  {
    id: 'rule-contact-confidence',
    name: 'Contact Confidence Score',
    description: 'Boosts score when the contact confidence level from PDL or enrichment provider is above 80%.',
    category: 'confidence',
    weight: 30,
    enabled: true,
    condition: 'contact_confidence >= 80',
    impact: 'high',
    affectedLeads: 2103,
    avgScoreDelta: 22,
  },
  {
    id: 'rule-contact-confidence-low',
    name: 'Low Confidence Penalty',
    description: 'Reduces score when contact confidence is below 40%, indicating unreliable contact data.',
    category: 'confidence',
    weight: 15,
    enabled: true,
    condition: 'contact_confidence < 40',
    impact: 'medium',
    affectedLeads: 489,
    avgScoreDelta: -14,
  },
  {
    id: 'rule-phone-valid',
    name: 'Phone Number Validity',
    description: 'Increases score for leads with a verified, valid mobile phone number (not landline or VoIP).',
    category: 'phone',
    weight: 20,
    enabled: true,
    condition: 'phone_valid = true AND phone_type = mobile',
    impact: 'high',
    affectedLeads: 1567,
    avgScoreDelta: 16,
  },
  {
    id: 'rule-phone-dnc',
    name: 'DNC Registry Check',
    description: 'Heavily penalizes leads on the Do Not Call registry to prevent TCPA violations.',
    category: 'phone',
    weight: 35,
    enabled: true,
    condition: 'on_dnc_registry = false',
    impact: 'high',
    affectedLeads: 312,
    avgScoreDelta: -35,
  },
  {
    id: 'rule-profile-strength',
    name: 'Profile Completeness',
    description: 'Rewards leads with complete profiles: name, address, email, phone, and property details all present.',
    category: 'profile',
    weight: 20,
    enabled: true,
    condition: 'profile_completeness >= 75',
    impact: 'medium',
    affectedLeads: 1290,
    avgScoreDelta: 12,
  },
  {
    id: 'rule-profile-social',
    name: 'Social Profile Match',
    description: 'Adds score when a verified LinkedIn or social profile is matched to the lead record.',
    category: 'profile',
    weight: 8,
    enabled: false,
    condition: 'social_profile_matched = true',
    impact: 'low',
    affectedLeads: 445,
    avgScoreDelta: 6,
  },
];

const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: 'audit-1',
    timestamp: '2026-08-14 16:42:00',
    actor: 'admin@travlr.com',
    action: 'weight_change',
    ruleId: 'rule-contact-confidence',
    ruleName: 'Contact Confidence Score',
    oldValue: '25',
    newValue: '30',
    reasonCode: 'PERF_TUNE',
    reason: 'Increased weight after A/B test showed higher conversion for high-confidence contacts',
  },
  {
    id: 'audit-2',
    timestamp: '2026-08-13 11:15:00',
    actor: 'admin@travlr.com',
    action: 'rule_disabled',
    ruleId: 'rule-profile-social',
    ruleName: 'Social Profile Match',
    oldValue: 'enabled',
    newValue: 'disabled',
    reasonCode: 'DATA_QUALITY',
    reason: 'Social match rate too low (<12%) causing noise in scoring',
  },
  {
    id: 'audit-3',
    timestamp: '2026-08-12 09:30:00',
    actor: 'ops@travlr.com',
    action: 'weight_change',
    ruleId: 'rule-phone-dnc',
    ruleName: 'DNC Registry Check',
    oldValue: '25',
    newValue: '35',
    reasonCode: 'COMPLIANCE',
    reason: 'Compliance review mandated stronger DNC penalty to reduce TCPA risk',
  },
];

const REASON_CODES = ['PERF_TUNE', 'COMPLIANCE', 'DATA_QUALITY', 'BUSINESS_RULE', 'MANUAL_OVERRIDE', 'A_B_TEST'];

const CATEGORY_META: Record<RuleCategory, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  enrichment: { label: 'Enrichment Stage', icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  confidence: { label: 'Contact Confidence', icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  phone: { label: 'Phone Validity', icon: Phone, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  profile: { label: 'Profile Strength', icon: User, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
};

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const ACTION_LABELS: Record<string, string> = {
  weight_change: 'Weight Changed',
  rule_disabled: 'Rule Disabled',
  rule_enabled: 'Rule Enabled',
  condition_change: 'Condition Updated',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onEdit,
  onTest,
}: {
  rule: ScoringRule;
  onToggle: (id: string) => void;
  onEdit: (rule: ScoringRule) => void;
  onTest: (rule: ScoringRule) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[rule.category];
  const CatIcon = meta.icon;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${rule.enabled ? 'border-border' : 'border-border opacity-60'}`}>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
            <CatIcon size={14} className={meta.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{rule.name}</span>
              {!rule.enabled && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">DISABLED</span>
              )}
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold capitalize ${IMPACT_COLORS[rule.impact]}`}>
                {rule.impact} impact
              </span>
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${meta.bg} ${meta.color} ${meta.border}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{rule.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onTest(rule)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-[11px] font-medium transition-colors"
            >
              <FlaskConical size={11} />
              Test
            </button>
            <button
              onClick={() => onEdit(rule)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-[11px] font-medium transition-colors"
            >
              <Edit2 size={11} />
              Edit
            </button>
            <button
              onClick={() => onToggle(rule.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                rule.enabled
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' :'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {rule.enabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
              {rule.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-5 mt-3 pt-3 border-t border-border">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</p>
            <p className="text-sm font-bold text-foreground">{rule.weight}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Affected Leads</p>
            <p className="text-sm font-bold text-foreground">{rule.affectedLeads.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score Δ</p>
            <div className="flex items-center gap-1">
              {rule.avgScoreDelta > 0 ? (
                <TrendingUp size={11} className="text-emerald-500" />
              ) : rule.avgScoreDelta < 0 ? (
                <TrendingDown size={11} className="text-red-500" />
              ) : (
                <Minus size={11} className="text-muted-foreground" />
              )}
              <p className={`text-sm font-bold ${rule.avgScoreDelta > 0 ? 'text-emerald-500' : rule.avgScoreDelta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {rule.avgScoreDelta > 0 ? '+' : ''}{rule.avgScoreDelta}
              </p>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Weight Bar</p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${meta.bg.replace('/10', '')} ${meta.color.replace('text-', 'bg-')}`}
                style={{ width: `${rule.weight}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>

        {/* Expanded condition */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Condition Expression</p>
            <code className="block text-xs bg-muted rounded-lg px-3 py-2 text-foreground font-mono border border-border">
              {rule.condition}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditRuleModal({
  rule,
  onSave,
  onClose,
}: {
  rule: ScoringRule;
  onSave: (updated: ScoringRule, reasonCode: string, reason: string) => void;
  onClose: () => void;
}) {
  const [weight, setWeight] = useState(rule.weight);
  const [condition, setCondition] = useState(rule.condition);
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]);
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-foreground">Edit Rule</h2>
            <p className="text-[11px] text-muted-foreground">{rule.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Weight slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-foreground">Rule Weight</label>
              <span className="text-lg font-bold text-foreground">{weight}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weight}
              onChange={e => setWeight(parseInt(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted"
              style={{
                background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${weight}%, var(--color-muted) ${weight}%, var(--color-muted) 100%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0% (no effect)</span>
              <span>100% (dominant)</span>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Condition Expression</label>
            <textarea
              value={condition}
              onChange={e => setCondition(e.target.value)}
              rows={2}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <Info size={10} />
              Use field names from the lead schema. Changes take effect on next re-score cycle.
            </p>
          </div>

          {/* Reason code */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Reason Code</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              {REASON_CODES.map(rc => (
                <option key={rc} value={rc}>{rc}</option>
              ))}
            </select>
          </div>

          {/* Reason text */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Change Reason <span className="text-muted-foreground font-normal">(required for audit)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Explain why this rule is being changed..."
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...rule, weight, condition }, reasonCode, reason)}
            disabled={!reason.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test Impact Modal ────────────────────────────────────────────────────────

function TestImpactModal({ rule, onClose }: { rule: ScoringRule; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);

  const runTest = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const mockResults: TestResult[] = [
        { leadId: 'L-001', leadName: 'Sarah Mitchell', oldScore: 62, newScore: 62 + rule.avgScoreDelta, delta: rule.avgScoreDelta, triggered: [rule.name] },
        { leadId: 'L-002', leadName: 'James Thornton', oldScore: 45, newScore: 45 + Math.round(rule.avgScoreDelta * 0.8), delta: Math.round(rule.avgScoreDelta * 0.8), triggered: [rule.name] },
        { leadId: 'L-003', leadName: 'Maria Santos', oldScore: 78, newScore: 78, delta: 0, triggered: [] },
        { leadId: 'L-004', leadName: 'David Chen', oldScore: 55, newScore: 55 + rule.avgScoreDelta, delta: rule.avgScoreDelta, triggered: [rule.name] },
        { leadId: 'L-005', leadName: 'Emily Park', oldScore: 33, newScore: 33 + Math.round(rule.avgScoreDelta * 1.1), delta: Math.round(rule.avgScoreDelta * 1.1), triggered: [rule.name] },
      ];
      setResults(mockResults);
      setRunning(false);
    }, 1200);
  }, [rule]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FlaskConical size={13} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Test Rule Impact</h2>
              <p className="text-[11px] text-muted-foreground">{rule.name} · {rule.affectedLeads.toLocaleString()} leads in scope</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!results && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                <FlaskConical size={22} className="text-amber-500" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Simulate Rule on Existing Leads</p>
              <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
                Run a dry-run simulation to see how this rule would affect lead scores without committing changes.
              </p>
              <button
                onClick={runTest}
                disabled={running}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors mx-auto disabled:opacity-60"
              >
                {running ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running simulation...
                  </>
                ) : (
                  <>
                    <FlaskConical size={13} />
                    Run Impact Test
                  </>
                )}
              </button>
            </div>
          )}

          {results && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Leads Affected', value: results.filter(r => r.delta !== 0).length, color: 'text-amber-500' },
                  { label: 'Avg Score Change', value: `${results.filter(r => r.delta !== 0).reduce((s, r) => s + r.delta, 0) / Math.max(results.filter(r => r.delta !== 0).length, 1) > 0 ? '+' : ''}${Math.round(results.filter(r => r.delta !== 0).reduce((s, r) => s + r.delta, 0) / Math.max(results.filter(r => r.delta !== 0).length, 1))}`, color: rule.avgScoreDelta > 0 ? 'text-emerald-500' : 'text-red-500' },
                  { label: 'No Change', value: results.filter(r => r.delta === 0).length, color: 'text-muted-foreground' },
                ].map(stat => (
                  <div key={stat.label} className="bg-muted/40 rounded-xl p-3 border border-border text-center">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">Sample Lead Impact (5 of {rule.affectedLeads.toLocaleString()})</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Lead</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Old Score</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground">New Score</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Delta</th>
                      <th className="text-center px-4 py-2 font-semibold text-muted-foreground">Triggered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={r.leadId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.leadName}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{r.oldScore}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-foreground">{Math.max(0, Math.min(100, r.newScore))}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-bold ${r.delta > 0 ? 'text-emerald-500' : r.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {r.delta > 0 ? '+' : ''}{r.delta}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.triggered.length > 0 ? (
                            <CheckCircle size={13} className="text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle size={13} className="text-muted-foreground mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Confirm Modal ─────────────────────────────────────────────────────

function ToggleConfirmModal({
  rule,
  onConfirm,
  onClose,
}: {
  rule: ScoringRule;
  onConfirm: (reasonCode: string, reason: string) => void;
  onClose: () => void;
}) {
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]);
  const [reason, setReason] = useState('');
  const action = rule.enabled ? 'disable' : 'enable';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground capitalize">{action} Rule</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className={`rounded-xl p-3 border flex items-start gap-2.5 ${rule.enabled ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
            <AlertTriangle size={14} className={rule.enabled ? 'text-red-500 mt-0.5' : 'text-emerald-500 mt-0.5'} />
            <div>
              <p className="text-xs font-semibold text-foreground">{rule.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {rule.enabled
                  ? `Disabling this rule will stop it from affecting ${rule.affectedLeads.toLocaleString()} leads on the next re-score cycle.`
                  : `Enabling this rule will apply it to ${rule.affectedLeads.toLocaleString()} leads on the next re-score cycle.`}
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Reason Code</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              {REASON_CODES.map(rc => <option key={rc} value={rc}>{rc}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Reason <span className="text-muted-foreground font-normal">(required)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder={`Why are you ${action}ing this rule?`}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reasonCode, reason)}
            disabled={!reason.trim()}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
              rule.enabled ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'
            }`}
          >
            {action === 'disable' ? 'Disable Rule' : 'Enable Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'rules' | 'audit';

export default function ScoringRulesPage() {
  const [rules, setRules] = useState<ScoringRule[]>(INITIAL_RULES);
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [tab, setTab] = useState<Tab>('rules');
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [testingRule, setTestingRule] = useState<ScoringRule | null>(null);
  const [togglingRule, setTogglingRule] = useState<ScoringRule | null>(null);

  const filteredRules = rules.filter(r => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (statusFilter === 'enabled' && !r.enabled) return false;
    if (statusFilter === 'disabled' && r.enabled) return false;
    return true;
  });

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalWeight = rules.filter(r => r.enabled).reduce((s, r) => s + r.weight, 0);

  function handleToggle(id: string) {
    const rule = rules.find(r => r.id === id);
    if (rule) setTogglingRule(rule);
  }

  function confirmToggle(reasonCode: string, reason: string) {
    if (!togglingRule) return;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newEnabled = !togglingRule.enabled;
    setRules(prev => prev.map(r => r.id === togglingRule.id ? { ...r, enabled: newEnabled } : r));
    setAudit(prev => [{
      id: `audit-${Date.now()}`,
      timestamp: now,
      actor: 'admin@travlr.com',
      action: newEnabled ? 'rule_enabled' : 'rule_disabled',
      ruleId: togglingRule.id,
      ruleName: togglingRule.name,
      oldValue: togglingRule.enabled ? 'enabled' : 'disabled',
      newValue: newEnabled ? 'enabled' : 'disabled',
      reasonCode,
      reason,
    }, ...prev]);
    setTogglingRule(null);
  }

  function handleSaveEdit(updated: ScoringRule, reasonCode: string, reason: string) {
    if (!editingRule) return;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    const changes: string[] = [];
    if (editingRule.weight !== updated.weight) changes.push(`weight: ${editingRule.weight}→${updated.weight}`);
    if (editingRule.condition !== updated.condition) changes.push('condition updated');
    setAudit(prev => [{
      id: `audit-${Date.now()}`,
      timestamp: now,
      actor: 'admin@travlr.com',
      action: changes.some(c => c.includes('weight')) ? 'weight_change' : 'condition_change',
      ruleId: updated.id,
      ruleName: updated.name,
      oldValue: `weight: ${editingRule.weight}%`,
      newValue: `weight: ${updated.weight}%`,
      reasonCode,
      reason,
    }, ...prev]);
    setEditingRule(null);
  }

  function exportAudit() {
    const rows = [
      ['Timestamp', 'Actor', 'Action', 'Rule', 'Old Value', 'New Value', 'Reason Code', 'Reason'],
      ...audit.map(a => [a.timestamp, a.actor, ACTION_LABELS[a.action] || a.action, a.ruleName, a.oldValue, a.newValue, a.reasonCode, a.reason]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scoring-rules-audit.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <SlidersHorizontal size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Scoring Rules</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enabledCount} active rules · total weight {totalWeight}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'audit' && (
              <button
                onClick={exportAudit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors"
              >
                <Download size={12} />
                Export Audit
              </button>
            )}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['rules', 'audit'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                    tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'rules' ? <SlidersHorizontal size={11} /> : <History size={11} />}
                  {t === 'rules' ? 'Rules' : 'Audit Log'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'rules' && (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Active Rules', value: enabledCount, sub: `of ${rules.length} total`, color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: CheckCircle },
                  { label: 'Disabled Rules', value: rules.length - enabledCount, sub: 'not scoring', color: 'text-muted-foreground', bg: 'bg-muted', icon: XCircle },
                  { label: 'Total Weight', value: `${totalWeight}%`, sub: 'active rules combined', color: totalWeight > 100 ? 'text-amber-500' : 'text-blue-500', bg: 'bg-blue-500/10', icon: Star },
                  { label: 'Leads in Scope', value: rules.filter(r => r.enabled).reduce((s, r) => s + r.affectedLeads, 0).toLocaleString(), sub: 'across active rules', color: 'text-violet-500', bg: 'bg-violet-500/10', icon: User },
                ].map(stat => {
                  const SIcon = stat.icon;
                  return (
                    <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                        <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                          <SIcon size={13} className={stat.color} />
                        </div>
                      </div>
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
                    </div>
                  );
                })}
              </div>

              {/* Weight warning */}
              {totalWeight > 100 && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-600 font-medium">
                    Combined active rule weight is {totalWeight}% (exceeds 100%). Scores may be inflated — consider normalizing weights.
                  </p>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {(['all', 'enrichment', 'confidence', 'phone', 'profile'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                        categoryFilter === cat ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat === 'all' ? 'All Categories' : CATEGORY_META[cat].label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {(['all', 'enabled', 'disabled'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                        statusFilter === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{filteredRules.length} rules shown</span>
              </div>

              {/* Rules list */}
              <div className="space-y-3">
                {filteredRules.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    onEdit={setEditingRule}
                    onTest={setTestingRule}
                  />
                ))}
                {filteredRules.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <SlidersHorizontal size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No rules match the current filters</p>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'audit' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Rule Change Audit Log</h3>
                <span className="text-xs text-muted-foreground">{audit.length} entries</span>
              </div>
              <div className="divide-y divide-border">
                {audit.map(entry => (
                  <div key={entry.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Clock size={12} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">{entry.ruleName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-semibold text-muted-foreground border border-border">
                            {ACTION_LABELS[entry.action] || entry.action}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20">
                            {entry.reasonCode}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{entry.reason}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span>{entry.actor}</span>
                          <span>·</span>
                          <span>{entry.timestamp}</span>
                          <span>·</span>
                          <span className="line-through opacity-60">{entry.oldValue}</span>
                          <span>→</span>
                          <span className="font-semibold text-foreground">{entry.newValue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {audit.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <History size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No audit entries yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingRule && (
        <EditRuleModal rule={editingRule} onSave={handleSaveEdit} onClose={() => setEditingRule(null)} />
      )}
      {testingRule && (
        <TestImpactModal rule={testingRule} onClose={() => setTestingRule(null)} />
      )}
      {togglingRule && (
        <ToggleConfirmModal rule={togglingRule} onConfirm={confirmToggle} onClose={() => setTogglingRule(null)} />
      )}
    </AppLayout>
  );
}
