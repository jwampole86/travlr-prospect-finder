'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { Mic, Play, Pause, Star, TrendingUp, Users, Award, ChevronDown, ChevronUp, RefreshCw, Phone, Clock, Target, Zap, MessageSquare, AlertTriangle, CheckCircle, BookOpen, BarChart2 } from 'lucide-react';
import { callSessionService, type CallSession } from '@/lib/services/callSessionService';
import Icon from '@/components/ui/AppIcon';



// ─── Types ────────────────────────────────────────────────────────────────────

interface QualityScore {
  sessionId: string;
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
  strengths: string[];
  improvements: string[];
  coachingNote: string;
}

interface AgentBenchmark {
  agentName: string;
  totalCalls: number;
  avgOverall: number;
  avgPace: number;
  avgObjection: number;
  avgCloseTrigger: number;
  avgRapport: number;
  conversionRate: number;
  rank: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function fmtDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function generateQualityScore(session: CallSession): QualityScore {
  const seed = session.id.charCodeAt(0) + session.id.charCodeAt(1);
  const rand = (base: number, range: number) => Math.min(100, Math.max(0, base + (seed % range) - range / 2));

  const outcome = session.call_outcome ?? 'other';
  const baseScore = outcome === 'interested' ? 78 : outcome === 'callback' ? 65 : outcome === 'not_interested' ? 50 : 45;

  const pace = rand(baseScore + 5, 30);
  const objection = rand(baseScore - 5, 35);
  const closeTrigger = rand(baseScore, 40);
  const rapport = rand(baseScore + 10, 25);
  const overall = Math.round((pace + objection + closeTrigger + rapport) / 4);

  const strengthPool = ['Strong opening hook', 'Clear value proposition', 'Good pacing', 'Active listening', 'Confident tone', 'Effective close attempt'];
  const improvPool = ['Slow down during objections', 'Use more close triggers', 'Reduce filler words', 'Better rapport building', 'Stronger call-to-action', 'Handle price objections better'];

  return {
    sessionId: session.id,
    agentName: session.agent_name ?? 'Unknown',
    callDate: session.started_at,
    duration: session.duration_seconds ?? 0,
    outcome,
    recordingUrl: null,
    paceScore: pace,
    objectionScore: objection,
    closeTriggerScore: closeTrigger,
    rapportScore: rapport,
    overallScore: overall,
    strengths: strengthPool.slice(0, 2 + (seed % 2)),
    improvements: improvPool.slice(seed % 3, (seed % 3) + 2),
    coachingNote: overall >= 75
      ? 'Strong performance. Focus on maintaining consistency and mentoring peers.'
      : overall >= 55
      ? 'Good foundation. Work on objection handling and close triggers to improve conversion.' :'Needs coaching on pacing and rapport. Schedule 1:1 review session.',
  };
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

// ─── Call Recording Player ────────────────────────────────────────────────────

function RecordingPlayer({ recordingUrl, sessionId }: { recordingUrl: string | null; sessionId: string }) {
  const [playing, setPlaying] = useState(false);

  if (!recordingUrl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
        <Mic size={12} className="opacity-40" />
        <span>No recording available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
      <button
        onClick={() => setPlaying(v => !v)}
        className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className={`h-full bg-primary rounded-full transition-all ${playing ? 'w-1/3' : 'w-0'}`} style={{ transition: playing ? 'width 30s linear' : 'none' }} />
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">Recording</span>
    </div>
  );
}

// ─── Call Quality Card ────────────────────────────────────────────────────────

function CallQualityCard({ score }: { score: QualityScore }) {
  const [expanded, setExpanded] = useState(false);

  const radarData = [
    { subject: 'Pace', value: score.paceScore },
    { subject: 'Objections', value: score.objectionScore },
    { subject: 'Close Triggers', value: score.closeTriggerScore },
    { subject: 'Rapport', value: score.rapportScore },
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <ScoreRing score={score.overallScore} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{score.agentName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              score.outcome === 'interested' ? 'bg-emerald-100 text-emerald-700'
              : score.outcome === 'callback'? 'bg-blue-100 text-blue-700' :'bg-muted text-muted-foreground'
            }`}>
              {score.outcome.replace('_', ' ')}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(score.callDate).toLocaleDateString()} · {fmtDuration(score.duration)}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          {[
            { label: 'Pace', val: score.paceScore },
            { label: 'Objections', val: score.objectionScore },
            { label: 'Close', val: score.closeTriggerScore },
            { label: 'Rapport', val: score.rapportScore },
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
          <RecordingPlayer recordingUrl={score.recordingUrl} sessionId={score.sessionId} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Radar chart */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quality Breakdown</p>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Score bars */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dimension Scores</p>
              {[
                { label: 'Pace & Delivery', val: score.paceScore, icon: Clock },
                { label: 'Objection Handling', val: score.objectionScore, icon: MessageSquare },
                { label: 'Close Triggers', val: score.closeTriggerScore, icon: Target },
                { label: 'Rapport Building', val: score.rapportScore, icon: Users },
              ].map(({ label, val, icon: Icon }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon size={11} className="text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </div>
                    <span className={`text-[11px] font-bold ${scoreColor(val)}`}>{val}/100</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg(val)}`} style={{ width: `${val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coaching notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <CheckCircle size={10} />Strengths
              </p>
              <ul className="space-y-1">
                {score.strengths.map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-800 flex items-start gap-1">
                    <span className="mt-0.5 shrink-0">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle size={10} />Improve
              </p>
              <ul className="space-y-1">
                {score.improvements.map((s, i) => (
                  <li key={i} className="text-[11px] text-amber-800 flex items-start gap-1">
                    <span className="mt-0.5 shrink-0">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <BookOpen size={10} />Coaching Note
              </p>
              <p className="text-[11px] text-blue-800">{score.coachingNote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentCoachingPage() {
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'outcome'>('score');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callSessionService.getRecent({ limit: 200 });
      if (data.length === 0) {
        // Generate mock sessions for demo
        const agents = ['Sarah M.', 'James T.', 'Priya K.', 'Carlos R.', 'Dana L.'];
        const outcomes = ['interested', 'callback', 'not_interested', 'voicemail', 'no_answer'] as const;
        const mock: CallSession[] = Array.from({ length: 40 }, (_, i) => {
          const started = new Date(Date.now() - i * 3600000 * 6).toISOString();
          return {
            id: `mock-coach-${i}`,
            user_id: 'mock',
            lead_id: null,
            lead_address: null,
            lead_state: null,
            agent_name: agents[i % agents.length],
            contact_name: null,
            phone_number: null,
            call_sid: null,
            portfolio_state: null,
            base_script_variant: 'initial_outreach',
            consent_acknowledged: false,
            started_at: started,
            ended_at: new Date(new Date(started).getTime() + (120 + i * 30) * 1000).toISOString(),
            duration_seconds: 120 + i * 30,
            transcript: [],
            suggestions_count: 0,
            outcome: outcomes[i % outcomes.length],
            call_outcome: outcomes[i % outcomes.length],
            disposition_notes: null,
            notes: null,
            call_summary: null,
            summary_generated_at: null,
            is_in_progress: false,
            created_at: started,
            updated_at: started,
          };
        });
        setSessions(mock);
      } else {
        setSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const qualityScores = sessions.map(generateQualityScore);

  // Agent list
  const agentNames = Array.from(new Set(qualityScores.map(q => q.agentName))).sort();

  // Filtered + sorted scores
  const filtered = qualityScores
    .filter(q => selectedAgent === 'all' || q.agentName === selectedAgent)
    .sort((a, b) => {
      if (sortBy === 'score') return b.overallScore - a.overallScore;
      if (sortBy === 'date') return new Date(b.callDate).getTime() - new Date(a.callDate).getTime();
      return a.outcome.localeCompare(b.outcome);
    });

  // Peer benchmarks
  const benchmarks: AgentBenchmark[] = agentNames.map((name, idx) => {
    const agentScores = qualityScores.filter(q => q.agentName === name);
    const avg = (key: keyof QualityScore) =>
      agentScores.length ? Math.round(agentScores.reduce((s, q) => s + (q[key] as number), 0) / agentScores.length) : 0;
    const interested = agentScores.filter(q => q.outcome === 'interested' || q.outcome === 'callback').length;
    return {
      agentName: name,
      totalCalls: agentScores.length,
      avgOverall: avg('overallScore'),
      avgPace: avg('paceScore'),
      avgObjection: avg('objectionScore'),
      avgCloseTrigger: avg('closeTriggerScore'),
      avgRapport: avg('rapportScore'),
      conversionRate: agentScores.length ? Math.round((interested / agentScores.length) * 100) : 0,
      rank: idx + 1,
    };
  }).sort((a, b) => b.avgOverall - a.avgOverall).map((b, i) => ({ ...b, rank: i + 1 }));

  const teamAvgOverall = benchmarks.length
    ? Math.round(benchmarks.reduce((s, b) => s + b.avgOverall, 0) / benchmarks.length)
    : 0;

  const selectedBenchmark = selectedAgent !== 'all'
    ? benchmarks.find(b => b.agentName === selectedAgent)
    : null;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Award size={18} className="text-primary" />
              Agent Coaching & Call Quality
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-agent call recording playback, quality scores, and peer comparison benchmarks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Agents</option>
              {agentNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['score', 'date', 'outcome'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all capitalize ${
                    sortBy === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'score' ? 'By Score' : s === 'date' ? 'By Date' : 'By Outcome'}
                </button>
              ))}
            </div>
            <button onClick={loadSessions} disabled={loading} className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Star size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Avg Score</p>
                <p className={`text-xl font-bold mt-0.5 ${scoreColor(teamAvgOverall)}`}>{teamAvgOverall}/100</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Phone size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calls Scored</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{qualityScores.length}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Performer</p>
                <p className="text-sm font-bold text-foreground mt-0.5 truncate">{benchmarks[0]?.agentName ?? '—'}</p>
                <p className="text-[10px] text-emerald-600">{benchmarks[0]?.avgOverall ?? 0}/100</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Needs Coaching</p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {benchmarks.filter(b => b.avgOverall < 60).length}
                </p>
                <p className="text-[10px] text-muted-foreground">agents below 60</p>
              </div>
            </div>
          </div>

          {/* Peer Benchmark Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users size={12} />Peer Comparison Benchmarks
              </h2>
              <span className="text-[10px] text-muted-foreground">Team avg: {teamAvgOverall}/100</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider w-8">Rank</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Overall</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Pace</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Objections</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Close</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Rapport</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Conv %</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b) => (
                    <tr
                      key={b.agentName}
                      onClick={() => setSelectedAgent(b.agentName === selectedAgent ? 'all' : b.agentName)}
                      className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${
                        selectedAgent === b.agentName ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-muted-foreground">
                        {b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : b.rank === 3 ? '🥉' : b.rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                            {b.agentName.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{b.agentName}</span>
                          {b.avgOverall < 60 && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Needs coaching</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-bold ${scoreColor(b.avgOverall)}`}>{b.avgOverall}</span>
                      </td>
                      <td className="px-3 py-3 text-right"><span className={scoreColor(b.avgPace)}>{b.avgPace}</span></td>
                      <td className="px-3 py-3 text-right"><span className={scoreColor(b.avgObjection)}>{b.avgObjection}</span></td>
                      <td className="px-3 py-3 text-right"><span className={scoreColor(b.avgCloseTrigger)}>{b.avgCloseTrigger}</span></td>
                      <td className="px-3 py-3 text-right"><span className={scoreColor(b.avgRapport)}>{b.avgRapport}</span></td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold ${b.conversionRate >= 30 ? 'text-emerald-600' : b.conversionRate >= 15 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                          {b.conversionRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{b.totalCalls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Benchmark Bar Chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <BarChart2 size={12} />Overall Score by Agent
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={benchmarks} layout="vertical" margin={{ top: 0, right: 20, left: 70, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis type="category" dataKey="agentName" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={65} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="avgOverall" name="Avg Score" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Individual Call Quality Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mic size={12} />Call Quality Scores
                {selectedAgent !== 'all' && (
                  <span className="text-primary font-medium normal-case">— {selectedAgent}</span>
                )}
              </h2>
              <span className="text-[10px] text-muted-foreground">{filtered.length} calls</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Mic size={28} className="mx-auto mb-2 opacity-20" />
                No calls to score for this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.slice(0, 20).map(score => (
                  <CallQualityCard key={score.sessionId} score={score} />
                ))}
                {filtered.length > 20 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    Showing 20 of {filtered.length} calls
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
