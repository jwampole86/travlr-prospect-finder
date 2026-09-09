'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import AILeadQualificationPanel from '@/components/AILeadQualificationPanel';
import type { LeadQualificationSignals } from '@/components/AILeadQualificationPanel';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Brain, Target, Eye, MousePointerClick, MessageSquare, Clock, Flame, SlidersHorizontal, Info, Sparkles, Loader2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProspectWithMLScore {
  id: string;
  name: string;
  address: string;
  state?: string;
  stage: string;
  baseScore: number;
  engagementScore: number;
  mlConversionProb: number;
  blendedScore: number;
  opens: number;
  clicks: number;
  smsReplies: number;
  escalationVelocity: number;
  lastTouched: string;
  warmSignal: boolean;
  trend: 'rising' | 'cooling' | 'stable';
  cadenceStep: number;
  totalSteps: number;
  // Claude AI scoring
  aiScore?: number;
  aiConfidence?: number;
  aiReasoning?: string;
  aiPrioritySignal?: 'hot' | 'warm' | 'cold' | 'dead';
  aiRecommendedAction?: string;
  aiRiskFlags?: string[];
  aiScoreBreakdown?: {
    propertyPotential: number;
    regulatoryRisk: number;
    engagementSignal: number;
    contactRecency: number;
  };
  aiScoredAt?: string;
}

interface ModelWeights {
  baseScore: number;
  openRate: number;
  clickRate: number;
  smsReplyRate: number;
  escalationVelocity: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PROSPECTS: ProspectWithMLScore[] = [
  { id: 'p1', name: 'Jennifer Walsh', address: '1420 Larimer St, Denver CO', state: 'CO', stage: 'Interested', baseScore: 72, engagementScore: 88, mlConversionProb: 0.81, blendedScore: 84, opens: 5, clicks: 3, smsReplies: 2, escalationVelocity: 2, lastTouched: '2h ago', warmSignal: true, trend: 'rising', cadenceStep: 4, totalSteps: 7 },
  { id: 'p2', name: 'Robert Chen', address: '890 Blake St, Denver CO', state: 'CO', stage: 'Contacted', baseScore: 65, engagementScore: 79, mlConversionProb: 0.73, blendedScore: 71, opens: 4, clicks: 2, smsReplies: 1, escalationVelocity: 4, lastTouched: '1d ago', warmSignal: true, trend: 'rising', cadenceStep: 3, totalSteps: 7 },
  { id: 'p3', name: 'Maria Santos', address: '2201 Curtis St, Denver CO', state: 'CO', stage: 'Proposal Sent', baseScore: 81, engagementScore: 62, mlConversionProb: 0.68, blendedScore: 74, opens: 3, clicks: 1, smsReplies: 0, escalationVelocity: 7, lastTouched: '3d ago', warmSignal: false, trend: 'cooling', cadenceStep: 5, totalSteps: 7 },
  { id: 'p4', name: 'David Kim', address: '445 Grant St, Denver CO', state: 'CO', stage: 'New Lead', baseScore: 58, engagementScore: 91, mlConversionProb: 0.77, blendedScore: 73, opens: 6, clicks: 4, smsReplies: 3, escalationVelocity: 1, lastTouched: '30m ago', warmSignal: true, trend: 'rising', cadenceStep: 2, totalSteps: 7 },
  { id: 'p5', name: 'Lisa Thompson', address: '3300 Speer Blvd, Denver CO', state: 'CO', stage: 'Interested', baseScore: 74, engagementScore: 55, mlConversionProb: 0.52, blendedScore: 64, opens: 2, clicks: 0, smsReplies: 1, escalationVelocity: 12, lastTouched: '5d ago', warmSignal: false, trend: 'cooling', cadenceStep: 4, totalSteps: 7 },
  { id: 'p6', name: 'Ahmed Hassan', address: '1100 Colfax Ave, Denver CO', state: 'CO', stage: 'Contacted', baseScore: 44, engagementScore: 83, mlConversionProb: 0.71, blendedScore: 62, opens: 5, clicks: 3, smsReplies: 2, escalationVelocity: 3, lastTouched: '6h ago', warmSignal: true, trend: 'rising', cadenceStep: 3, totalSteps: 7 },
  { id: 'p7', name: 'Patricia Moore', address: '780 Downing St, Denver CO', state: 'CO', stage: 'New Lead', baseScore: 38, engagementScore: 29, mlConversionProb: 0.21, blendedScore: 33, opens: 1, clicks: 0, smsReplies: 0, escalationVelocity: 21, lastTouched: '2w ago', warmSignal: false, trend: 'stable', cadenceStep: 1, totalSteps: 7 },
  { id: 'p8', name: 'Kevin Park', address: '2050 York St, Denver CO', state: 'CO', stage: 'Proposal Sent', baseScore: 77, engagementScore: 41, mlConversionProb: 0.44, blendedScore: 60, opens: 2, clicks: 1, smsReplies: 0, escalationVelocity: 9, lastTouched: '4d ago', warmSignal: false, trend: 'cooling', cadenceStep: 6, totalSteps: 7 },
];

const DEFAULT_WEIGHTS: ModelWeights = {
  baseScore: 40,
  openRate: 20,
  clickRate: 20,
  smsReplyRate: 10,
  escalationVelocity: 10,
};

const TREND_COLORS = { rising: '#10b981', cooling: '#ef4444', stable: '#94a3b8' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">{value}</span>
    </div>
  );
}

