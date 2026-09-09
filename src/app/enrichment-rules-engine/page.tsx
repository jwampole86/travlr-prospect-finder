'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Shield, Plus, Trash2, Save, RefreshCw, AlertTriangle, CheckCircle2, Info, Zap, Settings, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleType =
  | 'ownership_min_confidence' |'market_comp_freshness_days' |'price_anomaly_pct' |'overall_min_confidence' |'field_min_confidence';

type RuleAction = 'flag' | 'block' | 'notify';
type RuleSeverity = 'info' | 'warning' | 'critical';

interface ConfidenceRule {
  id: string;
  rule_name: string;
  rule_type: RuleType;
  threshold_value: number;
  target_field: string | null;
  action: RuleAction;
  severity: RuleSeverity;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ViolationSummary {
  rule_name: string;
  rule_type: string;
  severity: string;
  count: number;
  last_detected: string;
}

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  ownership_min_confidence: 'Ownership Min Confidence',
  market_comp_freshness_days: 'Market Comp Freshness (days)',
  price_anomaly_pct: 'Price Anomaly (%)',
  overall_min_confidence: 'Overall Min Confidence',
  field_min_confidence: 'Field Min Confidence',
};

const RULE_TYPE_DESCRIPTIONS: Record<RuleType, string> = {
  ownership_min_confidence: 'Minimum Anthropic confidence score (0–100) for ownership records',
  market_comp_freshness_days: 'Maximum age in days before market comp data is considered stale',
  price_anomaly_pct: 'Maximum % deviation between listing price and estimated value',
  overall_min_confidence: 'Minimum overall Anthropic confidence score (0–100)',
  field_min_confidence: 'Minimum confidence for a specific enrichment field',
};

const SEVERITY_STYLES: Record<RuleSeverity, string> = {
  info: 'text-blue-600 bg-blue-50 border-blue-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  critical: 'text-red-600 bg-red-50 border-red-200',
};

const ACTION_STYLES: Record<RuleAction, string> = {
  flag: 'text-amber-700 bg-amber-50',
  block: 'text-red-700 bg-red-50',
  notify: 'text-blue-700 bg-blue-50',
};

