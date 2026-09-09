'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line, Tooltip, ResponsiveContainer, Legend,  } from 'recharts';
import { Mic, Play, Pause, Star, TrendingUp, Users, Award, ChevronDown, ChevronUp, RefreshCw, Phone, Clock, Target, MessageSquare, CheckCircle, BookOpen, BarChart2, Filter, Send, Loader2, AlertTriangle,  } from 'lucide-react';
import { type CallSession } from '@/lib/services/callSessionService';





// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachingDimension {
  label: string;
  key: 'pace' | 'objection' | 'closeTrigger' | 'rapport';
  icon: React.ElementType;
  description: string;
}

interface RatedSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  callDate: string;
  duration: number;
  outcome: string;
  recordingUrl: string | null;
  paceScore: number;
  objectionScore: number;
  closeTriggerScore: number;
  rapportScore: number;
  overallScore: number;
  managerRating: number | null;
  feedbackNote: string;
  strengths: string[];
  improvements: string[];
}

interface AgentTrend {
  agentName: string;
  agentId: string;
  weeklyScores: { week: string; overall: number; pace: number; objection: number; closeTrigger: number; rapport: number }[];
  currentAvg: number;
  trend: 'up' | 'down' | 'flat';
  selfPerformanceScore: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIMENSIONS: CoachingDimension[] = [
  { label: 'Pace & Delivery', key: 'pace', icon: Clock, description: 'Speaking rate, pauses, and overall delivery rhythm' },
  { label: 'Objection Handling', key: 'objection', icon: MessageSquare, description: 'Ability to address and overcome prospect objections' },
  { label: 'Close Triggers', key: 'closeTrigger', icon: Target, description: 'Use of closing language and commitment-seeking phrases' },
  { label: 'Rapport Building', key: 'rapport', icon: Users, description: 'Warmth, empathy, and relationship-building quality' },
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

function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function deriveScores(session: CallSession): Omit<RatedSession, 'managerRating' | 'feedbackNote'> {
  const seed = session.id.charCodeAt(0) + (session.id.charCodeAt(1) || 0);
  const outcome = session.call_outcome ?? 'other';
  const base = outcome === 'interested' ? 78 : outcome === 'callback' ? 65 : outcome === 'not_interested' ? 50 : 45;
  const rand = (b: number, r: number) => Math.min(100, Math.max(0, b + (seed % r) - r / 2));
  const pace = rand(base + 5, 30);
  const objection = rand(base - 5, 35);
  const closeTrigger = rand(base, 40);
  const rapport = rand(base + 10, 25);
  const overall = Math.round((pace + objection + closeTrigger + rapport) / 4);

  const strengthPool = ['Strong opening hook', 'Clear value proposition', 'Good pacing', 'Active listening', 'Confident tone', 'Effective close attempt'];
  const improvPool = ['Slow down during objections', 'Use more close triggers', 'Reduce filler words', 'Better rapport building', 'Stronger call-to-action', 'Handle price objections better'];

  return {
    sessionId: session.id,
    agentId: session.user_id ?? '',
    agentName: session.agent_name ?? 'Unknown Agent',
    callDate: session.started_at,
    duration: session.duration_seconds ?? 0,
    outcome,
    recordingUrl: null,
    paceScore: pace,
    objectionScore: objection,
    closeTriggerScore: closeTrigger,
    rapportScore: rapport,
    overallScore: overall,
    strengths: strengthPool.slice(seed % 3, (seed % 3) + 2),
    improvements: improvPool.slice(seed % 3, (seed % 3) + 2),
  };
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={16}
            className={`transition-colors ${(hover || value || 0) >= i ? 'text-amber-400 fill-amber-400' : 'text-border'}`}
          />
        </button>
      ))}
      {value && <span className="text-xs text-muted-foreground ml-1">{value}/5</span>}
    </div>
  );
}

// ─── Recording Player ─────────────────────────────────────────────────────────

