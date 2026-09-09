'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts';
import { TrendingUp, Users, Clock, RefreshCw, Calendar, Briefcase, Target, Award, ChevronRight, Brain, Star, Lightbulb, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateProfile {
  id: string;
  role_id: string;
  role_title: string;
  interview_date: string;
  overall_score: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  follow_up_status: 'pending' | 'scheduled' | 'completed' | 'rejected' | 'hired';
  created_at: string;
}

interface InterviewSession {
  id: string;
  role_id: string;
  role_title: string;
  scheduled_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

interface FunnelStage {
  name: string;
  value: number;
  fill: string;
  pct?: number;
}

interface RoleMetric {
  role: string;
  applied: number;
  interviewed: number;
  offered: number;
  hired: number;
  avgDays: number;
  conversionRate: number;
  fill?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string) {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

const FUNNEL_COLORS = ['#1f2937', '#374151', '#6b7280', '#9ca3af'];
const ROLE_COLORS = ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db'];

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Funnel Stage Row ─────────────────────────────────────────────────────────

function FunnelRow({ stage, prev }: { stage: FunnelStage; prev?: FunnelStage }) {
  const convRate = prev && prev.value > 0 ? Math.round((stage.value / prev.value) * 100) : null;
  const barWidth = stage.pct ?? 100;

  return (
    <div className="flex items-center gap-4">
      <div className="w-28 text-right">
        <span className="text-sm font-semibold text-gray-700">{stage.name}</span>
      </div>
      <div className="flex-1 relative h-10 flex items-center">
        <div
          className="h-8 rounded-lg flex items-center justify-end pr-3 transition-all duration-500"
          style={{ width: `${barWidth}%`, backgroundColor: stage.fill }}
        >
          <span className="text-white text-sm font-bold">{stage.value}</span>
        </div>
      </div>
      <div className="w-20 text-left">
        {convRate !== null ? (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${convRate >= 50 ? 'bg-green-100 text-green-700' : convRate >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {convRate}%
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Performance Insights Tab ─────────────────────────────────────────────────

function PerformanceInsightsTab({ profiles, sessions }: { profiles: CandidateProfile[]; sessions: InterviewSession[] }) {
  // Score distribution over time (monthly)
  const monthlyScores: { month: string; strong_yes: number; yes: number; maybe: number; no: number; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthProfiles = profiles.filter(p => p.created_at?.startsWith(key));
    monthlyScores.push({
      month: label,
      strong_yes: monthProfiles.filter(p => p.overall_score === 'strong_yes').length,
      yes: monthProfiles.filter(p => p.overall_score === 'yes').length,
      maybe: monthProfiles.filter(p => p.overall_score === 'maybe').length,
      no: monthProfiles.filter(p => p.overall_score === 'no').length,
      total: monthProfiles.length,
    });
  }

  // Strengths radar data (derived from score patterns)
  const totalScored = profiles.filter(p => p.overall_score).length || 1;
  const strongHireRate = profiles.filter(p => p.overall_score === 'strong_yes' || p.overall_score === 'yes').length / totalScored;
  const hiredRate = profiles.filter(p => p.follow_up_status === 'hired').length / Math.max(profiles.length, 1);
  const completionRate = sessions.filter(s => s.status === 'completed').length / Math.max(sessions.length, 1);

  const strengthsData = [
    { subject: 'Role Fit', value: Math.round(strongHireRate * 85 + 10), fullMark: 100 },
    { subject: 'Communication', value: Math.round(strongHireRate * 75 + 15), fullMark: 100 },
    { subject: 'Culture Match', value: Math.round(hiredRate * 90 + 5), fullMark: 100 },
    { subject: 'Interview Prep', value: Math.round(completionRate * 80 + 15), fullMark: 100 },
    { subject: 'Consistency', value: Math.round((strongHireRate + completionRate) / 2 * 80 + 10), fullMark: 100 },
    { subject: 'Pipeline Mgmt', value: Math.round(hiredRate * 70 + 20), fullMark: 100 },
  ];

  // Coaching tips based on data
  const coachingTips: { icon: React.ElementType; title: string; tip: string; priority: 'high' | 'medium' | 'low' }[] = [];

  const maybeRate = profiles.filter(p => p.overall_score === 'maybe').length / totalScored;
  const noRate = profiles.filter(p => p.overall_score === 'no').length / totalScored;

  if (maybeRate > 0.3) {
    coachingTips.push({
      icon: Target,
      title: 'Reduce "Maybe" Decisions',
      tip: 'A high "Maybe" rate suggests interview questions may not be probing deeply enough. Try adding structured behavioral questions to get clearer signal on role fit.',
      priority: 'high',
    });
  }

  if (noRate > 0.4) {
    coachingTips.push({
      icon: Users,
      title: 'Improve Candidate Sourcing',
      tip: 'High rejection rates often indicate a sourcing mismatch. Review job descriptions and screening criteria to attract better-qualified applicants.',
      priority: 'high',
    });
  }

  if (completionRate < 0.7 && sessions.length > 0) {
    coachingTips.push({
      icon: Calendar,
      title: 'Reduce Interview No-Shows',
      tip: 'Send confirmation emails 24 hours before each interview and use the Candidate Sequences tool to automate reminders.',
      priority: 'medium',
    });
  }

  coachingTips.push({
    icon: Brain,
    title: 'Use AI Guidance During Interviews',
    tip: 'Enable the Live Guidance overlay in Interview Mode to get real-time coaching on strengths, probe topics, and bias mitigation as the conversation unfolds.',
    priority: 'medium',
  });

  coachingTips.push({
    icon: Star,
    title: 'Rate Every Candidate',
    tip: 'Unrated profiles reduce the accuracy of your score distribution analytics. Make it a habit to assign a rating before saving each interview profile.',
    priority: 'low',
  });

  const unratedCount = profiles.filter(p => !p.overall_score).length;
  if (unratedCount > 3) {
    coachingTips.unshift({
      icon: CheckCircle,
      title: `Rate ${unratedCount} Unrated Profiles`,
      tip: `You have ${unratedCount} candidate profiles without a score. Visit Candidate Profiles to rate them and improve your analytics accuracy.`,
      priority: 'high',
    });
  }

  const priorityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-amber-200 bg-amber-50',
    low: 'border-blue-200 bg-blue-50',
  };
  const priorityTextColors = {
    high: 'text-red-700',
    medium: 'text-amber-700',
    low: 'text-blue-700',
  };
  const priorityIconColors = {
    high: 'text-red-500',
    medium: 'text-amber-500',
    low: 'text-blue-500',
  };

  // Score trend: is quality improving?
  const recentMonths = monthlyScores.slice(-3);
  const olderMonths = monthlyScores.slice(0, 3);
  const recentStrongRate = recentMonths.reduce((s, m) => s + m.strong_yes + m.yes, 0) / Math.max(recentMonths.reduce((s, m) => s + m.total, 0), 1);
  const olderStrongRate = olderMonths.reduce((s, m) => s + m.strong_yes + m.yes, 0) / Math.max(olderMonths.reduce((s, m) => s + m.total, 0), 1);
  const trendUp = recentStrongRate >= olderStrongRate;

  return (
    <div className="space-y-6">
      {/* Jen's Score Trend Banner */}
      <div className={`rounded-2xl border p-5 flex items-center gap-4 ${trendUp ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${trendUp ? 'bg-green-100' : 'bg-amber-100'}`}>
          {trendUp ? <ArrowUp className="w-6 h-6 text-green-600" /> : <ArrowDown className="w-6 h-6 text-amber-600" />}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-bold ${trendUp ? 'text-green-900' : 'text-amber-900'}`}>
            {trendUp ? 'Interview quality is trending up 📈' : 'Interview quality needs attention 📊'}
          </p>
          <p className={`text-xs mt-0.5 ${trendUp ? 'text-green-700' : 'text-amber-700'}`}>
            Strong hire rate: {Math.round(recentStrongRate * 100)}% (last 3 months) vs {Math.round(olderStrongRate * 100)}% (prior 3 months)
          </p>
        </div>
        <div className={`text-2xl font-bold ${trendUp ? 'text-green-700' : 'text-amber-700'}`}>
          {Math.round(recentStrongRate * 100)}%
        </div>
      </div>

      {/* Score Distribution Over Time */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="mb-5">
          <h2 className="text-base font-bold text-gray-900">Jen's Score Distribution Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">Monthly breakdown of interview ratings — last 6 months</p>
        </div>
        {monthlyScores.every(m => m.total === 0) ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Award className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No scored interviews yet</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyScores} barGap={2} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="strong_yes" name="Strong Yes" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="yes" name="Yes" stackId="a" fill="#22c55e" />
                <Bar dataKey="maybe" name="Maybe" stackId="a" fill="#f59e0b" />
                <Bar dataKey="no" name="No" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 justify-center flex-wrap">
              {[
                { color: '#16a34a', label: 'Strong Yes' },
                { color: '#22c55e', label: 'Yes' },
                { color: '#f59e0b', label: 'Maybe' },
                { color: '#ef4444', label: 'No' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Strengths Radar + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strengths Radar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="mb-5">
            <h2 className="text-base font-bold text-gray-900">Interview Strengths</h2>
            <p className="text-xs text-gray-500 mt-0.5">Jen's performance across key interview dimensions</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={strengthsData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Radar name="Score" dataKey="value" stroke="#1f2937" fill="#1f2937" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {strengthsData.map(d => (
              <div key={d.subject} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-600 font-medium">{d.subject}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-800 rounded-full" style={{ width: `${d.value}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{d.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coaching Tips */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Coaching Tips</h2>
              <p className="text-xs text-gray-500 mt-0.5">Personalized recommendations to improve future interviews</p>
            </div>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {coachingTips.slice(0, 5).map((tip, i) => {
              const TipIcon = tip.icon;
              return (
                <div key={i} className={`rounded-xl border p-3.5 ${priorityColors[tip.priority]}`}>
                  <div className="flex items-start gap-2.5">
                    <TipIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${priorityIconColors[tip.priority]}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`text-xs font-bold ${priorityTextColors[tip.priority]}`}>{tip.title}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                          tip.priority === 'high' ? 'bg-red-200 text-red-700' :
                          tip.priority === 'medium'? 'bg-amber-200 text-amber-700' : 'bg-blue-200 text-blue-700'
                        }`}>
                          {tip.priority}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${priorityTextColors[tip.priority]} opacity-90`}>{tip.tip}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Improve Your Performance</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/teleprompter/interview', label: 'Start Interview with AI Guidance', icon: Brain, desc: 'Live coaching overlay' },
            { href: '/candidate-sequences', label: 'Send Follow-Up Sequences', icon: Award, desc: 'Automate candidate comms' },
            { href: '/candidate-profiles', label: 'Rate Unrated Profiles', icon: Star, desc: `${profiles.filter(p => !p.overall_score).length} profiles need ratings` },
          ].map(action => {
            const ActionIcon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center flex-shrink-0 transition-colors">
                  <ActionIcon className="w-4 h-4 text-gray-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{action.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{action.desc}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0 ml-auto transition-colors" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HiringAnalyticsPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'30' | '90' | '180' | 'all'>('90');
  const [activeTab, setActiveTab] = useState<'overview' | 'performance'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const cutoff = period === 'all' ? null : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000).toISOString();

    const [profilesRes, sessionsRes] = await Promise.all([
      supabase.from('candidate_profiles').select('id,role_id,role_title,interview_date,overall_score,follow_up_status,created_at').order('created_at', { ascending: false }),
      supabase.from('interview_sessions').select('id,role_id,role_title,scheduled_at,status,created_at').order('created_at', { ascending: false }),
    ]);

    let p = (profilesRes.data || []) as CandidateProfile[];
    let s = (sessionsRes.data || []) as InterviewSession[];

    if (cutoff) {
      p = p.filter(x => x.created_at >= cutoff);
      s = s.filter(x => x.created_at >= cutoff);
    }

    setProfiles(p);
    setSessions(s);
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Derived Metrics ───────────────────────────────────────────────────────

  const totalApplied = sessions.length;
  const totalInterviewed = profiles.length;
  const totalOffered = profiles.filter(p => ['scheduled', 'completed', 'hired'].includes(p.follow_up_status)).length;
  const totalHired = profiles.filter(p => p.follow_up_status === 'hired').length;

  const maxFunnel = Math.max(totalApplied, 1);
  const funnelStages: FunnelStage[] = [
    { name: 'Applied', value: totalApplied, fill: FUNNEL_COLORS[0], pct: 100 },
    { name: 'Interviewed', value: totalInterviewed, fill: FUNNEL_COLORS[1], pct: Math.round((totalInterviewed / maxFunnel) * 100) },
    { name: 'Offered', value: totalOffered, fill: FUNNEL_COLORS[2], pct: Math.round((totalOffered / maxFunnel) * 100) },
    { name: 'Hired', value: totalHired, fill: FUNNEL_COLORS[3], pct: Math.round((totalHired / maxFunnel) * 100) },
  ];

  const overallConversion = totalApplied > 0 ? Math.round((totalHired / totalApplied) * 100) : 0;

  const hiredProfiles = profiles.filter(p => p.follow_up_status === 'hired');
  const avgTimeToHire = hiredProfiles.length > 0
    ? Math.round(hiredProfiles.reduce((sum, p) => {
        const session = sessions.find(s => s.role_id === p.role_id);
        return sum + (session ? daysBetween(session.created_at, p.created_at) : 14);
      }, 0) / hiredProfiles.length)
    : 0;

  const roleMap: Record<string, RoleMetric> = {};
  sessions.forEach(s => {
    if (!roleMap[s.role_id]) roleMap[s.role_id] = { role: s.role_title, applied: 0, interviewed: 0, offered: 0, hired: 0, avgDays: 0, conversionRate: 0 };
    roleMap[s.role_id].applied++;
  });
  profiles.forEach(p => {
    if (!roleMap[p.role_id]) roleMap[p.role_id] = { role: p.role_title, applied: 0, interviewed: 0, offered: 0, hired: 0, avgDays: 0, conversionRate: 0 };
    roleMap[p.role_id].interviewed++;
    if (['scheduled', 'completed', 'hired'].includes(p.follow_up_status)) roleMap[p.role_id].offered++;
    if (p.follow_up_status === 'hired') roleMap[p.role_id].hired++;
  });

  const roleMetrics = Object.values(roleMap).map((r, i) => ({
    ...r,
    conversionRate: r.applied > 0 ? Math.round((r.hired / r.applied) * 100) : 0,
    fill: ROLE_COLORS[i % ROLE_COLORS.length],
  }));

  const scoreMap: Record<string, number> = { strong_yes: 0, yes: 0, maybe: 0, no: 0, unrated: 0 };
  profiles.forEach(p => { const k = p.overall_score || 'unrated'; scoreMap[k] = (scoreMap[k] || 0) + 1; });
  const scoreData = [
    { name: 'Strong Yes', value: scoreMap.strong_yes, fill: '#16a34a' },
    { name: 'Yes', value: scoreMap.yes, fill: '#22c55e' },
    { name: 'Maybe', value: scoreMap.maybe, fill: '#f59e0b' },
    { name: 'No', value: scoreMap.no, fill: '#ef4444' },
    { name: 'Unrated', value: scoreMap.unrated, fill: '#d1d5db' },
  ].filter(d => d.value > 0);

  const monthlyTrend: { month: string; applied: number; hired: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    const applied = sessions.filter(s => s.created_at?.startsWith(key)).length;
    const hired = profiles.filter(p => p.follow_up_status === 'hired' && p.created_at?.startsWith(key)).length;
    monthlyTrend.push({ month: label, applied, hired });
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hiring Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Candidate funnel, time-to-hire, and performance insights</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              {(['30', '90', '180', 'all'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {p === 'all' ? 'All Time' : `${p}d`}
                </button>
              ))}
            </div>
            <Link href="/interview-calendar" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Calendar className="w-4 h-4" /> Calendar
            </Link>
            <Link href="/candidate-profiles" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Users className="w-4 h-4" /> Profiles
            </Link>
            <button onClick={fetchData} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { key: 'overview', label: 'Overview', icon: TrendingUp },
            { key: 'performance', label: 'Performance Insights', icon: Brain },
          ].map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
                {tab.key === 'performance' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">New</span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
          </div>
        ) : activeTab === 'performance' ? (
          <PerformanceInsightsTab profiles={profiles} sessions={sessions} />
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Applied" value={totalApplied} icon={Users} color="bg-gray-100 text-gray-600" sub="Interview sessions scheduled" />
              <StatCard label="Interviewed" value={totalInterviewed} icon={Briefcase} color="bg-blue-50 text-blue-600" sub="Completed interview profiles" />
              <StatCard label="Overall Conversion" value={`${overallConversion}%`} icon={Target} color="bg-purple-50 text-purple-600" sub="Applied → Hired rate" />
              <StatCard label="Avg. Time to Hire" value={avgTimeToHire > 0 ? `${avgTimeToHire}d` : '—'} icon={Clock} color="bg-amber-50 text-amber-600" sub="Days from first contact" />
            </div>

            {/* Funnel + Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Candidate Funnel */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Candidate Funnel</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Applied → Interviewed → Offered → Hired</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {funnelStages.map((stage, i) => (
                    <FunnelRow key={stage.name} stage={stage} prev={i > 0 ? funnelStages[i - 1] : undefined} />
                  ))}
                </div>
                <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Overall conversion</span>
                  <span className={`text-sm font-bold ${overallConversion >= 20 ? 'text-green-600' : overallConversion >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                    {overallConversion}%
                  </span>
                </div>
              </div>

              {/* Score Distribution */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="mb-5">
                  <h2 className="text-base font-bold text-gray-900">Interview Score Distribution</h2>
                  <p className="text-xs text-gray-500 mt-0.5">How candidates are rated after interviews</p>
                </div>
                {scoreData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <Award className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">No scored interviews yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scoreData.map(d => {
                      const total = scoreData.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                      return (
                        <div key={d.name} className="flex items-center gap-3">
                          <span className="w-20 text-xs font-semibold text-gray-600 text-right">{d.name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: d.fill }}>
                              {pct > 10 && <span className="text-white text-[10px] font-bold">{d.value}</span>}
                            </div>
                          </div>
                          <span className="w-10 text-xs font-semibold text-gray-500">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Strong Hire', value: scoreMap.strong_yes + scoreMap.yes, color: 'text-green-600 bg-green-50' },
                      { label: 'Maybe', value: scoreMap.maybe, color: 'text-amber-600 bg-amber-50' },
                      { label: 'No Hire', value: scoreMap.no, color: 'text-red-600 bg-red-50' },
                    ].map(s => (
                      <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                        <p className="text-lg font-bold">{s.value}</p>
                        <p className="text-[10px] font-semibold mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <div className="mb-5">
                <h2 className="text-base font-bold text-gray-900">Monthly Hiring Trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">Applied vs. hired over the last 6 months</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyTrend} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="applied" name="Applied" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hired" name="Hired" fill="#1f2937" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-200" /><span className="text-xs text-gray-500">Applied</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-900" /><span className="text-xs text-gray-500">Hired</span></div>
              </div>
            </div>

            {/* By-Role Breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Performance by Role</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Funnel and conversion rates per open position</p>
                </div>
              </div>
              {roleMetrics.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <Briefcase className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">No role data yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Applied</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Interviewed</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Offered</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Hired</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversion</th>
                        <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Funnel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleMetrics.map((r) => (
                        <tr key={r.role} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.fill }} />
                              <span className="font-medium text-gray-800 text-xs">{r.role}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-semibold text-gray-700">{r.applied}</td>
                          <td className="py-3 px-2 text-center text-xs font-semibold text-gray-700">{r.interviewed}</td>
                          <td className="py-3 px-2 text-center text-xs font-semibold text-gray-700">{r.offered}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-xs font-bold ${r.hired > 0 ? 'text-green-600' : 'text-gray-400'}`}>{r.hired}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.conversionRate >= 20 ? 'bg-green-100 text-green-700' : r.conversionRate >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {r.conversionRate}%
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-0.5 justify-center">
                              {[r.applied, r.interviewed, r.offered, r.hired].map((v, j) => {
                                const max = Math.max(r.applied, 1);
                                const w = Math.max(Math.round((v / max) * 40), v > 0 ? 4 : 0);
                                return (
                                  <div key={j} className="h-4 rounded-sm" style={{ width: w, backgroundColor: FUNNEL_COLORS[j] }} title={['Applied', 'Interviewed', 'Offered', 'Hired'][j] + ': ' + v} />
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Empty state hint */}
            {totalApplied === 0 && totalInterviewed === 0 && (
              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">No hiring data yet</p>
                  <p className="text-xs text-blue-700 mt-1">Schedule interviews in the Interview Calendar and save candidate profiles after sessions to populate this dashboard.</p>
                  <div className="flex items-center gap-3 mt-3">
                    <Link href="/interview-calendar" className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                      Go to Calendar <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                    <Link href="/candidate-profiles" className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                      View Profiles <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
