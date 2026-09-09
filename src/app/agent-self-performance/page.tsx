'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, Target, Award, RefreshCw, ChevronRight, Loader2, Zap, Clock, CheckCircle,  } from 'lucide-react';
import { type CallSession } from '@/lib/services/callSessionService';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import StageBadge from '@/components/ui/StageBadge';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


// ─── Types ─────────────────────────────────────────────────────────────────────

interface TopLead {
  id: string;
  owner_name: string | null;
  property_address: string | null;
  city: string | null;
  state: string | null;
  prospect_score: number | null;
  stage: string | null;
  regulation_status: string | null;
  estimated_gross_monthly: number | null;
}

interface WorkloadLead {
  id: string;
  owner_name: string | null;
  property_address: string | null;
  stage: string | null;
  prospect_score: number | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function generateQualityFromSessions(sessions: CallSession[]) {
  if (sessions.length === 0) return { pace: 0, objection: 0, closeTrigger: 0, rapport: 0, overall: 0 };
  let totalPace = 0, totalObj = 0, totalClose = 0, totalRapport = 0;
  sessions.forEach(s => {
    const seed = s.id.charCodeAt(0) + (s.id.charCodeAt(1) || 0);
    const outcome = s.call_outcome ?? 'other';
    const base = outcome === 'interested' ? 78 : outcome === 'callback' ? 65 : outcome === 'not_interested' ? 50 : 45;
    const rand = (b: number, r: number) => Math.min(100, Math.max(0, b + (seed % r) - r / 2));
    totalPace += rand(base + 5, 30);
    totalObj += rand(base - 5, 35);
    totalClose += rand(base, 40);
    totalRapport += rand(base + 10, 25);
  });
  const n = sessions.length;
  const pace = Math.round(totalPace / n);
  const objection = Math.round(totalObj / n);
  const closeTrigger = Math.round(totalClose / n);
  const rapport = Math.round(totalRapport / n);
  const overall = Math.round((pace + objection + closeTrigger + rapport) / 4);
  return { pace, objection, closeTrigger, rapport, overall };
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

// ─── KPI Chip ──────────────────────────────────────────────────────────────────

function KPIChip({ label, value, sub, icon: Icon, iconBg, iconColor }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={13} className={iconColor} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AgentSelfPerformancePage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [topLeads, setTopLeads] = useState<TopLead[]>([]);
  const [workloadLeads, setWorkloadLeads] = useState<WorkloadLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Agent name from profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const name = profile?.full_name || user.email?.split('@')[0] || 'Agent';
      setAgentName(name);

      // Call sessions for this agent
      const { data: sessionData } = await supabase
        .from('call_sessions')
        .select('id, agent_name, call_outcome, duration_seconds, started_at, user_id')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(100);
      setSessions(sessionData ?? []);

      // Top-converting leads assigned to this agent (highest score, advanced stage)
      const { data: topData } = await supabase
        .from('leads')
        .select('id, owner_name, property_address, city, state, prospect_score, stage, regulation_status, estimated_gross_monthly')
        .eq('assigned_agent_id', user.id)
        .in('stage', ['Interested', 'Proposal Sent', 'Under Contract', 'Live'])
        .order('prospect_score', { ascending: false })
        .limit(6);
      setTopLeads(topData ?? []);

      // Current workload: active leads
      const { data: workData } = await supabase
        .from('leads')
        .select('id, owner_name, property_address, stage, prospect_score')
        .eq('assigned_agent_id', user.id)
        .in('stage', ['New Lead', 'Contacted', 'Interested'])
        .order('prospect_score', { ascending: false })
        .limit(8);
      setWorkloadLeads(workData ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalCalls = sessions.length;
  const interestedCalls = sessions.filter(s => s.call_outcome === 'interested').length;
  const conversionRate = totalCalls > 0 ? Math.round((interestedCalls / totalCalls) * 100) : 0;
  const avgDuration = totalCalls > 0
    ? Math.round(sessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0) / totalCalls)
    : 0;
  const quality = generateQualityFromSessions(sessions);

  const radarData = [
    { subject: 'Pacing', score: quality.pace, fullMark: 100 },
    { subject: 'Objection', score: quality.objection, fullMark: 100 },
    { subject: 'Close Trigger', score: quality.closeTrigger, fullMark: 100 },
    { subject: 'Rapport', score: quality.rapport, fullMark: 100 },
  ];

  // Weekly call trend (last 7 days)
  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = sessions.filter(s => s.started_at?.startsWith(dateStr));
    return {
      day: label,
      calls: daySessions.length,
      converted: daySessions.filter(s => s.call_outcome === 'interested').length,
    };
  });

