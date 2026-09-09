'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { TrendingUp, Users, UserCheck, Phone, DollarSign, ArrowDown, Zap, Target, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Funnel, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import Icon from '@/components/ui/AppIcon';



// ─── Types ────────────────────────────────────────────────────────────────────

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  pct: number;
  dropOffPct: number;
  dropOffCount: number;
  avgDaysInStage: number;
  enrichedCount: number;
  enrichedClosedCount: number;
  unenrichedClosedCount: number;
  color: string;
  icon: React.ElementType;
}

interface EnrichmentRoiRow {
  provider: string;
  stage: string;
  totalLeads: number;
  enrichedLeads: number;
  enrichedClosedRate: number;
  unenrichedClosedRate: number;
  roiMultiplier: number;
  costPerLead: number;
  revenuePerClose: number;
  netRoi: number;
}

interface AgentPerformanceRow {
  agentName: string;
  totalLeads: number;
  enrichedLeads: number;
  closedDeals: number;
  closeRate: number;
  enrichedCloseRate: number;
  avgDaysToClose: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const FUNNEL_STAGES: FunnelStage[] = [
  {
    key: 'intake', label: 'Intake', count: 1240, pct: 100, dropOffPct: 0, dropOffCount: 0,
    avgDaysInStage: 0, enrichedCount: 1240, enrichedClosedCount: 0, unenrichedClosedCount: 0,
    color: '#3b82f6', icon: Users,
  },
  {
    key: 'enriched', label: 'Enrichment', count: 1087, pct: 87.7, dropOffPct: 12.3, dropOffCount: 153,
    avgDaysInStage: 0.2, enrichedCount: 1087, enrichedClosedCount: 0, unenrichedClosedCount: 0,
    color: '#8b5cf6', icon: Zap,
  },
  {
    key: 'assigned', label: 'Assigned', count: 934, pct: 75.3, dropOffPct: 12.4, dropOffCount: 153,
    avgDaysInStage: 1.4, enrichedCount: 820, enrichedClosedCount: 0, unenrichedClosedCount: 0,
    color: '#06b6d4', icon: UserCheck,
  },
  {
    key: 'first_contact', label: 'First Contact', count: 612, pct: 49.4, dropOffPct: 25.9, dropOffCount: 322,
    avgDaysInStage: 3.2, enrichedCount: 558, enrichedClosedCount: 0, unenrichedClosedCount: 0,
    color: '#f59e0b', icon: Phone,
  },
  {
    key: 'qualified', label: 'Qualified', count: 298, pct: 24.0, dropOffPct: 25.4, dropOffCount: 314,
    avgDaysInStage: 8.7, enrichedCount: 271, enrichedClosedCount: 0, unenrichedClosedCount: 0,
    color: '#f97316', icon: Target,
  },
  {
    key: 'closed', label: 'Closed Deal', count: 89, pct: 7.2, dropOffPct: 16.8, dropOffCount: 209,
    avgDaysInStage: 22.4, enrichedCount: 76, enrichedClosedCount: 76, unenrichedClosedCount: 13,
    color: '#22c55e', icon: DollarSign,
  },
];

const ENRICHMENT_ROI: EnrichmentRoiRow[] = [
  {
    provider: 'BatchData', stage: 'Stage 1 — Owner Lookup',
    totalLeads: 1087, enrichedLeads: 1087, enrichedClosedRate: 8.5, unenrichedClosedRate: 4.2,
    roiMultiplier: 2.02, costPerLead: 0.05, revenuePerClose: 4200, netRoi: 3847,
  },
  {
    provider: 'People Data Labs', stage: 'Stage 2 — Contact Enrichment',
    totalLeads: 412, enrichedLeads: 412, enrichedClosedRate: 14.3, unenrichedClosedRate: 5.8,
    roiMultiplier: 2.47, costPerLead: 0.25, revenuePerClose: 4200, netRoi: 24580,
  },
];

const AGENT_PERFORMANCE: AgentPerformanceRow[] = [
  { agentName: 'Sarah Chen', totalLeads: 187, enrichedLeads: 164, closedDeals: 22, closeRate: 11.8, enrichedCloseRate: 13.4, avgDaysToClose: 19.2 },
  { agentName: 'Marcus Webb', totalLeads: 203, enrichedLeads: 178, closedDeals: 18, closeRate: 8.9, enrichedCloseRate: 10.1, avgDaysToClose: 24.7 },
  { agentName: 'Priya Nair', totalLeads: 156, enrichedLeads: 142, closedDeals: 21, closeRate: 13.5, enrichedCloseRate: 14.8, avgDaysToClose: 17.8 },
  { agentName: 'James Okafor', totalLeads: 134, enrichedLeads: 98, closedDeals: 12, closeRate: 9.0, enrichedCloseRate: 12.2, avgDaysToClose: 28.3 },
  { agentName: 'Elena Vasquez', totalLeads: 112, enrichedLeads: 104, closedDeals: 16, closeRate: 14.3, enrichedCloseRate: 15.4, avgDaysToClose: 16.1 },
];

const TREND_DATA = [
  { month: 'Mar', intake: 180, enriched: 152, assigned: 131, firstContact: 84, qualified: 41, closed: 11 },
  { month: 'Apr', intake: 210, enriched: 182, assigned: 158, firstContact: 102, qualified: 50, closed: 14 },
  { month: 'May', intake: 195, enriched: 171, assigned: 148, firstContact: 97, qualified: 47, closed: 13 },
  { month: 'Jun', intake: 228, enriched: 200, assigned: 174, firstContact: 114, qualified: 56, closed: 16 },
  { month: 'Jul', intake: 242, enriched: 213, assigned: 185, firstContact: 121, qualified: 59, closed: 17 },
  { month: 'Aug', intake: 185, enriched: 169, assigned: 138, firstContact: 94, qualified: 45, closed: 18 },
];

// ─── Funnel Bar ───────────────────────────────────────────────────────────────

function FunnelBar({ stage, maxCount, isBottleneck }: { stage: FunnelStage; maxCount: number; isBottleneck: boolean }) {
  const widthPct = (stage.count / maxCount) * 100;
  const Icon = stage.icon;

  return (
    <div className={`relative bg-card border rounded-xl p-4 transition-all ${isBottleneck ? 'border-red-500/30 bg-red-500/3' : 'border-border'}`}>
      {isBottleneck && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-red-500 font-medium">
          <AlertTriangle size={11} /> Bottleneck
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stage.color}20` }}>
          <Icon size={16} style={{ color: stage.color }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{stage.label}</p>
          <p className="text-[11px] text-muted-foreground">Avg {stage.avgDaysInStage}d in stage</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-lg font-bold text-foreground">{stage.count.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">{stage.pct.toFixed(1)}% of intake</p>
        </div>
      </div>

      {/* Width bar */}
      <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${widthPct}%`, backgroundColor: stage.color }} />
      </div>

