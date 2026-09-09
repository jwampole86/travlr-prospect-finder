'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,  } from 'recharts';
import { Clock, Users, Zap, RefreshCw, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp, Target, Activity, Rocket, Award, Filter,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentConversionMetrics {
  id: string;
  name: string;
  email: string;
  avatar: string;
  conversionRate: number;
  conversionTrend: 'up' | 'down' | 'flat';
  avgResponseTimeHours: number;
  responseTrend: 'up' | 'down' | 'flat';
  assignmentVolume: number;
  volumeTrend: 'up' | 'down' | 'flat';
  pipelineVelocityDays: number;
  velocityTrend: 'up' | 'down' | 'flat';
  leadsAssigned: number;
  leadsConverted: number;
  strReadyCount: number;
  stageBreakdown: { stage: string; count: number }[];
  weeklyVelocity: { week: string; velocity: number; conversions: number }[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

function makeWeeklyVelocity(baseVelocity: number, baseConversions: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    return {
      week: `W${i + 1}`,
      velocity: +(baseVelocity + (Math.random() - 0.5) * 4).toFixed(1),
      conversions: Math.max(0, Math.round(baseConversions + (Math.random() - 0.5) * 3)),
    };
  });
}

const MOCK_AGENTS: AgentConversionMetrics[] = [
  {
    id: 'a1', name: 'Priya Nair', email: 'priya@travlr.com', avatar: 'PN',
    conversionRate: 34.2, conversionTrend: 'up',
    avgResponseTimeHours: 9.1, responseTrend: 'up',
    assignmentVolume: 134, volumeTrend: 'up',
    pipelineVelocityDays: 11.4, velocityTrend: 'up',
    leadsAssigned: 134, leadsConverted: 46, strReadyCount: 12,
    stageBreakdown: [
      { stage: 'New Lead', count: 38 }, { stage: 'Contacted', count: 44 },
      { stage: 'Interested', count: 26 }, { stage: 'Proposal', count: 14 },
      { stage: 'Under Contract', count: 7 }, { stage: 'STR-Ready', count: 5 },
    ],
    weeklyVelocity: makeWeeklyVelocity(11.4, 6),
  },
  {
    id: 'a2', name: 'Sarah Mitchell', email: 'sarah@travlr.com', avatar: 'SM',
    conversionRate: 28.7, conversionTrend: 'up',
    avgResponseTimeHours: 14.3, responseTrend: 'flat',
    assignmentVolume: 118, volumeTrend: 'flat',
    pipelineVelocityDays: 14.1, velocityTrend: 'up',
    leadsAssigned: 118, leadsConverted: 34, strReadyCount: 8,
    stageBreakdown: [
      { stage: 'New Lead', count: 42 }, { stage: 'Contacted', count: 31 },
      { stage: 'Interested', count: 18 }, { stage: 'Proposal', count: 9 },
      { stage: 'Under Contract', count: 4 }, { stage: 'STR-Ready', count: 2 },
    ],
    weeklyVelocity: makeWeeklyVelocity(14.1, 4),
  },
  {
    id: 'a3', name: 'Marcus Webb', email: 'marcus@travlr.com', avatar: 'MW',
    conversionRate: 22.1, conversionTrend: 'flat',
    avgResponseTimeHours: 18.7, responseTrend: 'down',
    assignmentVolume: 95, volumeTrend: 'down',
    pipelineVelocityDays: 18.3, velocityTrend: 'flat',
    leadsAssigned: 95, leadsConverted: 21, strReadyCount: 5,
    stageBreakdown: [
      { stage: 'New Lead', count: 55 }, { stage: 'Contacted', count: 22 },
      { stage: 'Interested', count: 10 }, { stage: 'Proposal', count: 5 },
      { stage: 'Under Contract', count: 2 }, { stage: 'STR-Ready', count: 1 },
    ],
    weeklyVelocity: makeWeeklyVelocity(18.3, 3),
  },
  {
    id: 'a4', name: 'James Torres', email: 'james@travlr.com', avatar: 'JT',
    conversionRate: 16.8, conversionTrend: 'down',
    avgResponseTimeHours: 22.4, responseTrend: 'down',
    assignmentVolume: 107, volumeTrend: 'up',
    pipelineVelocityDays: 22.7, velocityTrend: 'down',
    leadsAssigned: 107, leadsConverted: 18, strReadyCount: 3,
    stageBreakdown: [
      { stage: 'New Lead', count: 68 }, { stage: 'Contacted', count: 22 },
      { stage: 'Interested', count: 8 }, { stage: 'Proposal', count: 3 },
      { stage: 'Under Contract', count: 1 }, { stage: 'STR-Ready', count: 0 },
    ],
    weeklyVelocity: makeWeeklyVelocity(22.7, 2),
  },
  {
    id: 'a5', name: 'Aisha Okafor', email: 'aisha@travlr.com', avatar: 'AO',
    conversionRate: 13.4, conversionTrend: 'down',
    avgResponseTimeHours: 27.2, responseTrend: 'down',
    assignmentVolume: 82, volumeTrend: 'flat',
    pipelineVelocityDays: 27.2, velocityTrend: 'down',
    leadsAssigned: 82, leadsConverted: 11, strReadyCount: 2,
    stageBreakdown: [
      { stage: 'New Lead', count: 52 }, { stage: 'Contacted', count: 18 },
      { stage: 'Interested', count: 7 }, { stage: 'Proposal', count: 3 },
      { stage: 'Under Contract', count: 1 }, { stage: 'STR-Ready', count: 0 },
    ],
    weeklyVelocity: makeWeeklyVelocity(27.2, 1),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TrendIcon({ trend, inverse = false }: { trend: 'up' | 'down' | 'flat'; inverse?: boolean }) {
  if (trend === 'flat') return <Minus size={12} className="text-muted-foreground" />;
  const isGood = inverse ? trend === 'down' : trend === 'up';
  if (trend === 'up') return <ArrowUp size={12} className={isGood ? 'text-emerald-500' : 'text-red-500'} />;
  return <ArrowDown size={12} className={isGood ? 'text-emerald-500' : 'text-red-500'} />;
}

function MetricCard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend, inverse = false,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconBg: string; iconColor: string; trend?: 'up' | 'down' | 'flat'; inverse?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={13} className={iconColor} />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground leading-none">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend && <TrendIcon trend={trend} inverse={inverse} />}
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        </div>
      )}
    </div>
  );
}