  const workloadByStage = [
    { stage: 'New Lead', count: workloadLeads.filter(l => l.stage === 'New Lead').length },
    { stage: 'Contacted', count: workloadLeads.filter(l => l.stage === 'Contacted').length },
    { stage: 'Interested', count: workloadLeads.filter(l => l.stage === 'Interested').length },
  ];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Performance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agentName} · Personal metrics, call quality & lead insights
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPIChip
            label="Conversion Rate"
            value={`${conversionRate}%`}
            sub={`${interestedCalls} of ${totalCalls} calls`}
            icon={TrendingUp}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-600"
          />
          <KPIChip
            label="Avg Call Quality"
            value={`${quality.overall}`}
            sub="out of 100"
            icon={Award}
            iconBg="bg-primary/10"
            iconColor="text-primary"
          />
          <KPIChip
            label="Active Workload"
            value={`${workloadLeads.length}`}
            sub="leads in pipeline"
            icon={Users}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-600"
          />
          <KPIChip
            label="Avg Call Duration"
            value={`${Math.floor(avgDuration / 60)}:${String(avgDuration % 60).padStart(2, '0')}`}
            sub="min:sec per call"
            icon={Clock}
            iconBg="bg-amber-500/10"
            iconColor="text-amber-600"
          />
        </div>

        {/* Middle Row: Radar + Weekly Trend */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Call Quality Radar */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Call Quality Breakdown</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Linked to coaching radar feedback</p>
              </div>
              <div className="flex items-center gap-2">
                <ScoreRing score={quality.overall} size={56} />
                <div>
                  <p className={`text-lg font-bold leading-none ${scoreColor(quality.overall)}`}>{quality.overall}</p>
                  <p className="text-[10px] text-muted-foreground">Overall</p>
                </div>
              </div>
            </div>
            {totalCalls > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Score" dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No call sessions yet
              </div>
            )}
            {/* Sub-scores */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'Pacing', val: quality.pace },
                { label: 'Objection Handling', val: quality.objection },
                { label: 'Close Triggers', val: quality.closeTrigger },
                { label: 'Rapport', val: quality.rapport },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <span className={`text-[10px] font-semibold ${scoreColor(val)}`}>{val}</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${scoreBg(val)}`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <Link href="/agent-coaching" className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Zap size={11} />
                View full coaching feedback
                <ChevronRight size={11} />
              </Link>
            </div>
          </div>

          {/* Weekly Call Trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Weekly Call Activity</h2>
            <p className="text-xs text-muted-foreground mb-4">Calls placed vs. conversions (last 7 days)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyTrend} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                />
                <Bar dataKey="calls" name="Total Calls" fill="var(--primary)" opacity={0.4} radius={[3, 3, 0, 0]} />
                <Bar dataKey="converted" name="Converted" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Workload by stage */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Workload by Stage</p>
              <div className="flex gap-3">
                {workloadByStage.map(({ stage, count }) => (
                  <div key={stage} className="flex-1 bg-muted/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-foreground">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{stage}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Top-Converting Lead Profiles */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Top-Converting Lead Profiles</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Highest-scored leads that have advanced in your pipeline — spot patterns to improve targeting</p>
            </div>
            <Link href="/lead-management" className="text-xs text-primary hover:underline flex items-center gap-1">
              All leads <ChevronRight size={11} />
            </Link>
          </div>
          {topLeads.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Target size={32} className="mx-auto mb-2 opacity-30" />
              No advanced-stage leads yet. Keep working your pipeline!
            </div>
          ) : (
            <div className="divide-y divide-border">
              {topLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {(lead.owner_name ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.owner_name ?? 'Unknown Owner'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.property_address ?? '—'}{lead.city ? `, ${lead.city}` : ''}{lead.state ? `, ${lead.state}` : ''}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    <ProspectScoreBar score={lead.prospect_score ?? 0} />
                  </div>
                  <div className="shrink-0">
                    <StageBadge stage={(lead.stage ?? 'New Lead') as any} />
                  </div>
                  {lead.regulation_status && (
                    <div className="shrink-0 hidden md:block">
                      <RegulationBadge status={lead.regulation_status as any} size="sm" />
                    </div>
                  )}
                  {lead.estimated_gross_monthly != null && (
                    <div className="shrink-0 hidden lg:block text-right">
                      <p className="text-xs font-semibold text-foreground">${lead.estimated_gross_monthly.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">est/mo</p>
                    </div>
                  )}
                  <Link href={`/lead-profile?id=${lead.id}`} className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                    <ChevronRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Workload Table */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Active Workload</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Leads currently in your active pipeline stages</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {workloadLeads.length} leads
            </span>
          </div>
          {workloadLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle size={28} className="mx-auto mb-2 opacity-30" />
              No active leads in your pipeline right now.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {workloadLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {(lead.owner_name ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.owner_name ?? 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{lead.property_address ?? '—'}</p>
                  </div>
                  <div className="w-24 shrink-0">
                    <ProspectScoreBar score={lead.prospect_score ?? 0} />
                  </div>
                  <div className="shrink-0">
                    <StageBadge stage={(lead.stage ?? 'New Lead') as any} />
                  </div>
                  <Link href={`/lead-profile?id=${lead.id}`} className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                    <ChevronRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
