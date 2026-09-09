'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Trophy, Clock, Star, Brain, RefreshCw, ChevronDown, ChevronUp, Loader2, ArrowUp, ArrowDown, Minus, Sparkles, Copy, CheckCircle, Users, Target, Zap, Award } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentLeaderboardEntry {
  id: string;
  name: string;
  email: string;
  rank: number;
  conversionRate: number;
  avgDaysToClose: number;
  templateEffectiveness: number;
  totalLeads: number;
  closedLeads: number;
  topTemplates: string[];
  talkTrackSnippets: string[];
  trend: 'up' | 'down' | 'flat';
  badge: 'gold' | 'silver' | 'bronze' | null;
}

interface BestPractice {
  category: 'template' | 'talk_track' | 'timing' | 'approach';
  title: string;
  description: string;
  sourceAgent: string;
  impact: string;
  copied: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#3b82f6', '#8b5cf6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RankBadge({ badge, rank }: { badge: AgentLeaderboardEntry['badge']; rank: number }) {
  if (badge === 'gold') return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-bold text-sm"><Trophy size={16} /></span>;
  if (badge === 'silver') return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"><Award size={16} /></span>;
  if (badge === 'bronze') return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold text-sm"><Award size={16} /></span>;
  return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold text-sm">{rank}</span>;
}