      {/* Drop-off indicator */}
      {stage.dropOffPct > 0 && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <ArrowDown size={11} className={stage.dropOffPct > 20 ? 'text-red-400' : 'text-amber-400'} />
          <span className={stage.dropOffPct > 20 ? 'text-red-400' : 'text-amber-400'}>
            {stage.dropOffPct.toFixed(1)}% drop-off ({stage.dropOffCount} leads lost before this stage)
          </span>
        </div>
      )}
    </div>
  );
}

// ─── ROI Card ─────────────────────────────────────────────────────────────────

function RoiCard({ row }: { row: EnrichmentRoiRow }) {
  const lift = row.enrichedClosedRate - row.unenrichedClosedRate;
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground text-sm">{row.provider}</h3>
          <p className="text-[11px] text-muted-foreground">{row.stage}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-500">{row.roiMultiplier.toFixed(2)}×</p>
          <p className="text-[10px] text-muted-foreground">ROI multiplier</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Enriched Close Rate</p>
          <p className="text-lg font-bold text-emerald-500">{row.enrichedClosedRate}%</p>
          <div className="h-1 bg-border rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${row.enrichedClosedRate * 4}%` }} />
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Unenriched Close Rate</p>
          <p className="text-lg font-bold text-muted-foreground">{row.unenrichedClosedRate}%</p>
          <div className="h-1 bg-border rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-muted-foreground rounded-full" style={{ width: `${row.unenrichedClosedRate * 4}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Lift</p>
          <p className="text-sm font-bold text-emerald-500">+{lift.toFixed(1)}pp</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Cost/Lead</p>
          <p className="text-sm font-bold text-foreground">${row.costPerLead.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Net ROI</p>
          <p className="text-sm font-bold text-emerald-500">${(row.netRoi / 1000).toFixed(1)}k</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadLifecyclePage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'funnel' | 'roi' | 'agents' | 'trends'>('funnel');
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | '6m' | '1y'>('90d');

  const bottleneckIdx = FUNNEL_STAGES.reduce((maxIdx, stage, idx, arr) =>
    stage.dropOffPct > arr[maxIdx].dropOffPct ? idx : maxIdx, 1);

  const totalRevenue = FUNNEL_STAGES[FUNNEL_STAGES.length - 1].count * 4200;
  const enrichedCloseRate = ((FUNNEL_STAGES[FUNNEL_STAGES.length - 1].enrichedClosedCount / FUNNEL_STAGES[1].count) * 100).toFixed(1);
  const overallCloseRate = ((FUNNEL_STAGES[FUNNEL_STAGES.length - 1].count / FUNNEL_STAGES[0].count) * 100).toFixed(1);

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lead Lifecycle Funnel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track leads from intake through closed deal — visualize drop-off and measure enrichment ROI against closing rates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['30d', '90d', '6m', '1y'] as const).map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  timeRange === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}>{r}</button>
            ))}
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-blue-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Intake</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{FUNNEL_STAGES[0].count.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">leads in period</p>
          </div>
          <div className="bg-card border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={15} className="text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Closed Deals</span>
            </div>
            <p className="text-2xl font-bold text-emerald-500">{FUNNEL_STAGES[FUNNEL_STAGES.length - 1].count}</p>
            <p className="text-[10px] text-muted-foreground">{overallCloseRate}% overall close rate</p>
          </div>
          <div className="bg-card border border-purple-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={15} className="text-purple-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Enriched Close Rate</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">{enrichedCloseRate}%</p>
            <p className="text-[10px] text-muted-foreground">vs {(4.2).toFixed(1)}% unenriched</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Revenue</span>
            </div>
            <p className="text-2xl font-bold text-foreground">${(totalRevenue / 1000).toFixed(0)}k</p>
            <p className="text-[10px] text-muted-foreground">@ $4,200 avg deal value</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {[
            { key: 'funnel', label: 'Funnel View' },
            { key: 'roi', label: 'Enrichment ROI' },
            { key: 'agents', label: 'Agent Closing Rates' },
            { key: 'trends', label: 'Monthly Trends' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}>{tab.label}</button>
          ))}
        </div>

        {/* Funnel View */}
        {activeTab === 'funnel' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-[12px] text-amber-600">
                <span className="font-semibold">Biggest drop-off:</span> {FUNNEL_STAGES[bottleneckIdx].label} stage — {FUNNEL_STAGES[bottleneckIdx].dropOffPct.toFixed(1)}% of leads lost ({FUNNEL_STAGES[bottleneckIdx].dropOffCount} leads). Consider improving outreach timing or contact quality at this stage.
              </p>
            </div>
            {FUNNEL_STAGES.map((stage, idx) => (
              <FunnelBar
                key={stage.key}
                stage={stage}
                maxCount={FUNNEL_STAGES[0].count}
                isBottleneck={idx === bottleneckIdx}
              />
            ))}

            {/* Conversion summary */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Stage-to-Stage Conversion</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {FUNNEL_STAGES.map((stage, idx) => (
                  <React.Fragment key={stage.key}>
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${stage.color}20` }}>
                        <stage.icon size={16} style={{ color: stage.color }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-[60px]">{stage.label}</p>
                      <p className="text-[11px] font-bold text-foreground">{stage.count}</p>
                    </div>
                    {idx < FUNNEL_STAGES.length - 1 && (
                      <div className="flex flex-col items-center">
                        <ChevronRight size={14} className="text-muted-foreground" />
                        <p className="text-[9px] text-muted-foreground">
                          {((FUNNEL_STAGES[idx + 1].count / stage.count) * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Enrichment ROI */}
        {activeTab === 'roi' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ENRICHMENT_ROI.map(row => <RoiCard key={row.provider} row={row} />)}
            </div>

            {/* ROI comparison chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Close Rate: Enriched vs Unenriched</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ENRICHMENT_ROI.map(r => ({
                  name: r.provider,
                  enriched: r.enrichedClosedRate,
                  unenriched: r.unenrichedClosedRate,
                }))} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} unit="%" />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="enriched" name="Enriched" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="unenriched" name="Unenriched" fill="#6b7280" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-muted-foreground">
                  ROI is calculated as <span className="font-medium text-foreground">(enriched close rate ÷ unenriched close rate)</span>. Net ROI = (additional closes × avg deal value) − enrichment cost. Enrichment cost: BatchData $0.05/lead, PDL $0.25/lead.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Agent Closing Rates */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Leads</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Enriched</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Closed</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Overall Rate</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Enriched Rate</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Days</th>
                  </tr>
                </thead>
                <tbody>
                  {AGENT_PERFORMANCE.sort((a, b) => b.closeRate - a.closeRate).map((agent, idx) => (
                    <tr key={agent.agentName} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                            {agent.agentName.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-sm font-medium text-foreground">{agent.agentName}</span>
                          {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">Top</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-foreground">{agent.totalLeads}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-foreground">{agent.enrichedLeads}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({Math.round(agent.enrichedLeads / agent.totalLeads * 100)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-emerald-500">{agent.closedDeals}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${agent.closeRate * 5}%` }} />
                          </div>
                          <span className="text-sm font-medium text-foreground w-10 text-right">{agent.closeRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-medium ${agent.enrichedCloseRate > agent.closeRate ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {agent.enrichedCloseRate}%
                        </span>
                        {agent.enrichedCloseRate > agent.closeRate && (
                          <span className="text-[10px] text-emerald-500 ml-1">+{(agent.enrichedCloseRate - agent.closeRate).toFixed(1)}pp</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">{agent.avgDaysToClose}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Close Rate by Agent</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={AGENT_PERFORMANCE.sort((a, b) => b.closeRate - a.closeRate)} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} unit="%" />
                  <YAxis type="category" dataKey="agentName" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`]}
                  />
                  <Bar dataKey="closeRate" name="Overall" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="enrichedCloseRate" name="Enriched" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Monthly Trends */}
        {activeTab === 'trends' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Funnel Volume</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={TREND_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="intake" name="Intake" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="enriched" name="Enriched" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="firstContact" name="First Contact" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="qualified" name="Qualified" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="closed" name="Closed" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Best Month', value: 'Aug 2026', sub: '18 closed deals', color: 'text-emerald-500' },
                { label: 'Avg Monthly Intake', value: '207', sub: 'leads per month', color: 'text-foreground' },
                { label: 'Trend', value: '+12%', sub: 'close rate MoM', color: 'text-emerald-500' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