function ProbBadge({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const color = pct >= 70 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${color}`}>{pct}%</span>;
}

function PrioritySignalBadge({ signal }: { signal?: string }) {
  if (!signal) return null;
  const styles: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 border-red-200',
    warm: 'bg-amber-100 text-amber-700 border-amber-200',
    cold: 'bg-blue-100 text-blue-700 border-blue-200',
    dead: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const icons: Record<string, string> = { hot: '🔥', warm: '☀️', cold: '❄️', dead: '💀' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[signal] || styles.cold}`}>
      {icons[signal]} {signal.charAt(0).toUpperCase() + signal.slice(1)}
    </span>
  );
}

// ─── Claude AI Score Panel ────────────────────────────────────────────────────

function ClaudeScorePanel({
  prospect,
  onScored,
}: {
  prospect: ProspectWithMLScore;
  onScored: (id: string, result: Partial<ProspectWithMLScore>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runAIScore = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/prospect-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: prospect.id,
          propertyDetails: {
            address: prospect.address,
            state: prospect.state || 'CO',
          },
          regulatoryContext: {
            state: prospect.state || 'CO',
            regulationComplexity: 'medium',
          },
          contactHistory: {
            emailOpens: prospect.opens,
            emailClicks: prospect.clicks,
            smsReplies: prospect.smsReplies,
            cadenceStep: prospect.cadenceStep,
            totalSteps: prospect.totalSteps,
            daysSinceFirstContact: prospect.escalationVelocity,
          },
          currentScore: prospect.baseScore,
          stage: prospect.stage,
        }),
      });

      if (!res.ok) throw new Error('Scoring request failed');
      const data = await res.json();

      onScored(prospect.id, {
        aiScore: data.aiScore,
        aiConfidence: data.confidence,
        aiReasoning: data.reasoning,
        aiPrioritySignal: data.prioritySignal,
        aiRecommendedAction: data.recommendedAction,
        aiRiskFlags: data.riskFlags,
        aiScoreBreakdown: data.scoreBreakdown,
        aiScoredAt: data.scoredAt,
      });
      setExpanded(true);
      toast.success(`Claude scored ${prospect.name}: ${data.aiScore}/100`);
    } catch (err) {
      toast.error('AI scoring failed — check API key');
    } finally {
      setLoading(false);
    }
  };

  const hasScore = prospect.aiScore !== undefined;

  return (
    <div className="mt-2">
      {!hasScore ? (
        <button
          onClick={runAIScore}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Analyzing…' : 'Score with Claude'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200">
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span className="text-xs font-bold text-purple-700">AI: {prospect.aiScore}</span>
              <span className="text-xs text-purple-500">({Math.round((prospect.aiConfidence || 0) * 100)}% conf.)</span>
            </div>
            <PrioritySignalBadge signal={prospect.aiPrioritySignal} />
            <button
              onClick={runAIScore}
              disabled={loading}
              className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Re-score"
            >
              <RefreshCw className={`w-3 h-3 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
            </button>
          </div>

          {expanded && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
              {prospect.aiReasoning && (
                <p className="text-xs text-purple-800 leading-relaxed">{prospect.aiReasoning}</p>
              )}
              {prospect.aiRecommendedAction && (
                <div className="flex items-start gap-1.5">
                  <Zap className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-semibold text-purple-700">{prospect.aiRecommendedAction}</p>
                </div>
              )}
              {prospect.aiRiskFlags && prospect.aiRiskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {prospect.aiRiskFlags.map((flag, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" />{flag}
                    </span>
                  ))}
                </div>
              )}
              {prospect.aiScoreBreakdown && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {Object.entries(prospect.aiScoreBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-purple-600 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-semibold text-purple-800">{v}/25</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Batch AI Scoring ─────────────────────────────────────────────────────────

function BatchAIScoringPanel({
  prospects,
  onBatchScored,
}: {
  prospects: ProspectWithMLScore[];
  onBatchScored: (results: Array<{ id: string; aiScore: number; aiPrioritySignal: string; aiReasoning: string }>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runBatch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/prospect-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchLeads: prospects.map(p => ({
            leadId: p.id,
            address: p.address,
            state: p.state || 'CO',
            currentScore: p.baseScore,
            stage: p.stage,
            totalCalls: p.cadenceStep,
            outcomes: {},
            regulationComplexity: 'medium',
            emailOpens: p.opens,
            smsReplies: p.smsReplies,
          })),
        }),
      });

      if (!res.ok) throw new Error('Batch scoring failed');
      const data = await res.json();

      if (data.results) {
        onBatchScored(data.results.map((r: { leadId: string; aiScore: number; prioritySignal: string; reasoning: string }) => ({
          id: r.leadId,
          aiScore: r.aiScore,
          aiPrioritySignal: r.prioritySignal,
          aiReasoning: r.reasoning,
        })));
        setLastRun(new Date().toLocaleTimeString());
        toast.success(`Claude scored ${data.results.length} prospects`);
      }
    } catch {
      toast.error('Batch AI scoring failed');
    } finally {
      setLoading(false);
    }
  };

  const scoredCount = prospects.filter(p => p.aiScore !== undefined).length;

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Claude AI Score Refinement</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Analyzes property details, regulatory complexity, and contact history beyond static rules
              {scoredCount > 0 && ` · ${scoredCount}/${prospects.length} scored`}
              {lastRun && ` · Last run ${lastRun}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scoredCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-100 px-2.5 py-1.5 rounded-lg">
              <CheckCircle className="w-3.5 h-3.5" />
              {scoredCount} AI-scored
            </div>
          )}
          <button
            onClick={runBatch}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Scoring all…' : `Score All ${prospects.length} Leads`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MLProspectScoringPage() {
  const [prospects, setProspects] = useState<ProspectWithMLScore[]>(MOCK_PROSPECTS);
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  const [filterWarm, setFilterWarm] = useState(false);
  const [sortBy, setSortBy] = useState<'blendedScore' | 'mlConversionProb' | 'engagementScore' | 'aiScore'>('blendedScore');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  const recalcBlended = useCallback((w: ModelWeights) => {
    setProspects(prev => prev.map(p => {
      const norm = {
        baseScore: p.baseScore,
        openRate: Math.min(100, p.opens * 15),
        clickRate: Math.min(100, p.clicks * 20),
        smsReplyRate: Math.min(100, p.smsReplies * 30),
        escalationVelocity: Math.max(0, 100 - p.escalationVelocity * 4),
      };
      const total = Object.keys(w).reduce((s, k) => s + (norm[k as keyof typeof norm] * w[k as keyof ModelWeights]) / 100, 0);
      return { ...p, blendedScore: Math.round(total) };
    }));
  }, []);

  const handleWeightChange = (key: keyof ModelWeights, val: number) => {
    const newW = { ...weights, [key]: val };
    setWeights(newW);
    recalcBlended(newW);
  };

  const handleProspectScored = useCallback((id: string, result: Partial<ProspectWithMLScore>) => {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...result } : p));
  }, []);

  const handleBatchScored = useCallback((results: Array<{ id: string; aiScore: number; aiPrioritySignal: string; aiReasoning: string }>) => {
    setProspects(prev => prev.map(p => {
      const r = results.find(r => r.id === p.id);
      if (!r) return p;
      return {
        ...p,
        aiScore: r.aiScore,
        aiPrioritySignal: r.aiPrioritySignal as ProspectWithMLScore['aiPrioritySignal'],
        aiReasoning: r.aiReasoning,
        aiScoredAt: new Date().toISOString(),
      };
    }));
  }, []);

  const sorted = [...prospects]
    .filter(p => !filterWarm || p.warmSignal)
    .sort((a, b) => {
      if (sortBy === 'aiScore') return (b.aiScore ?? -1) - (a.aiScore ?? -1);
      return (b[sortBy] as number) - (a[sortBy] as number);
    });

  const warmLeads = prospects.filter(p => p.warmSignal);
  const avgBlended = Math.round(prospects.reduce((s, p) => s + p.blendedScore, 0) / prospects.length);
  const avgMLProb = Math.round(prospects.reduce((s, p) => s + p.mlConversionProb, 0) / prospects.length * 100);
  const aiScoredCount = prospects.filter(p => p.aiScore !== undefined).length;
  const avgAIScore = aiScoredCount > 0
    ? Math.round(prospects.filter(p => p.aiScore !== undefined).reduce((s, p) => s + (p.aiScore || 0), 0) / aiScoredCount)
    : null;

  const scatterData = prospects.map(p => ({
    x: p.baseScore,
    y: Math.round(p.mlConversionProb * 100),
    name: p.name.split(' ')[0],
    blended: p.blendedScore,
    aiScore: p.aiScore,
    warm: p.warmSignal,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain size={24} className="text-blue-500" />
              ML Prospect Scoring
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Blends base prospect score with ML conversion probability and Claude AI analysis</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFilterWarm(!filterWarm)}
              className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border transition-colors ${filterWarm ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-border hover:bg-muted'}`}
            >
              <Flame size={14} />
              Warm Leads Only
            </button>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              <option value="blendedScore">Sort: Blended Score</option>
              <option value="mlConversionProb">Sort: ML Probability</option>
              <option value="engagementScore">Sort: Engagement</option>
              <option value="aiScore">Sort: AI Score</option>
            </select>
            <button
              onClick={() => setShowWeights(!showWeights)}
              className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
            >
              <SlidersHorizontal size={14} />
              Model Weights
            </button>
          </div>
        </div>

        {/* Claude AI Batch Scoring Panel */}
        <BatchAIScoringPanel prospects={prospects} onBatchScored={handleBatchScored} />

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Warm Leads Resurfaced', value: warmLeads.length, icon: <Flame size={18} className="text-amber-500" />, sub: 'ready to call now', color: 'text-amber-600' },
            { label: 'Avg Blended Score', value: avgBlended, icon: <Target size={18} className="text-blue-500" />, sub: 'base + engagement', color: 'text-blue-600' },
            { label: 'Avg ML Conv. Prob.', value: `${avgMLProb}%`, icon: <Brain size={18} className="text-purple-500" />, sub: 'from cadence patterns', color: 'text-purple-600' },
            {
              label: 'Avg AI Score',
              value: avgAIScore !== null ? avgAIScore : '—',
              icon: <Sparkles size={18} className="text-indigo-500" />,
              sub: aiScoredCount > 0 ? `${aiScoredCount} Claude-scored` : 'Run batch scoring',
              color: 'text-indigo-600',
            },
          ].map((kpi, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                {kpi.icon}
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Model Weights Panel */}
        {showWeights && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Blend Model Weights</h2>
                <span className={`text-xs rounded-full px-2 py-0.5 ${totalWeight === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  Total: {totalWeight}% {totalWeight !== 100 && '(must = 100)'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info size={12} />
                Adjust how much each signal contributes to the blended score
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {(Object.keys(weights) as (keyof ModelWeights)[]).map(key => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                    <span className="text-xs font-bold text-blue-600">{weights[key]}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={weights[key]}
                    onChange={e => handleWeightChange(key, parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scatter Chart + Warm Leads */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Base Score vs ML Probability</h2>
            <p className="text-xs text-muted-foreground mb-4">Dots above the diagonal are undervalued by base score alone</p>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" dataKey="x" name="Base Score" domain={[30, 90]} tick={{ fontSize: 11 }} label={{ value: 'Base Score', position: 'insideBottom', offset: -4, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="ML Prob %" domain={[10, 90]} tick={{ fontSize: 11 }} label={{ value: 'ML Prob %', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
                      <p className="font-semibold">{d.name}</p>
                      <p>Base: {d.x} · ML: {d.y}% · Blended: {d.blended}</p>
                      {d.aiScore !== undefined && <p className="text-purple-600 font-semibold">AI Score: {d.aiScore}</p>}
                    </div>
                  );
                }} />
                <Scatter data={scatterData} fill="#3b82f6">
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={d.warm ? '#f59e0b' : d.aiScore !== undefined ? '#8b5cf6' : '#3b82f6'} opacity={0.85} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Warm signal</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> AI-scored</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Standard</span>
            </div>
          </div>

          {/* Warm Leads Resurfaced */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Flame size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold text-foreground">Warm Leads — Call Before They Cool</h2>
            </div>
            <div className="divide-y divide-border">
              {warmLeads.sort((a, b) => b.blendedScore - a.blendedScore).map(p => (
                <div key={p.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.stage}</span>
                        <span className={`text-xs font-medium ${TREND_COLORS[p.trend] === '#10b981' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {p.trend === 'rising' ? '↑ Rising' : p.trend === 'cooling' ? '↓ Cooling' : '→ Stable'}
                        </span>
                        {p.aiPrioritySignal && <PrioritySignalBadge signal={p.aiPrioritySignal} />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye size={11} /> {p.opens} opens</span>
                        <span className="flex items-center gap-1"><MousePointerClick size={11} /> {p.clicks} clicks</span>
                        <span className="flex items-center gap-1"><MessageSquare size={11} /> {p.smsReplies} replies</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {p.lastTouched}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-muted-foreground">Blended</span>
                        <span className="text-sm font-bold text-foreground">{p.blendedScore}</span>
                      </div>
                      {p.aiScore !== undefined && (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-purple-500">AI</span>
                          <span className="text-sm font-bold text-purple-700">{p.aiScore}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-muted-foreground">ML Conv.</span>
                        <ProbBadge prob={p.mlConversionProb} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Full Prospect Table with per-row Claude scoring */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">All Prospects — Blended Score View</h2>
              {aiScoredCount > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {aiScoredCount} AI-scored
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{sorted.length} prospects</span>
          </div>
          <div className="divide-y divide-border">
            {sorted.map(p => (
              <div key={p.id} className={`px-5 py-4 hover:bg-muted/20 transition-colors ${p.warmSignal ? 'bg-amber-50/30' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {p.warmSignal && <Flame size={12} className="text-amber-500 shrink-0" />}
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.stage}</span>
                      <span className={`text-xs font-medium ${p.trend === 'rising' ? 'text-emerald-600' : p.trend === 'cooling' ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {p.trend === 'rising' ? '↑' : p.trend === 'cooling' ? '↓' : '→'} {p.trend}
                      </span>
                      {p.aiPrioritySignal && <PrioritySignalBadge signal={p.aiPrioritySignal} />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">{p.address}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Eye size={11} />{p.opens}</span>
                      <span className="flex items-center gap-1"><MousePointerClick size={11} />{p.clicks}</span>
                      <span className="flex items-center gap-1"><MessageSquare size={11} />{p.smsReplies}</span>
                      <span className="text-muted-foreground">Step {p.cadenceStep}/{p.totalSteps}</span>
                    </div>
                    {/* Per-row Claude scoring */}
                    <ClaudeScorePanel prospect={p} onScored={handleProspectScored} />
                    {/* AI Lead Qualification */}
                    <AILeadQualificationPanel
                      variant="compact"
                      signals={{
                        leadId: p.id,
                        propertyProfile: {
                          address: p.address,
                          state: p.state || 'CO',
                        },
                        responsePatterns: {
                          emailOpens: p.opens,
                          emailClicks: p.clicks,
                          smsReplies: p.smsReplies,
                          cadenceStep: p.cadenceStep,
                          totalCadenceSteps: p.totalSteps,
                          daysSinceLastContact: p.escalationVelocity,
                        },
                        currentStage: p.stage,
                        currentScore: p.baseScore,
                      } as LeadQualificationSignals}
                    />
                  </div>
                  <div className="text-right shrink-0 space-y-2 min-w-[80px]">
                    <div>
                      <p className="text-xs text-muted-foreground">Base</p>
                      <p className="text-sm font-semibold text-foreground">{p.baseScore}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Blended</p>
                      <p className={`text-sm font-bold ${p.blendedScore >= 70 ? 'text-emerald-600' : p.blendedScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {p.blendedScore}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ML</p>
                      <ProbBadge prob={p.mlConversionProb} />
                    </div>
                    {p.aiScore !== undefined && (
                      <div>
                        <p className="text-xs text-purple-500">AI</p>
                        <p className="text-sm font-bold text-purple-700">{p.aiScore}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
