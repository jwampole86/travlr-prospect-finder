'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { enrichmentService } from '@/lib/services/enrichmentService';
import { createClient } from '@/lib/supabase/client';
import { DollarSign, TrendingUp, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Zap, Target, Activity, ChevronDown, ChevronUp,  } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CostRow {
  provider: string;
  stage: string;
  total_cost: number;
  total_calls: number;
  success_rate: number;
}

interface RecentLog {
  id: string;
  lead_id: string;
  provider: string;
  stage: string;
  cost: number;
  success: boolean;
  error_message?: string;
  called_at: string;
}

interface AutoEnrichResult {
  enriched: number;
  skipped: number;
  errors: number;
  leads: Array<{ id: string; address: string; score: number; result: string }>;
}

const STAGE_LABELS: Record<string, string> = {
  stage1: 'Stage 1 — Owner Lookup',
  stage2: 'Stage 2 — Contact Enrichment',
  stage3: 'Stage 3 — Skip Trace',
};

const STAGE_COLORS: Record<string, string> = {
  stage1: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  stage2: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  stage3: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

const PROVIDER_COLORS: Record<string, string> = {
  'BatchData': '#3b82f6',
  'People Data Labs': '#8b5cf6',
  'PDL': '#8b5cf6',
  'Salesgenie': '#10b981',
  'Skip Trace Provider': '#f59e0b',
};

function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider] || '#6b7280';
}