function TrendIcon({ trend }: { trend: AgentLeaderboardEntry['trend'] }) {
  if (trend === 'up') return <ArrowUp size={14} className="text-emerald-500" />;
  if (trend === 'down') return <ArrowDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-muted-foreground" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentLeaderboardPage() {
  const supabase = createClient();
  const [agents, setAgents] = useState<AgentLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [bestPractices, setBestPractices] = useState<BestPractice[]>([]);
  const [extractingBP, setExtractingBP] = useState(false);
  const [sortBy, setSortBy] = useState<'conversionRate' | 'avgDaysToClose' | 'templateEffectiveness'>('conversionRate');
  const [copiedItems, setCopiedItems] = useState<Set<number>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, app_role, role')
        .in('app_role', ['agent', 'admin', 'owner']);

      if (!profiles || profiles.length === 0) {
        setAgents([]);
        return;
      }

      const [{ data: leads }, { data: outreach }] = await Promise.all([
        supabase.from('leads').select('primary_agent_id, stage, created_at, updated_at').not('primary_agent_id', 'is', null),
        supabase.from('outreach_history').select('agent_id, template_id, reply_detected, status'),
      ]);

      const entries: AgentLeaderboardEntry[] = profiles.map((p: any) => {
        const agentLeads = (leads ?? []).filter((l: any) => l.primary_agent_id === p.id);
        const totalLeads = agentLeads.length;
        const closed = agentLeads.filter((l: any) => l.stage === 'Live' || l.stage === 'Under Contract');
        const closedLeads = closed.length;
        const conversionRate = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 1000) / 10 : 0;

        const closeDurationsDays = closed
          .filter((l: any) => l.created_at && l.updated_at)
          .map((l: any) => (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000);
        const avgDaysToClose = closeDurationsDays.length > 0
          ? Math.round((closeDurationsDays.reduce((a: number, b: number) => a + b, 0) / closeDurationsDays.length) * 10) / 10
          : 0;

        const agentOutreach = (outreach ?? []).filter((o: any) => o.agent_id === p.id);
        const sent = agentOutreach.length;
        const replied = agentOutreach.filter((o: any) => o.reply_detected || o.status === 'replied').length;
        const templateEffectiveness = sent > 0 ? Math.round((replied / sent) * 100) : 0;

        const templateCounts: Record<string, number> = {};
        agentOutreach.forEach((o: any) => { if (o.template_id) templateCounts[o.template_id] = (templateCounts[o.template_id] || 0) + 1; });
        const topTemplates = Object.entries(templateCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);

        return {
          id: p.id,
          name: p.full_name || p.email || 'Agent',
          email: p.email || '',
          rank: 0,
          conversionRate,
          avgDaysToClose,
          templateEffectiveness,
          totalLeads,
          closedLeads,
          topTemplates,
          talkTrackSnippets: [],
          trend: 'flat' as const,
          badge: null,
        };
      });

      entries.sort((a, b) => b.conversionRate - a.conversionRate).forEach((e, i) => { e.rank = i + 1; });
      setAgents(entries);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const sortedAgents = [...agents].sort((a, b) => {
    if (sortBy === 'avgDaysToClose') return a.avgDaysToClose - b.avgDaysToClose;
    return (b[sortBy] as number) - (a[sortBy] as number);
  });

  const topPerformers = sortedAgents.slice(0, 3);

  const extractBestPractices = useCallback(async () => {
    setExtractingBP(true);
    setBestPractices([]);
    try {
      const topData = topPerformers.map(a => ({
        name: a.name,
        conversionRate: a.conversionRate,
        avgDaysToClose: a.avgDaysToClose,
        templateEffectiveness: a.templateEffectiveness,
        topTemplates: a.topTemplates,
        talkTrackSnippets: a.talkTrackSnippets,
      }));

      const prompt = `You are a sales performance coach analyzing top-performing real estate rental agents.

Here are the top 3 agents by conversion rate:
${JSON.stringify(topData, null, 2)}

Extract 5 concrete, actionable best practices from these top performers. For each best practice:
1. Identify the category (template, talk_track, timing, or approach)
2. Give it a short title (max 8 words)
3. Write a 1-2 sentence description of the practice
4. Note which agent it comes from
5. Estimate the impact (e.g., "+12% reply rate", "3 days faster close")

Return ONLY a JSON array with objects having keys: category, title, description, sourceAgent, impact.`;

      const response = await getChatCompletion(
        'OPEN_AI',
        'gpt-4o',
        [
          { role: 'system', content: 'You are a sales performance analyst. Always respond with valid JSON only, no markdown.' },
          { role: 'user', content: prompt },
        ],
        { max_completion_tokens: 1200 }
      );

      const content = response?.choices?.[0]?.message?.content || '[]';
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed: Omit<BestPractice, 'copied'>[] = JSON.parse(cleanContent);
      setBestPractices(parsed.map(p => ({ ...p, copied: false })));
      toast.success('Best practices extracted from top performers');
    } catch (err) {
      console.error('Best practices extraction error:', err);
      // Fallback best practices if AI extraction fails — generic guidance, not attributed to a specific agent.
      setBestPractices([
        { category: 'template', title: 'Lead with Revenue Estimate', description: 'Open outreach with a personalized revenue estimate. Homeowners tend to respond faster when they see potential earnings upfront.', sourceAgent: 'Team best practice', impact: 'Directional guidance', copied: false },
        { category: 'timing', title: 'Follow Up Within 48 Hours', description: 'Send proposal follow-ups within 48 hours of delivery to catch homeowners while the offer is still top of mind.', sourceAgent: 'Team best practice', impact: 'Directional guidance', copied: false },
      ]);
      toast.error('AI extraction unavailable — showing general guidance instead');
    } finally {
      setExtractingBP(false);
    }
  }, [topPerformers]);

  const handleCopy = (idx: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItems(prev => new Set(prev).add(idx));
      setTimeout(() => setCopiedItems(prev => { const s = new Set(prev); s.delete(idx); return s; }), 2000);
      toast.success('Copied to clipboard');
    });
  };

  const categoryColors: Record<string, string> = {
    template: 'bg-blue-100 text-blue-700',
    talk_track: 'bg-emerald-100 text-emerald-700',
    timing: 'bg-amber-100 text-amber-700',
    approach: 'bg-purple-100 text-purple-700',
  };

  const conversionChartData = sortedAgents.map(a => ({
    name: a.name.split(' ')[0],
    conversion: a.conversionRate,
    daysToClose: a.avgDaysToClose,
    effectiveness: a.templateEffectiveness,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Trophy size={24} className="text-amber-500" />
              Agent Leaderboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Conversion rate, days-to-close, template effectiveness — and AI-extracted winning strategies</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              <option value="conversionRate">Sort: Conversion Rate</option>
              <option value="avgDaysToClose">Sort: Days to Close</option>
              <option value="templateEffectiveness">Sort: Template Effectiveness</option>
            </select>
            <button
              onClick={loadData}
              className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Top Conversion Rate', value: `${topPerformers[0]?.conversionRate}%`, icon: <Target size={18} className="text-emerald-500" />, sub: topPerformers[0]?.name },
            { label: 'Fastest Close', value: `${topPerformers[0]?.avgDaysToClose}d`, icon: <Clock size={18} className="text-blue-500" />, sub: 'avg days to close' },
            { label: 'Best Template Score', value: `${topPerformers[0]?.templateEffectiveness}%`, icon: <Star size={18} className="text-amber-500" />, sub: 'effectiveness rating' },
            { label: 'Team Avg Conversion', value: `${agents.length > 0 ? (agents.reduce((s, a) => s + a.conversionRate, 0) / agents.length).toFixed(1) : '0.0'}%`, icon: <Users size={18} className="text-purple-500" />, sub: 'all agents' },
          ].map((kpi, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                {kpi.icon}
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Chart + Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Bar Chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Conversion Rate by Agent</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conversionChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 40]} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={52} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Conversion']} />
                <Bar dataKey="conversion" radius={[0, 4, 4, 0]}>
                  {conversionChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i] || '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Leaderboard Table */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Agent Rankings</h2>
            </div>
            <div className="divide-y divide-border">
              {sortedAgents.map((agent, idx) => (
                <div key={agent.id}>
                  <button
                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors text-left"
                    onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  >
                    <RankBadge badge={idx < 3 ? (['gold', 'silver', 'bronze'] as const)[idx] : null} rank={idx + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{agent.name}</span>
                        <TrendIcon trend={agent.trend} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-right">
                      <div>
                        <p className="text-sm font-semibold text-emerald-600">{agent.conversionRate}%</p>
                        <p className="text-xs text-muted-foreground">conversion</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-600">{agent.avgDaysToClose}d</p>
                        <p className="text-xs text-muted-foreground">to close</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-600">{agent.templateEffectiveness}%</p>
                        <p className="text-xs text-muted-foreground">template eff.</p>
                      </div>
                    </div>
                    {expandedAgent === agent.id ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
                  </button>

                  {expandedAgent === agent.id && (
                    <div className="px-5 pb-5 bg-muted/20 space-y-4">
                      {/* Mobile metrics */}
                      <div className="flex gap-4 md:hidden pt-2">
                        <div className="text-center"><p className="text-sm font-semibold text-emerald-600">{agent.conversionRate}%</p><p className="text-xs text-muted-foreground">conversion</p></div>
                        <div className="text-center"><p className="text-sm font-semibold text-blue-600">{agent.avgDaysToClose}d</p><p className="text-xs text-muted-foreground">to close</p></div>
                        <div className="text-center"><p className="text-sm font-semibold text-amber-600">{agent.templateEffectiveness}%</p><p className="text-xs text-muted-foreground">template eff.</p></div>
                      </div>

                      {/* Top Templates */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top Templates</p>
                        <div className="flex flex-wrap gap-2">
                          {agent.topTemplates.map((t, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">{t}</span>
                          ))}
                        </div>
                      </div>

                      {/* Talk Track Snippets */}
                      {agent.talkTrackSnippets.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Winning Talk Tracks</p>
                          <div className="space-y-2">
                            {agent.talkTrackSnippets.map((snippet, i) => (
                              <div key={i} className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <Zap size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-emerald-800 flex-1">{snippet}</p>
                                <button
                                  onClick={() => handleCopy(parseInt(agent.id.slice(1)) * 10 + i, snippet)}
                                  className="text-emerald-600 hover:text-emerald-800 shrink-0"
                                >
                                  {copiedItems.has(parseInt(agent.id.slice(1)) * 10 + i) ? <CheckCircle size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                        <span>{agent.totalLeads} total leads</span>
                        <span>·</span>
                        <span>{agent.closedLeads} closed</span>
                        <span>·</span>
                        <span>{((agent.totalLeads > 0 ? agent.closedLeads / agent.totalLeads : 0) * 100).toFixed(1)}% close rate</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Best Practices Extraction */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-purple-500" />
              <h2 className="text-sm font-semibold text-foreground">AI-Extracted Best Practices</h2>
              <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">from top 3 performers</span>
            </div>
            <button
              onClick={extractBestPractices}
              disabled={extractingBP}
              className="flex items-center gap-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
            >
              {extractingBP ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {extractingBP ? 'Extracting…' : bestPractices.length > 0 ? 'Re-Extract' : 'Extract Best Practices'}
            </button>
          </div>

          {bestPractices.length === 0 && !extractingBP && (
            <div className="px-5 py-12 text-center">
              <Brain size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">Click "Extract Best Practices" to use OpenAI to analyze top performers and surface winning templates, talk tracks, and strategies for the whole team.</p>
            </div>
          )}

          {extractingBP && (
            <div className="px-5 py-12 text-center">
              <Loader2 size={32} className="text-purple-500 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-muted-foreground">Analyzing top performer patterns with OpenAI…</p>
            </div>
          )}

          {bestPractices.length > 0 && !extractingBP && (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bestPractices.map((bp, i) => (
                <div key={i} className="border border-border rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 capitalize ${categoryColors[bp.category] || 'bg-muted text-muted-foreground'}`}>
                      {bp.category.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => handleCopy(i, `${bp.title}\n\n${bp.description}`)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedItems.has(i) ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{bp.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{bp.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{bp.sourceAgent}</span></span>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">{bp.impact}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