function AgentAvatar({ initials, rank }: { initials: string; rank: number }) {
  const colors = [
    'bg-amber-100 text-amber-700',
    'bg-slate-100 text-slate-600',
    'bg-orange-100 text-orange-700',
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
  ];
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${colors[(rank - 1) % colors.length]}`}>
      {initials}
    </div>
  );
}

const STAGE_COLORS = ['#94a3b8', '#60a5fa', '#f59e0b', '#a78bfa', '#f97316', '#10b981'];

// ─── Agent Row ────────────────────────────────────────────────────────────────

function AgentRow({ agent, rank, isExpanded, onToggle }: {
  agent: AgentConversionMetrics;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const radarData = [
    { metric: 'Conversion', value: Math.min(100, agent.conversionRate * 2.5) },
    { metric: 'Response', value: Math.max(0, 100 - (agent.avgResponseTimeHours / 30) * 100) },
    { metric: 'Volume', value: Math.min(100, (agent.assignmentVolume / 150) * 100) },
    { metric: 'Velocity', value: Math.max(0, 100 - (agent.pipelineVelocityDays / 30) * 100) },
    { metric: 'STR-Ready', value: Math.min(100, agent.strReadyCount * 8) },
  ];

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all duration-300 ${
      rank === 1 ? 'border-amber-200 dark:border-amber-800' :
      rank === 2 ? 'border-slate-200 dark:border-slate-700': 'border-border'
    }`}>
      {/* Row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Rank */}
        <div className="w-6 text-center shrink-0">
          {rank <= 3 ? (
            <Award size={16} className={rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-slate-400' : 'text-orange-500'} />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">{rank}</span>
          )}
        </div>

        <AgentAvatar initials={agent.avatar} rank={rank} />

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{agent.email}</p>
        </div>

        {/* KPI chips — hidden on small screens, shown on md+ */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {/* Conversion Rate */}
          <div className="text-center min-w-[64px]">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold text-foreground">{agent.conversionRate}%</span>
              <TrendIcon trend={agent.conversionTrend} />
            </div>
            <p className="text-[9px] text-muted-foreground">Conversion</p>
          </div>

          {/* Response Time */}
          <div className="text-center min-w-[64px]">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold text-foreground">{agent.avgResponseTimeHours}h</span>
              <TrendIcon trend={agent.responseTrend} inverse />
            </div>
            <p className="text-[9px] text-muted-foreground">Avg Response</p>
          </div>

          {/* Assignment Volume */}
          <div className="text-center min-w-[64px]">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold text-foreground">{agent.assignmentVolume}</span>
              <TrendIcon trend={agent.volumeTrend} />
            </div>
            <p className="text-[9px] text-muted-foreground">Assigned</p>
          </div>

          {/* Pipeline Velocity */}
          <div className="text-center min-w-[72px]">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-bold text-foreground">{agent.pipelineVelocityDays}d</span>
              <TrendIcon trend={agent.velocityTrend} inverse />
            </div>
            <p className="text-[9px] text-muted-foreground">Lead→STR-Ready</p>
          </div>

          {/* STR-Ready */}
          <div className="text-center min-w-[48px]">
            <span className="text-sm font-bold text-emerald-600">{agent.strReadyCount}</span>
            <p className="text-[9px] text-muted-foreground">STR-Ready</p>
          </div>
        </div>

        {/* Mobile: compact KPIs */}
        <div className="flex md:hidden items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{agent.conversionRate}%</p>
            <p className="text-[9px] text-muted-foreground">Conv.</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{agent.pipelineVelocityDays}d</p>
            <p className="text-[9px] text-muted-foreground">Velocity</p>
          </div>
        </div>

        {isExpanded
          ? <ChevronUp size={14} className="text-muted-foreground shrink-0 ml-1" />
          : <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-1" />
        }
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-5">
          {/* Mobile KPI grid */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {[
              { label: 'Conversion Rate', value: `${agent.conversionRate}%`, trend: agent.conversionTrend },
              { label: 'Avg Response', value: `${agent.avgResponseTimeHours}h`, trend: agent.responseTrend, inverse: true },
              { label: 'Leads Assigned', value: `${agent.assignmentVolume}`, trend: agent.volumeTrend },
              { label: 'Lead→STR-Ready', value: `${agent.pipelineVelocityDays}d`, trend: agent.velocityTrend, inverse: true },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold text-foreground">{kpi.value}</span>
                  <TrendIcon trend={kpi.trend} inverse={kpi.inverse} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Pipeline stage breakdown */}
            <div className="lg:col-span-2 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Stage Breakdown</p>
              <div className="space-y-1.5">
                {agent.stageBreakdown.map((s, i) => {
                  const total = agent.stageBreakdown.reduce((acc, x) => acc + x.count, 0) || 1;
                  const pct = Math.round((s.count / total) * 100);
                  return (
                    <div key={s.stage} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-28 truncate shrink-0">{s.stage}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: STAGE_COLORS[i] }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-foreground w-6 text-right">{s.count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Weekly velocity chart */}
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Weekly Pipeline Velocity (days)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={agent.weeklyVelocity} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
                      formatter={(v: number, name: string) => [
                        name === 'velocity' ? `${v}d` : v,
                        name === 'velocity' ? 'Avg Days' : 'Conversions',
                      ]}
                    />
                    <Line type="monotone" dataKey="velocity" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Radar chart */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Performance Radar</p>
              <ResponsiveContainer width="100%" height={180}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card border border-border rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-foreground">{agent.leadsConverted}</p>
                  <p className="text-[9px] text-muted-foreground">Converted</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-emerald-600">{agent.strReadyCount}</p>
                  <p className="text-[9px] text-muted-foreground">STR-Ready</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortKey = 'conversionRate' | 'avgResponseTimeHours' | 'assignmentVolume' | 'pipelineVelocityDays';

export default function AgentConversionAnalyticsPage() {
  const supabase = createClient();
  const [agents, setAgents] = useState<AgentConversionMetrics[]>(MOCK_AGENTS);
  const [loading, setLoading] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>('a1');
  const [sortBy, setSortBy] = useState<SortKey>('conversionRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [period, setPeriod] = useState<'30d' | '90d' | 'all'>('30d');

  const sortedAgents = [...agents].sort((a, b) => {
    const aVal = a[sortBy] as number;
    const bVal = b[sortBy] as number;
    // For response time and velocity, lower is better — invert sort
    const invertMetrics: SortKey[] = ['avgResponseTimeHours', 'pipelineVelocityDays'];
    const shouldInvert = invertMetrics.includes(sortBy);
    const diff = shouldInvert ? aVal - bVal : bVal - aVal;
    return sortDir === 'desc' ? diff : -diff;
  });

  const teamAvgConversion = (agents.reduce((s, a) => s + a.conversionRate, 0) / agents.length).toFixed(1);
  const teamAvgResponse = (agents.reduce((s, a) => s + a.avgResponseTimeHours, 0) / agents.length).toFixed(1);
  const totalAssigned = agents.reduce((s, a) => s + a.assignmentVolume, 0);
  const teamAvgVelocity = (agents.reduce((s, a) => s + a.pipelineVelocityDays, 0) / agents.length).toFixed(1);

  const comparisonData = sortedAgents.map(a => ({
    name: a.name.split(' ')[0],
    conversion: a.conversionRate,
    response: a.avgResponseTimeHours,
    velocity: a.pipelineVelocityDays,
    volume: a.assignmentVolume,
  }));

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Rocket size={22} className="text-indigo-500" />
              Agent Conversion Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Per-agent conversion rate, response time, assignment volume, and lead-to-STR-ready pipeline velocity
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['30d', '90d', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    period === p ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setLoading(true)}
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Team KPI Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Team Avg Conversion" value={`${teamAvgConversion}%`}
            sub="across all agents" icon={Target}
            iconBg="bg-emerald-500/10" iconColor="text-emerald-600"
            trend="up"
          />
          <MetricCard
            label="Team Avg Response" value={`${teamAvgResponse}h`}
            sub="first contact time" icon={Clock}
            iconBg="bg-blue-500/10" iconColor="text-blue-600"
            trend="flat" inverse
          />
          <MetricCard
            label="Total Assigned" value={totalAssigned.toLocaleString()}
            sub="leads across team" icon={Users}
            iconBg="bg-purple-500/10" iconColor="text-purple-600"
            trend="up"
          />
          <MetricCard
            label="Avg Pipeline Velocity" value={`${teamAvgVelocity}d`}
            sub="lead to STR-ready" icon={Zap}
            iconBg="bg-amber-500/10" iconColor="text-amber-600"
            trend="up" inverse
          />
        </div>

        {/* ── Comparison Chart ── */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Team Comparison</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Conversion %</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Velocity (days)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Response (hrs)</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={comparisonData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
              />
              <Bar dataKey="conversion" name="Conversion %" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="velocity" name="Velocity (days)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="response" name="Response (hrs)" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Sort Controls ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Filter size={12} />Sort by:</span>
          {([
            { key: 'conversionRate', label: 'Conversion Rate' },
            { key: 'avgResponseTimeHours', label: 'Response Time' },
            { key: 'assignmentVolume', label: 'Volume' },
            { key: 'pipelineVelocityDays', label: 'Pipeline Velocity' },
          ] as { key: SortKey; label: string }[]).map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                sortBy === opt.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
              }`}
            >
              {opt.label}
              {sortBy === opt.key && (
                sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />
              )}
            </button>
          ))}
        </div>

        {/* ── Agent Rows ── */}
        <div className="space-y-3">
          {sortedAgents.map((agent, idx) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              rank={idx + 1}
              isExpanded={expandedAgent === agent.id}
              onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            />
          ))}
        </div>

        {/* ── Velocity Funnel Note ── */}
        <div className="bg-indigo-500/5 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex items-start gap-3">
          <Activity size={16} className="text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Pipeline Velocity Definition</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              <strong>Lead-to-STR-Ready velocity</strong> measures the average number of days from when a lead is assigned to an agent until that lead's property reaches "STR-Ready" status (all onboarding checklist steps complete). Lower is better. Team benchmark: <strong>{teamAvgVelocity} days</strong>.
            </p>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