function KPICard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 ${accent || 'border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className="font-mono text-xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

export default function EnrichmentCostPage() {
  const [costSummary, setCostSummary] = useState<CostRow[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoEnriching, setAutoEnriching] = useState(false);
  const [autoEnrichResult, setAutoEnrichResult] = useState<AutoEnrichResult | null>(null);
  const [showResultDetail, setShowResultDetail] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'stage1' | 'stage2' | 'stage3'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, logs] = await Promise.all([
        enrichmentService.getCostSummary(),
        (async () => {
          const supabase = createClient();
          const { data } = await supabase
            .from('enrichment_api_logs')
            .select('*')
            .order('called_at', { ascending: false })
            .limit(100);
          return (data || []) as RecentLog[];
        })(),
      ]);
      setCostSummary(summary);
      setRecentLogs(logs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics ──────────────────────────────────────────────────────
  const totalSpend = costSummary.reduce((s, r) => s + r.total_cost, 0);
  const totalCalls = costSummary.reduce((s, r) => s + r.total_calls, 0);

  const stage1Row = costSummary.find(r => r.stage === 'stage1' && r.provider === 'BatchData');
  const stage2Row = costSummary.find(r => r.stage === 'stage2' && r.provider === 'People Data Labs');

  const stage1Successes = recentLogs.filter(l => l.stage === 'stage1' && l.success).length;
  const stage1Total = recentLogs.filter(l => l.stage === 'stage1').length;
  const stage2Successes = recentLogs.filter(l => l.stage === 'stage2' && l.provider === 'People Data Labs' && l.success).length;
  const stage2Total = recentLogs.filter(l => l.stage === 'stage2' && l.provider === 'People Data Labs').length;

  const stage1CostPerLead = stage1Successes > 0 && stage1Row
    ? (stage1Row.total_cost / stage1Successes).toFixed(3)
    : '—';
  const stage2CostPerLead = stage2Successes > 0 && stage2Row
    ? (stage2Row.total_cost / stage2Successes).toFixed(2)
    : '—';

  // ROI: assume $500 avg deal value
  const AVG_DEAL_VALUE = 500;
  const stage2ROI = stage2Successes > 0 && stage2Row && stage2Row.total_cost > 0
    ? (((stage2Successes * AVG_DEAL_VALUE) - stage2Row.total_cost) / stage2Row.total_cost * 100).toFixed(0)
    : '—';

  // Chart data
  const chartData = costSummary.map(r => ({
    name: r.provider === 'People Data Labs' ? 'PDL' : r.provider,
    providerKey: r.provider,
    cost: r.total_cost,
    calls: r.total_calls,
    successRate: r.success_rate,
  }));

  // Filtered logs
  const filteredLogs = logFilter === 'all' ? recentLogs : recentLogs.filter(l => l.stage === logFilter);

  // ── Auto-enrich 70+ leads ────────────────────────────────────────────────
  const handleAutoEnrich = async () => {
    setAutoEnriching(true);
    setAutoEnrichResult(null);
    try {
      const res = await fetch('/api/enrichment/pdl-auto-enrich', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAutoEnrichResult(data);
        await load();
      }
    } catch {
      // silent
    } finally {
      setAutoEnriching(false);
    }
  };

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Enrichment Cost Tracking</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor API spend, ROI, and success rates across BatchData (Stage 1) and People Data Labs (Stage 2).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={handleAutoEnrich}
              disabled={autoEnriching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              <Zap size={12} className={autoEnriching ? 'animate-pulse' : ''} />
              {autoEnriching ? 'Enriching…' : 'Auto-Enrich 70+ Leads'}
            </button>
          </div>
        </div>

        {/* Auto-enrich result banner */}
        {autoEnrichResult && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Auto-Enrich Complete</p>
                  <p className="text-xs text-muted-foreground">
                    {autoEnrichResult.enriched} enriched · {autoEnrichResult.skipped} skipped (cached/DNC) · {autoEnrichResult.errors} errors
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowResultDetail(v => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Details {showResultDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showResultDetail && autoEnrichResult.leads.length > 0 && (
              <div className="mt-3 border-t border-border pt-3 space-y-1 max-h-48 overflow-y-auto">
                {autoEnrichResult.leads.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[55%]">{l.address}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-muted-foreground">Score {l.score}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${l.result.startsWith('Stage 2 complete') ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {l.result.length > 40 ? l.result.slice(0, 40) + '…' : l.result}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Provider ROI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* BatchData Stage 1 */}
          <div className="bg-card border border-blue-500/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">BatchData — Stage 1</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Owner name · mailing address · ownership type</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-blue-500/10 text-blue-600 border-blue-500/20">$0.05/call</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Total Spend</p>
                <p className="font-mono text-base font-bold text-foreground">${(stage1Row?.total_cost || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Success Rate</p>
                <p className={`font-mono text-base font-bold ${(stage1Row?.success_rate || 0) >= 80 ? 'text-success' : 'text-warning'}`}>
                  {stage1Row?.success_rate ?? 0}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Cost/Lead</p>
                <p className="font-mono text-base font-bold text-foreground">${stage1CostPerLead}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <div className="flex-1 bg-muted rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(stage1Row?.success_rate || 0, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{stage1Total} calls</span>
            </div>
          </div>

          {/* PDL Stage 2 */}
          <div className="bg-card border border-purple-500/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">People Data Labs — Stage 2</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Verified email · phone · confidence-scored · auto 70+</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-purple-500/10 text-purple-600 border-purple-500/20">$0.25/call</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Total Spend</p>
                <p className="font-mono text-base font-bold text-foreground">${(stage2Row?.total_cost || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Success Rate</p>
                <p className={`font-mono text-base font-bold ${(stage2Row?.success_rate || 0) >= 70 ? 'text-success' : 'text-warning'}`}>
                  {stage2Row?.success_rate ?? 0}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Est. ROI</p>
                <p className={`font-mono text-base font-bold ${stage2ROI !== '—' && Number(stage2ROI) > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                  {stage2ROI !== '—' ? `${stage2ROI}%` : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <div className="flex-1 bg-muted rounded-full h-1.5">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(stage2Row?.success_rate || 0, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{stage2Total} calls</span>
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            label="Total Spend"
            value={`$${totalSpend.toFixed(2)}`}
            sub={`${totalCalls} API calls total`}
            icon={<DollarSign size={14} className="text-primary" />}
          />
          <KPICard
            label="Stage 1 Cost/Lead"
            value={`$${stage1CostPerLead}`}
            sub={`${stage1Successes}/${stage1Total} successful`}
            icon={<Target size={14} className="text-blue-500" />}
          />
          <KPICard
            label="Stage 2 Cost/Lead"
            value={`$${stage2CostPerLead}`}
            sub={`PDL · ${stage2Successes}/${stage2Total} found`}
            icon={<TrendingUp size={14} className="text-purple-500" />}
          />
          <KPICard
            label="Stage 2 Est. ROI"
            value={stage2ROI !== '—' ? `${stage2ROI}%` : '—'}
            sub={`Based on $${AVG_DEAL_VALUE} avg deal value`}
            icon={<Activity size={14} className="text-success" />}
            accent={stage2ROI !== '—' && Number(stage2ROI) > 0 ? 'border-success/30' : undefined}
          />
        </div>

        {/* Spend chart */}
        {chartData.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="text-sm font-semibold text-foreground">Spend by Provider</h2>
            </div>
            <div className="p-4" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={getProviderColor(entry.providerKey)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Per-provider breakdown table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground">Provider Breakdown</h2>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : costSummary.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No enrichment API calls logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {['Provider', 'Stage', 'Total Calls', 'Total Cost', 'Success Rate', 'Cost/Call', 'Cost/Success'].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${h === 'Provider' || h === 'Stage' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costSummary.map((row, i) => {
                    const successCount = recentLogs.filter(l => l.provider === row.provider && l.stage === row.stage && l.success).length;
                    const costPerSuccess = successCount > 0 ? (row.total_cost / successCount).toFixed(3) : '—';
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getProviderColor(row.provider) }} />
                            {row.provider}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STAGE_COLORS[row.stage] || 'bg-muted text-muted-foreground border-border'}`}>
                            {STAGE_LABELS[row.stage] || row.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-foreground">{row.total_calls.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono text-foreground">${row.total_cost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono ${row.success_rate >= 80 ? 'text-success' : row.success_rate >= 50 ? 'text-warning' : 'text-danger'}`}>
                            {row.success_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          ${row.total_calls > 0 ? (row.total_cost / row.total_calls).toFixed(3) : '0.000'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">${costPerSuccess}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent API logs */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-foreground">Recent API Calls</h2>
            <div className="flex items-center gap-1">
              {(['all', 'stage1', 'stage2', 'stage3'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all ${logFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  {f === 'all' ? 'All' : STAGE_LABELS[f]?.split(' — ')[0] || f}
                </button>
              ))}
            </div>
          </div>
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No API calls logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.slice(0, 50).map(log => (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{new Date(log.called_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getProviderColor(log.provider) }} />
                          <span className="text-xs text-foreground">{log.provider}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STAGE_COLORS[log.stage] || 'bg-muted text-muted-foreground border-border'}`}>
                          {log.stage}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">${(log.cost || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {log.success
                          ? <CheckCircle2 size={13} className="text-success mx-auto" />
                          : <XCircle size={13} className="text-danger mx-auto" title={log.error_message} />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Compliance reminder */}
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-700">Compliance Reminders</p>
              <ul className="text-[11px] text-amber-700 space-y-0.5 list-disc list-inside">
                <li>Stage 2 (PDL contact enrichment) requires legal review before production use — TCPA applies to phone/SMS outreach</li>
                <li>Auto-enrich only triggers on leads scoring ≥ 70 with Stage 1 complete — Do Not Contact leads are always blocked</li>
                <li>Results cached for 90 days — re-enriching a cached lead does not re-charge the provider</li>
                <li>California and other state privacy laws (CCPA) apply to stored personal contact data</li>
                <li>ROI estimate assumes $500 avg deal value — update in code to match your actual conversion metrics</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