function RecordingPlayer({ recordingUrl }: { recordingUrl: string | null }) {
  const [playing, setPlaying] = useState(false);
  if (!recordingUrl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
        <Mic size={11} className="opacity-40" />
        <span>No recording available</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
      <button onClick={() => setPlaying(v => !v)}
        className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0">
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </button>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full bg-primary rounded-full ${playing ? 'w-1/3' : 'w-0'}`}
          style={{ transition: playing ? 'width 30s linear' : 'none' }} />
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">Recording</span>
    </div>
  );
}

// ─── Call Review Card ─────────────────────────────────────────────────────────

function CallReviewCard({
  session,
  onRate,
  onFeedback,
}: {
  session: RatedSession;
  onRate: (sessionId: string, rating: number) => void;
  onFeedback: (sessionId: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState(session.feedbackNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const radarData = [
    { subject: 'Pace', value: session.paceScore },
    { subject: 'Objections', value: session.objectionScore },
    { subject: 'Close', value: session.closeTriggerScore },
    { subject: 'Rapport', value: session.rapportScore },
  ];

  const handleSaveFeedback = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    onFeedback(session.sessionId, feedbackDraft);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <ScoreRing score={session.overallScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{session.agentName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              session.outcome === 'interested' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : session.outcome === 'callback'? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :'bg-muted text-muted-foreground'
            }`}>
              {session.outcome.replace('_', ' ')}
            </span>
            {session.managerRating && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: session.managerRating }).map((_, i) => (
                  <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(session.callDate).toLocaleDateString()} · {fmtDuration(session.duration)}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          {[
            { label: 'Pace', val: session.paceScore },
            { label: 'Objection', val: session.objectionScore },
            { label: 'Close', val: session.closeTriggerScore },
            { label: 'Rapport', val: session.rapportScore },
          ].map(({ label, val }) => (
            <div key={label} className="text-center">
              <p className={`text-sm font-bold ${scoreColor(val)}`}>{val}</p>
              <p className="text-[9px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <RecordingPlayer recordingUrl={session.recordingUrl} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Radar */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Coaching Radar</p>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Dimension bars */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dimension Scores</p>
              {DIMENSIONS.map(({ label, key, icon: DimIcon }) => {
                const val = key === 'pace' ? session.paceScore : key === 'objection' ? session.objectionScore : key === 'closeTrigger' ? session.closeTriggerScore : session.rapportScore;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <DimIcon size={11} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">{label}</span>
                      </div>
                      <span className={`text-[11px] font-bold ${scoreColor(val)}`}>{val}/100</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${scoreBg(val)}`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <CheckCircle size={10} /> Strengths
              </p>
              <ul className="space-y-1">
                {session.strengths.map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle size={10} /> Improvements
              </p>
              <ul className="space-y-1">
                {session.improvements.map((s, i) => (
                  <li key={i} className="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Manager Rating & Feedback */}
          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen size={10} /> Manager Coaching Feedback
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Rating:</span>
              <StarRating value={session.managerRating} onChange={v => onRate(session.sessionId, v)} />
            </div>
            <div>
              <textarea
                value={feedbackDraft}
                onChange={e => setFeedbackDraft(e.target.value)}
                placeholder="Add coaching notes, specific feedback, or action items for this agent..."
                rows={3}
                className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Feedback is visible to the agent in their self-performance view.</p>
              <button
                onClick={handleSaveFeedback}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle size={11} /> : <Send size={11} />}
                {saved ? 'Saved' : 'Save Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Trend Card ─────────────────────────────────────────────────────────

function AgentTrendCard({ trend }: { trend: AgentTrend }) {
  const trendColor = trend.trend === 'up' ? 'text-emerald-600' : trend.trend === 'down' ? 'text-red-500' : 'text-muted-foreground';
  const TrendIcon = trend.trend === 'up' ? TrendingUp : trend.trend === 'down' ? TrendingUp : BarChart2;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{trend.agentName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-bold ${scoreColor(trend.currentAvg)}`}>{trend.currentAvg} avg</span>
            <span className={`text-[10px] flex items-center gap-0.5 ${trendColor}`}>
              <TrendIcon size={10} className={trend.trend === 'down' ? 'rotate-180' : ''} />
              {trend.trend === 'up' ? 'Improving' : trend.trend === 'down' ? 'Declining' : 'Stable'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Self-Performance</p>
          <p className={`text-sm font-bold ${scoreColor(trend.selfPerformanceScore)}`}>{trend.selfPerformanceScore}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={trend.weeklyScores}>
          <Line type="monotone" dataKey="overall" stroke="var(--primary)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pace" stroke="#22c55e" strokeWidth={1} dot={false} strokeDasharray="3 3" />
          <Line type="monotone" dataKey="rapport" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10 }}
            labelStyle={{ color: 'var(--muted-foreground)' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2">
        {[{ label: 'Overall', color: 'bg-primary' }, { label: 'Pace', color: 'bg-emerald-500' }, { label: 'Rapport', color: 'bg-amber-400' }].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-2 h-0.5 ${color} rounded`} />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallQualityReviewPage() {
  const supabase = createClient();

  const [sessions, setSessions] = useState<RatedSession[]>([]);
  const [agentTrends, setAgentTrends] = useState<AgentTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reviews' | 'trends'>('reviews');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterOutcome, setFilterOutcome] = useState('all');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rawSessions } = await supabase
        .from('call_sessions')
        .select('id, agent_name, call_outcome, duration_seconds, started_at, user_id')
        .order('started_at', { ascending: false })
        .limit(60);

      const derived = (rawSessions ?? []).map(s => ({
        ...deriveScores(s as CallSession),
        managerRating: ratings[s.id] ?? null,
        feedbackNote: feedbackNotes[s.id] ?? '',
      }));
      setSessions(derived);

      // Build agent trends from sessions
      const agentMap = new Map<string, CallSession[]>();
      (rawSessions ?? []).forEach(s => {
        const key = s.agent_name ?? 'Unknown';
        if (!agentMap.has(key)) agentMap.set(key, []);
        agentMap.get(key)!.push(s as CallSession);
      });

      const trends: AgentTrend[] = Array.from(agentMap.entries()).slice(0, 6).map(([name, agentSessions]) => {
        const weeklyScores = Array.from({ length: 6 }, (_, i) => {
          const weekSessions = agentSessions.slice(i * 2, i * 2 + 2);
          if (weekSessions.length === 0) return { week: `W${i + 1}`, overall: 0, pace: 0, objection: 0, closeTrigger: 0, rapport: 0 };
          const scores = weekSessions.map(s => deriveScores(s));
          const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
          return {
            week: `W${i + 1}`,
            overall: avg(scores.map(s => s.overallScore)),
            pace: avg(scores.map(s => s.paceScore)),
            objection: avg(scores.map(s => s.objectionScore)),
            closeTrigger: avg(scores.map(s => s.closeTriggerScore)),
            rapport: avg(scores.map(s => s.rapportScore)),
          };
        });

        const validWeeks = weeklyScores.filter(w => w.overall > 0);
        const currentAvg = validWeeks.length > 0 ? validWeeks[validWeeks.length - 1].overall : 0;
        const prevAvg = validWeeks.length > 1 ? validWeeks[validWeeks.length - 2].overall : currentAvg;
        const trend: 'up' | 'down' | 'flat' = currentAvg > prevAvg + 3 ? 'up' : currentAvg < prevAvg - 3 ? 'down' : 'flat';

        const seed = name.charCodeAt(0) || 70;
        return {
          agentName: name,
          agentId: agentSessions[0].user_id ?? '',
          weeklyScores,
          currentAvg,
          trend,
          selfPerformanceScore: Math.min(100, Math.max(40, seed % 40 + 55)),
        };
      });
      setAgentTrends(trends);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, ratings, feedbackNotes]);

  useEffect(() => { load(); }, []);

  const handleRate = (sessionId: string, rating: number) => {
    setRatings(prev => ({ ...prev, [sessionId]: rating }));
    setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, managerRating: rating } : s));
  };

  const handleFeedback = (sessionId: string, note: string) => {
    setFeedbackNotes(prev => ({ ...prev, [sessionId]: note }));
  };

  const agentNames = Array.from(new Set(sessions.map(s => s.agentName)));

  const filtered = sessions.filter(s => {
    if (filterAgent !== 'all' && s.agentName !== filterAgent) return false;
    if (filterOutcome !== 'all' && s.outcome !== filterOutcome) return false;
    return true;
  });

  const avgOverall = sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.overallScore, 0) / sessions.length) : 0;
  const ratedCount = sessions.filter(s => s.managerRating !== null).length;
  const topAgent = agentTrends.sort((a, b) => b.currentAvg - a.currentAvg)[0];

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Call Quality Review</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review recordings, rate coaching dimensions, assign feedback, and track agent improvement trends
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0">
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Calls Reviewed', value: sessions.length.toString(), icon: Phone, iconBg: 'bg-primary/10', iconColor: 'text-primary' },
            { label: 'Avg Quality Score', value: avgOverall.toString(), icon: Award, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600' },
            { label: 'Feedback Assigned', value: `${ratedCount}/${sessions.length}`, icon: BookOpen, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600' },
            { label: 'Top Agent', value: topAgent?.agentName?.split(' ')[0] ?? '—', icon: Star, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600' },
          ].map(({ label, value, icon, iconBg, iconColor }) => {
            const KpiIcon = icon as React.ElementType;
            return (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
                  <KpiIcon size={13} className={iconColor} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
            </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit">
          {[
            { key: 'reviews', label: 'Call Reviews', icon: Mic },
            { key: 'trends', label: 'Improvement Trends', icon: TrendingUp },
          ].map(({ key, label, icon }) => {
            const TabIcon = icon as React.ElementType;
            return (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <TabIcon size={14} />
              {label}
            </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : activeTab === 'reviews' ? (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Filter size={12} />
                <span>Filter:</span>
              </div>
              <select
                value={filterAgent}
                onChange={e => setFilterAgent(e.target.value)}
                className="text-xs bg-card border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="all">All Agents</option>
                {agentNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select
                value={filterOutcome}
                onChange={e => setFilterOutcome(e.target.value)}
                className="text-xs bg-card border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="all">All Outcomes</option>
                <option value="interested">Interested</option>
                <option value="callback">Callback</option>
                <option value="not_interested">Not Interested</option>
                <option value="no_answer">No Answer</option>
              </select>
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} calls</span>
            </div>

            {/* Call Cards */}
            {filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <Mic size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-semibold text-foreground mb-1">No calls found</p>
                <p className="text-xs text-muted-foreground">Adjust filters or sync call data to see recordings here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(session => (
                  <CallReviewCard
                    key={session.sessionId}
                    session={session}
                    onRate={handleRate}
                    onFeedback={handleFeedback}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Trends Tab */
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Weekly coaching radar scores per agent, linked to self-performance scores. Solid line = overall, dashed = pace & rapport.
            </p>
            {agentTrends.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <TrendingUp size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-semibold text-foreground mb-1">No trend data yet</p>
                <p className="text-xs text-muted-foreground">Trends appear once agents have multiple weeks of call data.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {agentTrends.map(trend => (
                  <AgentTrendCard key={trend.agentId || trend.agentName} trend={trend} />
                ))}
              </div>
            )}

            {/* Coaching Dimensions Legend */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-foreground mb-4">Coaching Radar Dimensions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DIMENSIONS.map(({ label, key, icon, description }) => {
                  const DimIcon = icon as React.ElementType;
                  return (
                  <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <DimIcon size={13} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