function SeverityIcon({ severity }: { severity: RuleSeverity }) {
  if (severity === 'critical') return <AlertTriangle size={14} className="text-red-500" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-500" />;
  return <Info size={14} className="text-blue-500" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnrichmentRulesEnginePage() {
  const supabase = createClient();

  const [rules, setRules] = useState<ConfidenceRule[]>([]);
  const [violations, setViolations] = useState<ViolationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [totalViolations, setTotalViolations] = useState(0);
  const [unresolvedViolations, setUnresolvedViolations] = useState(0);

  // New rule form state
  const [newRule, setNewRule] = useState<Partial<ConfidenceRule>>({
    rule_name: '',
    rule_type: 'ownership_min_confidence',
    threshold_value: 70,
    target_field: null,
    action: 'flag',
    severity: 'warning',
    enabled: true,
    description: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesResult, violationsResult, totalResult, unresolvedResult] =
        await Promise.all([
          supabase
            .from('enrichment_confidence_rules')
            .select('*')
            .order('created_at', { ascending: true }),
          supabase
            .from('rules_engine_violations')
            .select('rule_name, rule_type, severity, detected_at')
            .order('detected_at', { ascending: false })
            .limit(200),
          supabase
            .from('rules_engine_violations')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('rules_engine_violations')
            .select('*', { count: 'exact', head: true })
            .eq('resolved', false),
        ]);

      const rulesData = rulesResult.data;
      const violationsData = violationsResult.data;
      const totalCount = totalResult.count;
      const unresolvedCount = unresolvedResult.count;

      setRules((rulesData || []) as ConfidenceRule[]);
      setTotalViolations(totalCount || 0);
      setUnresolvedViolations(unresolvedCount || 0);

      // Aggregate violations by rule
      const aggMap = new Map<string, ViolationSummary>();
      for (const v of violationsData || []) {
        const key = v.rule_name;
        if (!aggMap.has(key)) {
          aggMap.set(key, {
            rule_name: v.rule_name,
            rule_type: v.rule_type,
            severity: v.severity,
            count: 0,
            last_detected: v.detected_at,
          });
        }
        const entry = aggMap.get(key)!;
        entry.count++;
        if (v.detected_at > entry.last_detected) entry.last_detected = v.detected_at;
      }
      setViolations(Array.from(aggMap.values()).sort((a, b) => b.count - a.count));
    } catch (err) {
      console.error('Rules engine load error', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggleRule(rule: ConfidenceRule) {
    setSaving(rule.id);
    const { error } = await supabase
      .from('enrichment_confidence_rules')
      .update({ enabled: !rule.enabled, updated_at: new Date().toISOString() })
      .eq('id', rule.id);

    if (error) {
      toast.error('Failed to update rule');
    } else {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      toast.success(`Rule ${rule.enabled ? 'disabled' : 'enabled'}`);
    }
    setSaving(null);
  }

  async function updateThreshold(ruleId: string, value: number) {
    setSaving(ruleId);
    const { error } = await supabase
      .from('enrichment_confidence_rules')
      .update({ threshold_value: value, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to save threshold');
    } else {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, threshold_value: value } : r));
      toast.success('Threshold saved');
    }
    setSaving(null);
  }

  async function updateAction(ruleId: string, action: RuleAction) {
    setSaving(ruleId);
    const { error } = await supabase
      .from('enrichment_confidence_rules')
      .update({ action, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to save action');
    } else {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, action } : r));
      toast.success('Action updated');
    }
    setSaving(null);
  }

  async function updateSeverity(ruleId: string, severity: RuleSeverity) {
    setSaving(ruleId);
    const { error } = await supabase
      .from('enrichment_confidence_rules')
      .update({ severity, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to save severity');
    } else {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, severity } : r));
      toast.success('Severity updated');
    }
    setSaving(null);
  }

  async function deleteRule(ruleId: string) {
    const { error } = await supabase
      .from('enrichment_confidence_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to delete rule');
    } else {
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast.success('Rule deleted');
    }
  }

  async function addRule() {
    if (!newRule.rule_name?.trim()) {
      toast.error('Rule name is required');
      return;
    }
    setSaving('new');
    const { data, error } = await supabase
      .from('enrichment_confidence_rules')
      .insert({
        rule_name: newRule.rule_name,
        rule_type: newRule.rule_type,
        threshold_value: newRule.threshold_value,
        target_field: newRule.target_field || null,
        action: newRule.action,
        severity: newRule.severity,
        enabled: true,
        description: newRule.description || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create rule');
    } else {
      setRules(prev => [...prev, data as ConfidenceRule]);
      setShowAddForm(false);
      setNewRule({
        rule_name: '',
        rule_type: 'ownership_min_confidence',
        threshold_value: 70,
        target_field: null,
        action: 'flag',
        severity: 'warning',
        enabled: true,
        description: '',
      });
      toast.success('Rule created');
    }
    setSaving(null);
  }

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Settings size={24} className="text-primary" />
              Enrichment Rules Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define confidence thresholds for ownership records, market comp freshness, and price anomalies · Violations flagged during sync
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
            >
              <Plus size={14} />
              Add Rule
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Rules', value: enabledCount, icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Total Rules', value: rules.length, icon: Settings, color: 'text-primary', bg: 'bg-card border-border' },
            { label: 'Unresolved Violations', value: unresolvedViolations, icon: AlertTriangle, color: unresolvedViolations > 0 ? 'text-red-500' : 'text-emerald-500', bg: unresolvedViolations > 0 ? 'bg-red-50 border-red-200' : 'bg-card border-border' },
            { label: 'Total Violations', value: totalViolations, icon: BarChart2, color: 'text-amber-500', bg: 'bg-card border-border' },
          ].map(m => {
            const IconComp = m.icon;
            return (
              <div key={m.label} className={`rounded-xl p-4 border ${m.bg} flex items-center gap-3`}>
                <IconComp size={20} className={m.color} />
                <div>
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Rule Form */}
        {showAddForm && (
          <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              New Confidence Rule
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule Name *</label>
                <input
                  value={newRule.rule_name || ''}
                  onChange={e => setNewRule(p => ({ ...p, rule_name: e.target.value }))}
                  placeholder="e.g. Strict Ownership Confidence"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule Type</label>
                <select
                  value={newRule.rule_type}
                  onChange={e => setNewRule(p => ({ ...p, rule_type: e.target.value as RuleType }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Threshold Value
                  <span className="ml-1 text-muted-foreground/60">
                    ({newRule.rule_type === 'market_comp_freshness_days' ? 'days' : newRule.rule_type === 'price_anomaly_pct' ? '%' : '0–100'})
                  </span>
                </label>
                <input
                  type="number"
                  value={newRule.threshold_value || 70}
                  onChange={e => setNewRule(p => ({ ...p, threshold_value: Number(e.target.value) }))}
                  min={0}
                  max={newRule.rule_type === 'market_comp_freshness_days' ? 365 : newRule.rule_type === 'price_anomaly_pct' ? 200 : 100}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {newRule.rule_type === 'field_min_confidence' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Field</label>
                  <input
                    value={newRule.target_field || ''}
                    onChange={e => setNewRule(p => ({ ...p, target_field: e.target.value }))}
                    placeholder="e.g. ownerName, listingPrice"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
                <select
                  value={newRule.action}
                  onChange={e => setNewRule(p => ({ ...p, action: e.target.value as RuleAction }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="flag">Flag</option>
                  <option value="block">Block</option>
                  <option value="notify">Notify</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Severity</label>
                <select
                  value={newRule.severity}
                  onChange={e => setNewRule(p => ({ ...p, severity: e.target.value as RuleSeverity }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
                <input
                  value={newRule.description || ''}
                  onChange={e => setNewRule(p => ({ ...p, description: e.target.value }))}
                  placeholder="Describe when this rule fires and why"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={addRule}
                disabled={saving === 'new'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Save size={14} />
                {saving === 'new' ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </div>
        )}

        {/* Rules Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield size={14} className="text-primary" />
              Confidence Threshold Rules
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center">
              <Settings size={32} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No rules defined</p>
              <p className="text-xs text-muted-foreground mt-1">Add rules to start flagging enrichment violations during sync</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rules.map(rule => (
                <div key={rule.id} className={`px-5 py-4 ${!rule.enabled ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-4">
                    {/* Enable toggle */}
                    <button
                      onClick={() => toggleRule(rule)}
                      disabled={saving === rule.id}
                      className={`mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 ${rule.enabled ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <SeverityIcon severity={rule.severity} />
                        <span className="text-sm font-medium text-foreground">{rule.rule_name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[rule.severity]}`}>
                          {rule.severity}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLES[rule.action]}`}>
                          {rule.action}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {RULE_TYPE_DESCRIPTIONS[rule.rule_type]}
                        {rule.target_field && ` · Field: ${rule.target_field}`}
                      </p>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{rule.description}</p>
                      )}
                    </div>

                    {/* Threshold editor */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">Threshold:</span>
                      <ThresholdInput
                        value={rule.threshold_value}
                        ruleType={rule.rule_type}
                        onSave={v => updateThreshold(rule.id, v)}
                        saving={saving === rule.id}
                      />
                    </div>

                    {/* Action selector */}
                    <select
                      value={rule.action}
                      onChange={e => updateAction(rule.id, e.target.value as RuleAction)}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground shrink-0"
                    >
                      <option value="flag">Flag</option>
                      <option value="block">Block</option>
                      <option value="notify">Notify</option>
                    </select>

                    {/* Severity selector */}
                    <select
                      value={rule.severity}
                      onChange={e => updateSeverity(rule.id, e.target.value as RuleSeverity)}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground shrink-0"
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>

                    {/* Delete */}
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Violations Summary */}
        {violations.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Zap size={14} className="text-primary" />
                Recent Violation Summary
              </h2>
            </div>
            <div className="divide-y divide-border">
              {violations.map(v => (
                <div key={v.rule_name} className="px-5 py-3 flex items-center gap-4">
                  <SeverityIcon severity={v.severity as RuleSeverity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{v.rule_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last: {new Date(v.last_detected).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${SEVERITY_STYLES[v.severity as RuleSeverity]}`}>
                    {v.count} violation{v.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Inline threshold editor ──────────────────────────────────────────────────

function ThresholdInput({
  value,
  ruleType,
  onSave,
  saving,
}: {
  value: number;
  ruleType: RuleType;
  onSave: (v: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const unit =
    ruleType === 'market_comp_freshness_days' ?'days'
      : ruleType === 'price_anomaly_pct' ?'%' :'';

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-sm font-semibold text-primary hover:underline"
      >
        {value}{unit}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={draft}
        onChange={e => setDraft(Number(e.target.value))}
        className="w-16 px-2 py-0.5 rounded border border-primary text-sm text-foreground bg-background focus:outline-none"
        autoFocus
      />
      <button
        onClick={() => { onSave(draft); setEditing(false); }}
        disabled={saving}
        className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-all"
      >
        <CheckCircle2 size={14} />
      </button>
    </div>
  );
}
