'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, TrendingUp, Mail, ArrowUpRight, ArrowDownRight, Minus, RefreshCw, ChevronDown, ChevronUp, Loader2, Target, BarChart2, Award, Activity, Zap } from 'lucide-react';
import { Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentMetrics {
  id: string;
  name: string;
  email: string;
  leadsAssigned: number;
  outreachSent: number;
  responseRate: number;
  conversionRate: number;
  stageProgression: Record<string, number>;
  rank: number;
  trend: 'up' | 'down' | 'neutral';
  weeklyTrend: TrendPoint[];
}

interface TrendPoint {
  week: string;
  outreach: number;
  responses: number;
  conversions: number;
}

interface TeamSummary {
  totalLeads: number;
  totalOutreach: number;
  avgResponseRate: number;
  avgConversionRate: number;
}

const STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live'];
const STAGE_COLORS = ['#94a3b8', '#60a5fa', '#fbbf24', '#a78bfa', '#fb923c', '#34d399'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWeeklyTrend(outreachRows: any[], agentId: string): TrendPoint[] {
  const weeks: Record<string, TrendPoint> = {};
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `W${8 - i}`;
    weeks[key] = { week: key, outreach: 0, responses: 0, conversions: 0 };
  }
  outreachRows
    .filter((r) => r.agent_id === agentId)
    .forEach((r) => {
      const sent = new Date(r.sent_at);
      const diffWeeks = Math.floor((now.getTime() - sent.getTime()) / (7 * 24 * 3600 * 1000));
      if (diffWeeks >= 0 && diffWeeks < 8) {
        const key = `W${8 - diffWeeks}`;
        if (weeks[key]) {
          weeks[key].outreach++;
          if (r.reply_detected || r.status === 'replied') weeks[key].responses++;
          if (r.status === 'converted') weeks[key].conversions++;
        }
      }
    });
  return Object.values(weeks);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
          <Icon size={16} className="text-white" />
        </div>
        {trend === 'up' && <ArrowUpRight size={14} className="text-emerald-500" />}
        {trend === 'down' && <ArrowDownRight size={14} className="text-red-500" />}
        {trend === 'neutral' && <Minus size={14} className="text-muted-foreground" />}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function StageProgressBar({ stages }: { stages: Record<string, number> }) {
  const total = Object.values(stages).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-1.5">
      {STAGES.map((stage, i) => {
        const count = stages[stage] ?? 0;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={stage} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-28 truncate shrink-0">{stage}</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: STAGE_COLORS[i] }}
              />
            </div>
            <span className="text-[10px] font-semibold text-foreground w-6 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500 font-bold text-sm">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-bold text-sm">🥈</span>;
  if (rank === 3) return <span className="text-amber-700 font-bold text-sm">🥉</span>;
  return <span className="text-xs font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
}

function AgentDrillDown({ agent, expanded, onToggle }: {
  agent: AgentMetrics; expanded: boolean; onToggle: () => void;
}) {
  const perfScore = agent.responseRate * 1.5 + agent.conversionRate * 3;
  const perfLabel = perfScore >= 40 ? 'Top Performer' : perfScore >= 25 ? 'Strong' : perfScore >= 12 ? 'Average' : 'Needs Coaching';
  const perfColor = perfScore >= 40
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    : perfScore >= 25 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    : perfScore >= 12 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :'bg-red-500/10 text-red-600 border-red-500/20';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Rank */}
        <div className="w-8 flex items-center justify-center shrink-0">
          <RankBadge rank={agent.rank} />
        </div>
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">
            {agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </span>
        </div>
        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
        </div>
        {/* KPIs */}
        <div className="hidden sm:flex items-center gap-5">
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{agent.leadsAssigned}</p>
            <p className="text-[10px] text-muted-foreground">Leads</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{agent.outreachSent}</p>
            <p className="text-[10px] text-muted-foreground">Outreach</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{agent.responseRate}%</p>
            <p className="text-[10px] text-muted-foreground">Response</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{agent.conversionRate}%</p>
            <p className="text-[10px] text-muted-foreground">Conversion</p>
          </div>
        </div>
        {/* Badge */}
        <span className={`hidden lg:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${perfColor}`}>
          {perfLabel}
        </span>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly trend */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">8-Week Performance Trend</p>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={agent.weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`grad-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }} />
                <Area type="monotone" dataKey="outreach" stroke="#6366f1" fill={`url(#grad-${agent.id})`} strokeWidth={2} name="Outreach" dot={false} />
                <Line type="monotone" dataKey="responses" stroke="#10b981" strokeWidth={2} dot={false} name="Responses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Stage progression */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">Stage Progression</p>
            <StageProgressBar stages={agent.stageProgression} />
          </div>

          {/* Metrics summary */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">Metrics Summary</p>
            <div className="space-y-3">
              {[
                { label: 'Leads Assigned', value: agent.leadsAssigned, max: 200, color: '#60a5fa' },
                { label: 'Outreach Sent', value: agent.outreachSent, max: 400, color: '#a78bfa' },
                { label: 'Response Rate', value: agent.responseRate, max: 100, unit: '%', color: '#34d399' },
                { label: 'Conversion Rate', value: agent.conversionRate, max: 30, unit: '%', color: '#fbbf24' },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{m.label}</span>
                    <span className="text-[11px] font-semibold text-foreground">{m.value}{m.unit ?? ''}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, (m.value / m.max) * 100)}%`, backgroundColor: m.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function Leaderboard({ agents, metric }: { agents: AgentMetrics[]; metric: 'outreach' | 'response' | 'conversion' | 'leads' }) {
  const sorted = [...agents].sort((a, b) => {
    if (metric === 'outreach') return b.outreachSent - a.outreachSent;
    if (metric === 'response') return b.responseRate - a.responseRate;
    if (metric === 'conversion') return b.conversionRate - a.conversionRate;
    return b.leadsAssigned - a.leadsAssigned;
  });

  const getValue = (a: AgentMetrics) => {
    if (metric === 'outreach') return `${a.outreachSent}`;
    if (metric === 'response') return `${a.responseRate}%`;
    if (metric === 'conversion') return `${a.conversionRate}%`;
    return `${a.leadsAssigned}`;
  };

  const maxVal = sorted[0]
    ? metric === 'outreach' ? sorted[0].outreachSent
    : metric === 'response' ? sorted[0].responseRate
    : metric === 'conversion' ? sorted[0].conversionRate
    : sorted[0].leadsAssigned
    : 1;

  return (
    <div className="space-y-2">
      {sorted.map((agent, i) => {
        const raw = metric === 'outreach' ? agent.outreachSent
          : metric === 'response' ? agent.responseRate
          : metric === 'conversion' ? agent.conversionRate
          : agent.leadsAssigned;
        const pct = maxVal > 0 ? Math.round((raw / maxVal) * 100) : 0;
        return (
          <div key={agent.id} className="flex items-center gap-3">
            <div className="w-6 flex items-center justify-center shrink-0">
              <RankBadge rank={i + 1} />
            </div>
            <div className="w-24 truncate">
              <p className="text-xs font-medium text-foreground truncate">{agent.name.split(' ')[0]}</p>
            </div>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#6366f1',
                }}
              />
            </div>
            <span className="text-xs font-bold text-foreground w-12 text-right">{getValue(agent)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentProductivityPage() {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [summary, setSummary] = useState<TeamSummary>({ totalLeads: 0, totalOutreach: 0, avgResponseRate: 0, avgConversionRate: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<'outreach' | 'response' | 'conversion' | 'leads'>('outreach');
  const [period, setPeriod] = useState<'30d' | '90d'>('30d');
  const supabase = createClient();
  const { user } = useAuth();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - (period === '30d' ? 30 : 90));

      const [agentRes, outreachRes, leadsRes] = await Promise.all([
        supabase.from('agent_profiles').select('id, full_name, email').order('full_name'),
        supabase.from('outreach_history').select('agent_id, status, reply_detected, sent_at, replied_at').gte('sent_at', since.toISOString()),
        supabase.from('leads').select('agent_id, stage'),
      ]);

      const agentData = agentRes.data ?? [];
      const outreachData = outreachRes.data ?? [];
      const leadsData = leadsRes.data ?? [];

      if (agentData.length === 0) {
        // No real agents yet — show empty state
        setAgents([]);
        setSummary({ totalLeads: 0, totalOutreach: 0, avgResponseRate: 0, avgConversionRate: 0 });
        setLoading(false);
        return;
      }

      const metrics: AgentMetrics[] = agentData.map((a: any, idx: number) => {
        const agentOutreach = outreachData.filter((r: any) => r.agent_id === a.id);
        const agentLeads = leadsData.filter((l: any) => l.agent_id === a.id);
        const total = agentOutreach.length;
        const replied = agentOutreach.filter((r: any) => r.reply_detected || r.status === 'replied').length;
        const converted = agentOutreach.filter((r: any) => r.status === 'converted').length;

        const stageProgression: Record<string, number> = {};
        STAGES.forEach((s) => { stageProgression[s] = agentLeads.filter((l: any) => l.stage === s).length; });

        return {
          id: a.id,
          name: a.full_name ?? a.email ?? 'Agent',
          email: a.email ?? '',
          leadsAssigned: agentLeads.length,
          outreachSent: total,
          responseRate: total > 0 ? Math.round((replied / total) * 100) : 0,
          conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
          stageProgression,
          rank: idx + 1,
          trend: 'neutral',
          weeklyTrend: buildWeeklyTrend(outreachData, a.id),
        };
      });

      // Sort by composite score and assign ranks
      metrics.sort((a, b) => (b.responseRate + b.conversionRate * 2) - (a.responseRate + a.conversionRate * 2));
      metrics.forEach((m, i) => { m.rank = i + 1; });

      const totalLeads = metrics.reduce((s, a) => s + a.leadsAssigned, 0);
      const totalOutreach = metrics.reduce((s, a) => s + a.outreachSent, 0);
      const avgResponseRate = metrics.length > 0 ? Math.round(metrics.reduce((s, a) => s + a.responseRate, 0) / metrics.length) : 0;
      const avgConversionRate = metrics.length > 0 ? Math.round(metrics.reduce((s, a) => s + a.conversionRate, 0) / metrics.length) : 0;

      setAgents(metrics);
      setSummary({ totalLeads, totalOutreach, avgResponseRate, avgConversionRate });
      if (metrics.length > 0) setExpandedId(metrics[0].id);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, period]);

  useEffect(() => { loadData(); }, [loadData]);

  // Team comparison chart data
  const comparisonData = agents.map((a) => ({
    name: a.name.split(' ')[0],
    outreach: a.outreachSent,
    response: a.responseRate,
    conversion: a.conversionRate,
  }));

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent Productivity</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Leads assigned, stage progression, outreach metrics, and conversion performance
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {(['30d', '90d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${period === p ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {p === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total Leads Assigned" value={summary.totalLeads.toLocaleString()} sub={`Across ${agents.length} agents`} icon={Users} color="bg-blue-500" trend="up" />
          <KPICard label="Total Outreach Sent" value={summary.totalOutreach.toLocaleString()} sub={`Last ${period}`} icon={Mail} color="bg-violet-500" trend="up" />
          <KPICard label="Avg Response Rate" value={`${summary.avgResponseRate}%`} sub="Team average" icon={TrendingUp} color="bg-emerald-500" trend="neutral" />
          <KPICard label="Avg Conversion Rate" value={`${summary.avgConversionRate}%`} sub="Lead → Live" icon={Target} color="bg-amber-500" trend="neutral" />
        </div>

        {/* Leaderboard + Team Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leaderboard */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award size={15} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Leaderboard</h2>
              </div>
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                {([
                  { key: 'outreach', label: 'Outreach' },
                  { key: 'response', label: 'Response' },
                  { key: 'conversion', label: 'Conversion' },
                  { key: 'leads', label: 'Leads' },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setLeaderboardMetric(m.key)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${leaderboardMetric === m.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-10">
                <Users size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No agent data yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Add agents to see leaderboard rankings.</p>
              </div>
            ) : (
              <Leaderboard agents={agents} metric={leaderboardMetric} />
            )}
          </div>

          {/* Team comparison chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Team Comparison</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : comparisonData.length === 0 ? (
              <div className="text-center py-10">
                <Activity size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No comparison data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={comparisonData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="outreach" fill="#6366f1" name="Outreach" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="right" dataKey="response" fill="#10b981" name="Response %" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="right" dataKey="conversion" fill="#f59e0b" name="Conversion %" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Individual Agent Drill-Down */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Individual Agent Drill-Down</h2>
            </div>
            <span className="text-xs text-muted-foreground">{agents.length} agents · click to expand</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <Users size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No agents found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add agents via the Agents page to see individual productivity metrics.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <AgentDrillDown
                  key={agent.id}
                  agent={agent}
                  expanded={expandedId === agent.id}
                  onToggle={() => setExpandedId((prev) => (prev === agent.id ? null : agent.id))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
