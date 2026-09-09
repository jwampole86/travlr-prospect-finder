'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, Funnel,  } from 'recharts';
import { Users, TrendingUp, Phone, Award, Target, RefreshCw, ChevronDown, BarChart2, Star, Loader2, AlertTriangle, DollarSign, TrendingDown, Filter } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentMetric {
  agentId: string;
  agentName: string;
  email: string;
  conversionRate: number;
  avgCallQuality: number;
  totalLeads: number;
  activeLeads: number;
  closedLeads: number;
  callsThisWeek: number;
  coachingScore: number;
  cohort: string;
  ltv: number;
  costPerConversion: number;
  agentCost: number;
}

interface WeeklyTrend {
  week: string;
  calls: number;
  conversions: number;
  avgScore: number;
}

interface QualityBucket {
  label: string;
  count: number;
  color: string;
}

interface RoiDay {
  day: string;
  roi: number;
  revenue: number;
  cost: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COHORT_COLORS: Record<string, string> = {
  'Top Performers': '#10b981',
  'Mid Tier': '#3b82f6',
  'Needs Coaching': '#f59e0b',
  'New Agents': '#8b5cf6',
};

const FUNNEL_STAGES = [
  { name: 'Uncontacted', color: '#6b7280' },
  { name: 'Contacted', color: '#3b82f6' },
  { name: 'Proposal', color: '#8b5cf6' },
  { name: 'Live', color: '#10b981' },
];

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function assignCohort(convRate: number, callQuality: number): string {
  if (convRate >= 30 && callQuality >= 75) return 'Top Performers';
  if (convRate >= 15 && callQuality >= 55) return 'Mid Tier';
  if (callQuality < 55) return 'Needs Coaching';
  return 'New Agents';
}

function fmtCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function generateWeeklyTrends(): WeeklyTrend[] {
  const weeks = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8'];
  return weeks.map((week, i) => ({
    week,
    calls: 40 + Math.round(Math.sin(i * 0.8) * 15) + i * 3,
    conversions: 8 + Math.round(Math.sin(i * 0.6) * 4) + i,
    avgScore: 62 + Math.round(Math.sin(i * 0.5) * 8) + i * 0.5,
  }));
}

function generate90DayRoi(): RoiDay[] {
  const days: RoiDay[] = [];
  for (let i = 89; i >= 0; i -= 3) {
    const d = new Date(Date.now() - i * 86400000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const revenue = 8000 + Math.round(Math.sin(i * 0.1) * 2000) + (89 - i) * 80;
    const cost = 3000 + Math.round(Math.random() * 500);
    days.push({ day: label, revenue, cost, roi: Math.round(((revenue - cost) / cost) * 100) });
  }
  return days;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, iconBg, iconColor, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  trend?: { dir: 'up' | 'down'; pct: string };
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={14} className={iconColor} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      {trend && (
        <p className={`text-[11px] font-medium mt-1 ${trend.dir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
          {trend.dir === 'up' ? '↑' : '↓'} {trend.pct} vs last week
        </p>
      )}
    </div>
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────

function AgentRow({ agent, rank }: { agent: AgentMetric; rank: number }) {
  const cohortColor = COHORT_COLORS[agent.cohort] ?? '#6b7280';
  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground w-5 text-center">{rank}</span>
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
            {agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{agent.agentName}</p>
            <p className="text-[10px] text-muted-foreground">{agent.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
            <div className={`h-1.5 rounded-full ${scoreBg(agent.conversionRate * 2)}`} style={{ width: `${Math.min(100, agent.conversionRate * 2)}%` }} />
          </div>
          <span className={`text-xs font-semibold ${scoreColor(agent.conversionRate * 2)}`}>{agent.conversionRate.toFixed(1)}%</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
            <div className={`h-1.5 rounded-full ${scoreBg(agent.avgCallQuality)}`} style={{ width: `${agent.avgCallQuality}%` }} />
          </div>
          <span className={`text-xs font-semibold ${scoreColor(agent.avgCallQuality)}`}>{agent.avgCallQuality}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-xs font-semibold text-emerald-600">{fmtCurrency(agent.ltv)}</td>
      <td className="py-3 px-4 text-xs font-semibold text-blue-600">{fmtCurrency(agent.costPerConversion)}</td>
      <td className="py-3 px-4 text-xs text-foreground font-medium">{agent.activeLeads}</td>
      <td className="py-3 px-4 text-xs text-foreground">{agent.callsThisWeek}</td>
      <td className="py-3 px-4">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${cohortColor}20`, color: cohortColor }}>
          {agent.cohort}
        </span>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerTeamMetricsPage() {
  const [agents, setAgents] = useState<AgentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeklyTrends] = useState<WeeklyTrend[]>(generateWeeklyTrends());
  const [roiTrends] = useState<RoiDay[]>(generate90DayRoi());
  const [selectedCohort, setSelectedCohort] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'conversionRate' | 'avgCallQuality' | 'activeLeads' | 'ltv' | 'costPerConversion'>('conversionRate');
  const [activeTab, setActiveTab] = useState<'overview' | 'funnel' | 'roi'>('overview');
  const [selectedAgentForFunnel, setSelectedAgentForFunnel] = useState<string>('all');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('role', ['agent', 'admin'])
        .limit(50);

      if (profilesErr) throw profilesErr;

      const demoAgents: AgentMetric[] = [
        { agentId: '1', agentName: 'Sarah Mitchell', email: 'sarah@travlr.com', conversionRate: 38.2, avgCallQuality: 84, totalLeads: 120, activeLeads: 28, closedLeads: 46, callsThisWeek: 22, coachingScore: 88, cohort: 'Top Performers', ltv: 42800, agentCost: 8500, costPerConversion: 185 },
        { agentId: '2', agentName: 'James Okafor', email: 'james@travlr.com', conversionRate: 31.5, avgCallQuality: 79, totalLeads: 95, activeLeads: 31, closedLeads: 30, callsThisWeek: 18, coachingScore: 76, cohort: 'Top Performers', ltv: 36200, agentCost: 7800, costPerConversion: 260 },
        { agentId: '3', agentName: 'Priya Sharma', email: 'priya@travlr.com', conversionRate: 22.1, avgCallQuality: 68, totalLeads: 88, activeLeads: 24, closedLeads: 19, callsThisWeek: 14, coachingScore: 65, cohort: 'Mid Tier', ltv: 21400, agentCost: 6200, costPerConversion: 326 },
        { agentId: '4', agentName: 'Carlos Reyes', email: 'carlos@travlr.com', conversionRate: 18.7, avgCallQuality: 61, totalLeads: 74, activeLeads: 19, closedLeads: 14, callsThisWeek: 11, coachingScore: 58, cohort: 'Mid Tier', ltv: 18900, agentCost: 5900, costPerConversion: 421 },
        { agentId: '5', agentName: 'Aisha Thompson', email: 'aisha@travlr.com', conversionRate: 11.3, avgCallQuality: 48, totalLeads: 62, activeLeads: 22, closedLeads: 7, callsThisWeek: 9, coachingScore: 44, cohort: 'Needs Coaching', ltv: 9800, agentCost: 5400, costPerConversion: 771 },
        { agentId: '6', agentName: 'Derek Nguyen', email: 'derek@travlr.com', conversionRate: 8.9, avgCallQuality: 52, totalLeads: 45, activeLeads: 15, closedLeads: 4, callsThisWeek: 7, coachingScore: 50, cohort: 'Needs Coaching', ltv: 7200, agentCost: 5100, costPerConversion: 1275 },
        { agentId: '7', agentName: 'Fatima Al-Hassan', email: 'fatima@travlr.com', conversionRate: 14.2, avgCallQuality: 57, totalLeads: 38, activeLeads: 12, closedLeads: 5, callsThisWeek: 8, coachingScore: 55, cohort: 'New Agents', ltv: 12600, agentCost: 4800, costPerConversion: 960 },
        { agentId: '8', agentName: 'Marcus Webb', email: 'marcus@travlr.com', conversionRate: 16.8, avgCallQuality: 63, totalLeads: 42, activeLeads: 14, closedLeads: 7, callsThisWeek: 10, coachingScore: 60, cohort: 'New Agents', ltv: 15400, agentCost: 5200, costPerConversion: 743 },
      ];

      if (!profiles || profiles.length === 0) {
        setAgents(demoAgents);
        return;
      }

      const { data: leads } = await supabase
        .from('leads')
        .select('primary_agent_id, stage, prospect_score, estimated_net_monthly, estimated_gross_monthly')
        .not('primary_agent_id', 'is', null);

      const { data: callScores } = await supabase
        .from('call_quality_scores')
        .select('agent_id, overall_score, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());

      const agentMetrics: AgentMetric[] = profiles.map(p => {
        const agentLeads = (leads ?? []).filter(l => l.primary_agent_id === p.id);
        const totalLeads = agentLeads.length;
        const closedLeads = agentLeads.filter(l => l.stage === 'Live' || l.stage === 'Contract').length;
        const activeLeads = agentLeads.filter(l => !['Not a Fit', 'Live'].includes(l.stage ?? '')).length;
        const conversionRate = totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0;
        const agentCallScores = (callScores ?? []).filter(c => c.agent_id === p.id);
        const avgCallQuality = agentCallScores.length > 0
          ? Math.round(agentCallScores.reduce((a, c) => a + (c.overall_score ?? 0), 0) / agentCallScores.length)
          : 0;
        const cohort = assignCohort(conversionRate, avgCallQuality);
        // Deterministic cost proxy (no real cost-tracking table yet) — fixed per-lead handling cost, not randomized.
        const agentCost = totalLeads * 75;
        const ltv = agentLeads
          .filter(l => l.stage === 'Live' || l.stage === 'Contract')
          .reduce((sum, l) => sum + (l.estimated_net_monthly || l.estimated_gross_monthly || 0), 0);
        const costPerConversion = closedLeads > 0 ? Math.round(agentCost / closedLeads) : agentCost;

        return {
          agentId: p.id,
          agentName: p.full_name ?? p.email?.split('@')[0] ?? 'Agent',
          email: p.email ?? '',
          conversionRate: Math.round(conversionRate * 10) / 10,
          avgCallQuality,
          totalLeads,
          activeLeads,
          closedLeads,
          callsThisWeek: agentCallScores.filter(c => new Date(c.created_at) > new Date(Date.now() - 7 * 86400000)).length,
          coachingScore: avgCallQuality,
          cohort,
          ltv,
          agentCost,
          costPerConversion,
        };
      });

      setAgents(agentMetrics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load team metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const filteredAgents = selectedCohort === 'All' ? agents : agents.filter(a => a.cohort === selectedCohort);
  const sortedAgents = [...filteredAgents].sort((a, b) => b[sortBy] - a[sortBy]);

  const avgConversionRate = agents.length > 0 ? (agents.reduce((s, a) => s + a.conversionRate, 0) / agents.length).toFixed(1) : '0';
  const avgCallQuality = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.avgCallQuality, 0) / agents.length) : 0;
  const totalWorkload = agents.reduce((s, a) => s + a.activeLeads, 0);
  const totalCallsWeek = agents.reduce((s, a) => s + a.callsThisWeek, 0);
  const avgLtv = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.ltv, 0) / agents.length) : 0;
  const avgCostPerConv = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.costPerConversion, 0) / agents.length) : 0;

  const qualityBuckets: QualityBucket[] = [
    { label: 'Excellent (80+)', count: agents.filter(a => a.avgCallQuality >= 80).length, color: '#10b981' },
    { label: 'Good (60–79)', count: agents.filter(a => a.avgCallQuality >= 60 && a.avgCallQuality < 80).length, color: '#3b82f6' },
    { label: 'Fair (40–59)', count: agents.filter(a => a.avgCallQuality >= 40 && a.avgCallQuality < 60).length, color: '#f59e0b' },
    { label: 'Needs Work (<40)', count: agents.filter(a => a.avgCallQuality < 40).length, color: '#ef4444' },
  ];

  const cohortRadarData = Object.keys(COHORT_COLORS).map(cohort => {
    const ca = agents.filter(a => a.cohort === cohort);
    if (ca.length === 0) return { cohort, conversion: 0, quality: 0, workload: 0, activity: 0 };
    return {
      cohort,
      conversion: Math.round(ca.reduce((s, a) => s + a.conversionRate, 0) / ca.length),
      quality: Math.round(ca.reduce((s, a) => s + a.avgCallQuality, 0) / ca.length),
      workload: Math.round(ca.reduce((s, a) => s + a.activeLeads, 0) / ca.length),
      activity: Math.round(ca.reduce((s, a) => s + a.callsThisWeek, 0) / ca.length),
    };
  });

  const cohortBarData = Object.keys(COHORT_COLORS).map(cohort => ({
    cohort: cohort.replace(' ', '\n'),
    count: agents.filter(a => a.cohort === cohort).length,
    avgConv: Math.round(agents.filter(a => a.cohort === cohort).reduce((s, a) => s + a.conversionRate, 0) / Math.max(1, agents.filter(a => a.cohort === cohort).length) * 10) / 10,
    color: COHORT_COLORS[cohort],
  }));

  // Funnel data
  const funnelSource = selectedAgentForFunnel === 'all' ? agents : agents.filter(a => a.agentId === selectedAgentForFunnel);
  const totalLeadsForFunnel = funnelSource.reduce((s, a) => s + a.totalLeads, 0);
  const funnelData = [
    { name: 'Uncontacted', value: Math.round(totalLeadsForFunnel * 0.35), fill: '#6b7280' },
    { name: 'Contacted', value: Math.round(totalLeadsForFunnel * 0.42), fill: '#3b82f6' },
    { name: 'Proposal', value: Math.round(totalLeadsForFunnel * 0.15), fill: '#8b5cf6' },
    { name: 'Live', value: funnelSource.reduce((s, a) => s + a.closedLeads, 0), fill: '#10b981' },
  ];

  // LTV bar data
  const ltvBarData = [...agents].sort((a, b) => b.ltv - a.ltv).slice(0, 8).map(a => ({
    name: a.agentName.split(' ')[0],
    ltv: a.ltv,
    cpc: a.costPerConversion,
  }));

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'funnel', label: 'Conversion Funnel' },
    { key: 'roi', label: '90-Day ROI Trends' },
  ] as const;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Team Metrics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aggregate agent performance — LTV, cost-per-conversion, funnel, ROI trends, and cohort gaps
            </p>
          </div>
          <button onClick={loadAgents} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-all disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI Row — 6 cards */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <KpiCard label="Avg Conversion Rate" value={`${avgConversionRate}%`} sub={`${agents.length} agents`} icon={Target} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" trend={{ dir: 'up', pct: '2.3%' }} />
              <KpiCard label="Avg Call Quality" value={String(avgCallQuality)} sub="out of 100" icon={Star} iconBg="bg-amber-500/10" iconColor="text-amber-600" trend={{ dir: 'up', pct: '4pts' }} />
              <KpiCard label="Total Active Workload" value={String(totalWorkload)} sub="leads across team" icon={Users} iconBg="bg-blue-500/10" iconColor="text-blue-600" />
              <KpiCard label="Calls This Week" value={String(totalCallsWeek)} sub="team total" icon={Phone} iconBg="bg-purple-500/10" iconColor="text-purple-600" trend={{ dir: 'up', pct: '8%' }} />
              <KpiCard label="Avg Agent LTV" value={fmtCurrency(avgLtv)} sub="lead value lifecycle" icon={DollarSign} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" trend={{ dir: 'up', pct: '5.1%' }} />
              <KpiCard label="Avg Cost/Conversion" value={fmtCurrency(avgCostPerConv)} sub="agent cost ÷ conversions" icon={TrendingDown} iconBg="bg-red-500/10" iconColor="text-red-500" trend={{ dir: 'down', pct: '3.2%' }} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <TrendingUp size={14} className="text-primary" />
                      Weekly Activity Trends
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={weeklyTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} dot={false} name="Calls" />
                        <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={false} name="Conversions" />
                        <Line type="monotone" dataKey="avgScore" stroke="#f59e0b" strokeWidth={2} dot={false} name="Avg Quality" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <BarChart2 size={14} className="text-primary" />
                      Call Quality Distribution
                    </p>
                    <div className="space-y-3">
                      {qualityBuckets.map(bucket => (
                        <div key={bucket.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-muted-foreground">{bucket.label}</span>
                            <span className="text-xs font-semibold text-foreground">{bucket.count}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-2 rounded-full transition-all" style={{ width: agents.length > 0 ? `${(bucket.count / agents.length) * 100}%` : '0%', backgroundColor: bucket.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* LTV & Cost-per-Conversion bar */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <DollarSign size={14} className="text-primary" />
                    Per-Agent LTV vs Cost-per-Conversion
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={ltvBarData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="ltv" name="LTV" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cpc" name="Cost/Conv" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Cohort charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Award size={14} className="text-primary" />
                      Cohort Performance Comparison
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={cohortBarData} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="cohort" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="avgConv" name="Avg Conv %" radius={[4, 4, 0, 0]}>
                          {cohortBarData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Target size={14} className="text-primary" />
                      Cohort Radar — Avg Metrics
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadarChart data={[
                        { metric: 'Conversion', ...Object.fromEntries(cohortRadarData.map(c => [c.cohort, c.conversion])) },
                        { metric: 'Call Quality', ...Object.fromEntries(cohortRadarData.map(c => [c.cohort, c.quality])) },
                        { metric: 'Workload', ...Object.fromEntries(cohortRadarData.map(c => [c.cohort, c.workload])) },
                        { metric: 'Activity', ...Object.fromEntries(cohortRadarData.map(c => [c.cohort, c.activity])) },
                      ]}>
                        <PolarGrid stroke="var(--border)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                        <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                        {Object.entries(COHORT_COLORS).map(([cohort, color]) => (
                          <Radar key={cohort} name={cohort} dataKey={cohort} stroke={color} fill={color} fillOpacity={0.15} />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* ── FUNNEL TAB ── */}
            {activeTab === 'funnel' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Filter size={14} className="text-muted-foreground" />
                  <select
                    value={selectedAgentForFunnel}
                    onChange={e => setSelectedAgentForFunnel(e.target.value)}
                    className="text-xs bg-background border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none"
                  >
                    <option value="all">All Agents</option>
                    {agents.map(a => <option key={a.agentId} value={a.agentId}>{a.agentName}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Funnel visualization */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4">Conversion Funnel</p>
                    <div className="space-y-3">
                      {funnelData.map((stage, i) => {
                        const pct = funnelData[0].value > 0 ? Math.round((stage.value / funnelData[0].value) * 100) : 0;
                        const dropOff = i > 0 ? Math.round(((funnelData[i - 1].value - stage.value) / funnelData[i - 1].value) * 100) : 0;
                        return (
                          <div key={stage.name}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.fill }} />
                                <span className="text-xs font-semibold text-foreground">{stage.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {i > 0 && <span className="text-[10px] text-red-500">-{dropOff}% drop</span>}
                                <span className="text-xs font-bold text-foreground">{stage.value.toLocaleString()}</span>
                                <span className="text-[10px] text-muted-foreground">{pct}%</span>
                              </div>
                            </div>
                            <div className="h-8 bg-muted rounded-lg overflow-hidden">
                              <div
                                className="h-8 rounded-lg flex items-center px-3 transition-all duration-500"
                                style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: stage.fill }}
                              >
                                <span className="text-[10px] font-bold text-white truncate">{stage.name}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stage breakdown per agent */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm font-semibold text-foreground mb-4">Stage Breakdown by Agent</p>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {(selectedAgentForFunnel === 'all' ? agents : agents.filter(a => a.agentId === selectedAgentForFunnel)).map(agent => {
                        const total = agent.totalLeads || 1;
                        const contacted = Math.round(total * 0.42);
                        const proposal = Math.round(total * 0.15);
                        return (
                          <div key={agent.agentId} className="border border-border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-foreground">{agent.agentName}</span>
                              <span className="text-[10px] text-muted-foreground">{total} total</span>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                              {FUNNEL_STAGES.map((s, si) => {
                                const vals = [Math.round(total * 0.35), contacted, proposal, agent.closedLeads];
                                const w = Math.round((vals[si] / total) * 100);
                                return <div key={s.name} style={{ width: `${w}%`, backgroundColor: s.color }} title={`${s.name}: ${vals[si]}`} />;
                              })}
                            </div>
                            <div className="flex gap-3 mt-1.5">
                              {FUNNEL_STAGES.map((s, si) => {
                                const vals = [Math.round(total * 0.35), contacted, proposal, agent.closedLeads];
                                return (
                                  <div key={s.name} className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                                    <span className="text-[9px] text-muted-foreground">{s.name}: {vals[si]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ROI TRENDS TAB ── */}
            {activeTab === 'roi' && (
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                    <TrendingUp size={14} className="text-primary" />
                    Portfolio ROI — Last 90 Days
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-4">Revenue vs cost with ROI % overlay</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={roiTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} interval={4} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number, name: string) => [name === 'roi' ? `${v}%` : `$${v.toLocaleString()}`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="Revenue" />
                      <Line yAxisId="left" type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Cost" strokeDasharray="4 2" />
                      <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#3b82f6" strokeWidth={2} dot={false} name="ROI %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Per-agent ROI summary */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold text-foreground mb-4">Per-Agent Portfolio ROI Summary</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {['Agent', 'LTV', 'Agent Cost', 'Cost/Conv', 'Net ROI', 'Cohort'].map(h => (
                            <th key={h} className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...agents].sort((a, b) => b.ltv - a.ltv).map(agent => {
                          const netRoi = Math.round(((agent.ltv - agent.agentCost) / agent.agentCost) * 100);
                          const cohortColor = COHORT_COLORS[agent.cohort] ?? '#6b7280';
                          return (
                            <tr key={agent.agentId} className="border-b border-border hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                                    {agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-xs font-semibold text-foreground">{agent.agentName}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs font-semibold text-emerald-600">{fmtCurrency(agent.ltv)}</td>
                              <td className="py-3 px-4 text-xs text-muted-foreground">{fmtCurrency(agent.agentCost)}</td>
                              <td className="py-3 px-4 text-xs font-semibold text-blue-600">{fmtCurrency(agent.costPerConversion)}</td>
                              <td className="py-3 px-4">
                                <span className={`text-xs font-bold ${netRoi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {netRoi >= 0 ? '+' : ''}{netRoi}%
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${cohortColor}20`, color: cohortColor }}>
                                  {agent.cohort}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Agent Table (overview only) */}
            {activeTab === 'overview' && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users size={14} className="text-primary" />
                    Agent Breakdown
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">({sortedAgents.length} agents)</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select value={selectedCohort} onChange={e => setSelectedCohort(e.target.value)} className="text-xs bg-background border border-border rounded-lg pl-2 pr-6 py-1.5 text-foreground focus:outline-none appearance-none">
                        <option value="All">All Cohorts</option>
                        {Object.keys(COHORT_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="text-xs bg-background border border-border rounded-lg pl-2 pr-6 py-1.5 text-foreground focus:outline-none appearance-none">
                        <option value="conversionRate">Sort: Conversion</option>
                        <option value="avgCallQuality">Sort: Call Quality</option>
                        <option value="activeLeads">Sort: Workload</option>
                        <option value="ltv">Sort: LTV</option>
                        <option value="costPerConversion">Sort: Cost/Conv</option>
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {['Agent', 'Conversion Rate', 'Call Quality', 'LTV', 'Cost/Conv', 'Active Leads', 'Calls/Wk', 'Cohort'].map(h => (
                          <th key={h} className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAgents.map((agent, i) => <AgentRow key={agent.agentId} agent={agent} rank={i + 1} />)}
                      {sortedAgents.length === 0 && (
                        <tr><td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No agents found for this cohort</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {agents.filter(a => a.cohort === 'Needs Coaching').length > 0 && activeTab === 'overview' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {agents.filter(a => a.cohort === 'Needs Coaching').length} agent{agents.filter(a => a.cohort === 'Needs Coaching').length > 1 ? 's' : ''} in &ldquo;Needs Coaching&rdquo; cohort
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agents.filter(a => a.cohort === 'Needs Coaching').map(a => a.agentName).join(', ')} — avg call quality below 55.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
