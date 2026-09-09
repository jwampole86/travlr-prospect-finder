'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,  } from 'recharts';
import { Users, Phone, TrendingUp, Clock, RefreshCw, ChevronDown, Award, AlertTriangle, Flag, Loader2, ArrowUpRight, ArrowDownRight, Minus,  } from 'lucide-react';
import { callSessionService, type CallSession } from '@/lib/services/callSessionService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentCallStats {
  agentName: string;
  totalCalls: number;
  conversionRate: number;
  avgTalkTimeSec: number;
  weeklyTrend: { day: string; calls: number; converted: number }[];
  excellentlyHandled: number;
  needsCoaching: number;
  escalated: number;
  trend: 'up' | 'down' | 'flat';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function buildWeeklyTrend(sessions: CallSession[]): { day: string; calls: number; converted: number }[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = days[d.getDay()];
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = sessions.filter(s => s.started_at.startsWith(dateStr));
    const converted = daySessions.filter(s => s.call_outcome === 'interested' || s.call_outcome === 'callback').length;
    return { day: dayStr, calls: daySessions.length, converted };
  });
}

function buildAgentStats(sessions: CallSession[]): AgentCallStats[] {
  const byAgent: Record<string, CallSession[]> = {};
  for (const s of sessions) {
    const name = s.agent_name ?? 'Unknown';
    if (!byAgent[name]) byAgent[name] = [];
    byAgent[name].push(s);
  }

  return Object.entries(byAgent).map(([agentName, agentSessions]) => {
    const total = agentSessions.length;
    const converted = agentSessions.filter(s => s.call_outcome === 'interested' || s.call_outcome === 'callback').length;
    const conversionRate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;
    const durSessions = agentSessions.filter(s => s.duration_seconds && s.duration_seconds > 0);
    const avgTalkTimeSec = durSessions.length > 0
      ? Math.round(durSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / durSessions.length)
      : 0;

    const weeklyTrend = buildWeeklyTrend(agentSessions);
    const thisWeekCalls = weeklyTrend.slice(-3).reduce((s, d) => s + d.calls, 0);
    const prevWeekCalls = weeklyTrend.slice(0, 3).reduce((s, d) => s + d.calls, 0);
    const trend: 'up' | 'down' | 'flat' = thisWeekCalls > prevWeekCalls ? 'up' : thisWeekCalls < prevWeekCalls ? 'down' : 'flat';

    const excellentlyHandled = agentSessions.filter(s => (s as any).qa_flag === 'excellently_handled').length;
    const needsCoaching = agentSessions.filter(s => (s as any).qa_flag === 'needs_coaching').length;
    const escalated = agentSessions.filter(s => (s as any).qa_flag === 'escalate_for_review').length;

    return { agentName, totalCalls: total, conversionRate, avgTalkTimeSec, weeklyTrend, excellentlyHandled, needsCoaching, escalated, trend };
  }).sort((a, b) => b.totalCalls - a.totalCalls);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUpRight size={13} className="text-emerald-500" />;
  if (trend === 'down') return <ArrowDownRight size={13} className="text-red-500" />;
  return <Minus size={13} className="text-muted-foreground" />;
}

function AgentCard({ agent, rank }: { agent: AgentCallStats; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  const initials = agent.agentName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const rankColors: Record<number, string> = {
    1: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    2: 'bg-slate-400/10 text-slate-400 border-slate-400/30',
    3: 'bg-orange-600/10 text-orange-600 border-orange-600/30',
  };
  const rankStyle = rankColors[rank] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Rank */}
        <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${rankStyle}`}>
          {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
        </span>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{initials}</span>
        </div>

        {/* Name + trend */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{agent.agentName}</span>
            <TrendIcon trend={agent.trend} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {agent.excellentlyHandled > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600"><Award size={9} />{agent.excellentlyHandled} excellent</span>
            )}
            {agent.needsCoaching > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle size={9} />{agent.needsCoaching} coaching</span>
            )}
            {agent.escalated > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-600"><Flag size={9} />{agent.escalated} escalated</span>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="hidden sm:flex items-center gap-6 shrink-0">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{agent.totalCalls}</p>
            <p className="text-[10px] text-muted-foreground">Calls</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{agent.conversionRate}%</p>
            <p className="text-[10px] text-muted-foreground">Conversion</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{fmtDuration(agent.avgTalkTimeSec)}</p>
            <p className="text-[10px] text-muted-foreground">Avg Talk Time</p>
          </div>
        </div>

        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Mobile KPIs */}
      <div className="sm:hidden flex items-center gap-4 px-5 pb-3 border-t border-border/50 pt-3">
        <div className="text-center flex-1">
          <p className="text-base font-bold text-foreground">{agent.totalCalls}</p>
          <p className="text-[10px] text-muted-foreground">Calls</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-base font-bold text-foreground">{agent.conversionRate}%</p>
          <p className="text-[10px] text-muted-foreground">Conversion</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-sm font-bold text-foreground">{fmtDuration(agent.avgTalkTimeSec)}</p>
          <p className="text-[10px] text-muted-foreground">Avg Talk</p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/10 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">7-Day Call Volume &amp; Conversions</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={agent.weeklyTrend} barSize={14} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
              />
              <Bar dataKey="calls" name="Total Calls" fill="var(--primary)" opacity={0.7} radius={[3,3,0,0]} />
              <Bar dataKey="converted" name="Converted" fill="#22c55e" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamAgentsPage() {
  const [agents, setAgents] = useState<AgentCallStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [lastRefreshed, setLastRefreshed] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const dateFrom = new Date(Date.now() - days * 86400000).toISOString();
      const sessions = await callSessionService.getRecent({ limit: 1000, dateFrom });
      const stats = buildAgentStats(sessions);
      setAgents(stats);
      setLastRefreshed(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalCalls = agents.reduce((s, a) => s + a.totalCalls, 0);
  const avgConversion = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + a.conversionRate, 0) / agents.length * 10) / 10
    : 0;
  const avgTalkTime = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + a.avgTalkTimeSec, 0) / agents.length)
    : 0;
  const coachingNeeded = agents.filter(a => a.needsCoaching > 0 || a.escalated > 0).length;

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Team Agent Performance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Call volume, conversion rates, talk time, and coaching flags — per agent.</p>
          </div>
          <div className="flex items-center gap-2">
            {lastRefreshed && <span className="text-[11px] text-muted-foreground">Updated {lastRefreshed}</span>}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button key={r} onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${dateRange === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-muted transition-all disabled:opacity-50">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Calls', value: totalCalls.toString(), icon: Phone, color: 'bg-blue-500/10 text-blue-500' },
            { label: 'Avg Conversion', value: `${avgConversion}%`, icon: TrendingUp, color: 'bg-emerald-500/10 text-emerald-500' },
            { label: 'Avg Talk Time', value: fmtDuration(avgTalkTime), icon: Clock, color: 'bg-violet-500/10 text-violet-500' },
            { label: 'Need Coaching', value: coachingNeeded.toString(), icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-500' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                <kpi.icon size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Agent List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <Users size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">No call data yet</p>
            <p className="text-xs text-muted-foreground mt-1">Agent performance will appear here once calls are logged.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent, i) => (
              <AgentCard key={agent.agentName} agent={agent} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
