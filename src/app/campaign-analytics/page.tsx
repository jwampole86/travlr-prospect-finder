'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { usePortfolio, PORTFOLIOS } from '@/contexts/PortfolioContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { Mail, MessageSquare, RefreshCw, ArrowUp, ArrowDown, Minus, Activity, Zap, CheckCircle, XCircle, Reply, MousePointerClick, GitCompare, X, Trophy, Download, TrendingUp, DollarSign, Layers } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignMetric {
  label: string;
  emailSent: number;
  smsSent: number;
  emailReplies: number;
  smsReplies: number;
  emailBounces: number;
  smsBounces: number;
  conversions: number;
  replyRate: number;
  bounceRate: number;
  conversionRate: number;
}

interface SequenceRow {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'mixed';
  totalSent: number;
  replies: number;
  bounces: number;
  conversions: number;
  replyRate: number;
  bounceRate: number;
  conversionRate: number;
  activeEnrollments: number;
  portfolio: string;
  ctr: number;
  linkClicks: number;
  totalLinks: number;
  costPerContacted: number;
  funnelDepth: number;
}

interface AgentRow {
  id: string;
  name: string;
  emailSent: number;
  smsSent: number;
  replies: number;
  bounces: number;
  conversions: number;
  replyRate: number;
  bounceRate: number;
  conversionRate: number;
}

interface TimeSeriesPoint {
  date: string;
  emailSent: number;
  smsSent: number;
  replies: number;
  bounces: number;
  conversions: number;
}

type ViewMode = 'sequence' | 'agent' | 'portfolio';
type DateRange = '7d' | '30d' | '90d';

// ─── Mock data generators ─────────────────────────────────────────────────────

function generateSequences(portfolio: string): SequenceRow[] {
  const names = [
    'Initial Outreach', 'Follow-Up #1', 'Check-In / Re-Engage',
    'Proposal Introduction', 'Closing / Contract',
  ];
  return names.map((name, i) => {
    const sent = 80 + Math.floor(Math.random() * 200);
    const replies = Math.floor(sent * (0.08 + Math.random() * 0.18));
    const bounces = Math.floor(sent * (0.02 + Math.random() * 0.06));
    const conversions = Math.floor(replies * (0.1 + Math.random() * 0.2));
    const totalLinks = Math.floor(sent * (0.4 + Math.random() * 0.4));
    const linkClicks = Math.floor(totalLinks * (0.05 + Math.random() * 0.25));
    return {
      id: `seq-${i}`,
      name,
      type: i % 3 === 0 ? 'sms' : i % 3 === 1 ? 'email' : 'mixed',
      totalSent: sent,
      replies,
      bounces,
      conversions,
      replyRate: Math.round((replies / sent) * 100),
      bounceRate: Math.round((bounces / sent) * 100),
      conversionRate: Math.round((conversions / sent) * 100),
      activeEnrollments: 10 + Math.floor(Math.random() * 60),
      portfolio,
      totalLinks,
      linkClicks,
      ctr: totalLinks > 0 ? Math.round((linkClicks / totalLinks) * 100) : 0,
      costPerContacted: parseFloat((0.8 + Math.random() * 2.5).toFixed(2)),
      funnelDepth: 2 + Math.floor(Math.random() * 5),
    };
  });
}

function generateAgents(): AgentRow[] {
  const agents = ['Alex Rivera', 'Jordan Kim', 'Sam Torres', 'Casey Morgan', 'Taylor Reyes'];
  return agents.map((name, i) => {
    const email = 40 + Math.floor(Math.random() * 120);
    const sms = 30 + Math.floor(Math.random() * 100);
    const total = email + sms;
    const replies = Math.floor(total * (0.1 + Math.random() * 0.2));
    const bounces = Math.floor(total * (0.02 + Math.random() * 0.05));
    const conversions = Math.floor(replies * (0.12 + Math.random() * 0.18));
    return {
      id: `agent-${i}`,
      name,
      emailSent: email,
      smsSent: sms,
      replies,
      bounces,
      conversions,
      replyRate: Math.round((replies / total) * 100),
      bounceRate: Math.round((bounces / total) * 100),
      conversionRate: Math.round((conversions / total) * 100),
    };
  });
}

function generatePortfolioMetrics(): CampaignMetric[] {
  return PORTFOLIOS.map(p => {
    const emailSent = 100 + Math.floor(Math.random() * 300);
    const smsSent = 80 + Math.floor(Math.random() * 250);
    const total = emailSent + smsSent;
    const emailReplies = Math.floor(emailSent * (0.08 + Math.random() * 0.15));
    const smsReplies = Math.floor(smsSent * (0.12 + Math.random() * 0.2));
    const emailBounces = Math.floor(emailSent * (0.02 + Math.random() * 0.06));
    const smsBounces = Math.floor(smsSent * (0.01 + Math.random() * 0.03));
    const conversions = Math.floor((emailReplies + smsReplies) * (0.1 + Math.random() * 0.15));
    const totalReplies = emailReplies + smsReplies;
    const totalBounces = emailBounces + smsBounces;
    return {
      label: p.abbr,
      emailSent,
      smsSent,
      emailReplies,
      smsReplies,
      emailBounces,
      smsBounces,
      conversions,
      replyRate: Math.round((totalReplies / total) * 100),
      bounceRate: Math.round((totalBounces / total) * 100),
      conversionRate: Math.round((conversions / total) * 100),
    };
  });
}

function generateTimeSeries(days: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const emailSent = 8 + Math.floor(Math.random() * 30);
    const smsSent = 6 + Math.floor(Math.random() * 25);
    const total = emailSent + smsSent;
    points.push({
      date: dateStr,
      emailSent,
      smsSent,
      replies: Math.floor(total * (0.08 + Math.random() * 0.18)),
      bounces: Math.floor(total * (0.02 + Math.random() * 0.05)),
      conversions: Math.floor(total * (0.01 + Math.random() * 0.04)),
    });
  }
  return points;
}

// ─── Statistical confidence helper ───────────────────────────────────────────

function computeConfidence(n1: number, p1: number, n2: number, p2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const r1 = p1 / 100;
  const r2 = p2 / 100;
  const pooled = (r1 * n1 + r2 * n2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 50;
  const z = Math.abs(r1 - r2) / se;
  // Approximate normal CDF
  const conf = Math.min(99, Math.round(50 + 50 * Math.tanh(z * 0.7)));
  return conf;
}

// ─── Constants (moved before ComparisonModal) ─────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  sms: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  mixed: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
};

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6'];

// ─── Comparison Modal ─────────────────────────────────────────────────────────

interface ComparisonModalProps {
  sequences: SequenceRow[];
  onClose: () => void;
}

function ComparisonModal({ sequences, onClose }: ComparisonModalProps) {
  const [seqA, setSeqA] = useState<string>(sequences[0]?.id || '');
  const [seqB, setSeqB] = useState<string>(sequences[1]?.id || '');

  const a = sequences.find(s => s.id === seqA);
  const b = sequences.find(s => s.id === seqB);

  const metrics = a && b ? [
    {
      key: 'replyRate',
      label: 'Reply Rate',
      icon: Reply,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      aVal: a.replyRate,
      bVal: b.replyRate,
      unit: '%',
      higherBetter: true,
      confidence: computeConfidence(a.totalSent, a.replyRate, b.totalSent, b.replyRate),
    },
    {
      key: 'conversionRate',
      label: 'Conversion Rate',
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      aVal: a.conversionRate,
      bVal: b.conversionRate,
      unit: '%',
      higherBetter: true,
      confidence: computeConfidence(a.totalSent, a.conversionRate, b.totalSent, b.conversionRate),
    },
    {
      key: 'ctr',
      label: 'Link CTR',
      icon: MousePointerClick,
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
      aVal: a.ctr,
      bVal: b.ctr,
      unit: '%',
      higherBetter: true,
      confidence: computeConfidence(a.totalLinks, a.ctr, b.totalLinks, b.ctr),
    },
    {
      key: 'costPerContacted',
      label: 'Cost per Contacted',
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      aVal: a.costPerContacted,
      bVal: b.costPerContacted,
      unit: '$',
      prefix: true,
      higherBetter: false,
      confidence: 72,
    },
    {
      key: 'funnelDepth',
      label: 'Funnel Depth',
      icon: Layers,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      aVal: a.funnelDepth,
      bVal: b.funnelDepth,
      unit: ' steps',
      higherBetter: true,
      confidence: 65,
    },
  ] : [];

  const aWins = metrics.filter(m => m.higherBetter ? m.aVal > m.bVal : m.aVal < m.bVal).length;
  const bWins = metrics.filter(m => m.higherBetter ? m.bVal > m.aVal : m.bVal < m.aVal).length;
  const overallWinner = aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'tie';

  const radarData = a && b ? [
    { metric: 'Reply', A: a.replyRate, B: b.replyRate },
    { metric: 'Conv.', A: a.conversionRate, B: b.conversionRate },
    { metric: 'CTR', A: a.ctr, B: b.ctr },
    { metric: 'Funnel', A: a.funnelDepth * 10, B: b.funnelDepth * 10 },
    { metric: 'Enrollments', A: Math.min(a.activeEnrollments, 100), B: Math.min(b.activeEnrollments, 100) },
  ] : [];

  function handleExport() {
    if (!a || !b) return;
    const rows = [
      ['Metric', a.name, b.name, 'Winner', 'Confidence'],
      ...metrics.map(m => {
        const winner = m.higherBetter
          ? (m.aVal > m.bVal ? a.name : m.bVal > m.aVal ? b.name : 'Tie')
          : (m.aVal < m.bVal ? a.name : m.bVal < m.aVal ? b.name : 'Tie');
        return [m.label, `${m.prefix ? '$' : ''}${m.aVal}${m.prefix ? '' : m.unit}`, `${m.prefix ? '$' : ''}${m.bVal}${m.prefix ? '' : m.unit}`, winner, `${m.confidence}%`];
      }),
      [],
      ['Overall Winner', overallWinner === 'A' ? a.name : overallWinner === 'B' ? b.name : 'Tie'],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sequence-comparison-${a.name.replace(/\s+/g, '-')}-vs-${b.name.replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitCompare size={15} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Sequence Comparison</h2>
              <p className="text-[11px] text-muted-foreground">Side-by-side performance analysis with statistical confidence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors"
            >
              <Download size={12} />
              Export Report
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Sequence selectors */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Sequence A', value: seqA, onChange: setSeqA, accent: 'border-blue-500/40 bg-blue-500/5' },
              { label: 'Sequence B', value: seqB, onChange: setSeqB, accent: 'border-violet-500/40 bg-violet-500/5' },
            ].map(({ label, value, onChange, accent }) => (
              <div key={label} className={`rounded-xl border-2 ${accent} p-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
                <select
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-foreground outline-none cursor-pointer"
                >
                  {sequences.map(s => (
                    <option key={s.id} value={s.id} className="bg-card">{s.name}</option>
                  ))}
                </select>
                {sequences.find(s => s.id === value) && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize border ${TYPE_COLORS[sequences.find(s => s.id === value)!.type]}`}>
                      {sequences.find(s => s.id === value)!.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{sequences.find(s => s.id === value)!.totalSent.toLocaleString()} sent</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Overall winner banner */}
          {a && b && overallWinner !== 'tie' && (
            <div className={`rounded-xl border p-3 flex items-center gap-3 ${overallWinner === 'A' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-violet-500/10 border-violet-500/30'}`}>
              <Trophy size={18} className={overallWinner === 'A' ? 'text-blue-500' : 'text-violet-500'} />
              <div>
                <p className="text-sm font-bold text-foreground">
                  {overallWinner === 'A' ? a.name : b.name} wins overall
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {Math.max(aWins, bWins)} of {metrics.length} metrics · {aWins} vs {bWins} metric wins
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[10px] text-muted-foreground">Avg. confidence</p>
                <p className="text-sm font-bold text-foreground">
                  {Math.round(metrics.reduce((s, m) => s + m.confidence, 0) / metrics.length)}%
                </p>
              </div>
            </div>
          )}

          {/* Metric rows */}
          {a && b && (
            <div className="space-y-3">
              {metrics.map(m => {
                const aWins = m.higherBetter ? m.aVal > m.bVal : m.aVal < m.bVal;
                const bWins = m.higherBetter ? m.bVal > m.aVal : m.bVal < m.aVal;
                const maxVal = Math.max(m.aVal, m.bVal) || 1;
                const MIcon = m.icon;
                return (
                  <div key={m.key} className="bg-muted/30 rounded-xl p-4 border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-6 h-6 rounded-md ${m.bg} flex items-center justify-center`}>
                        <MIcon size={12} className={m.color} />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{m.label}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Confidence:</span>
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${m.confidence >= 90 ? 'bg-emerald-500' : m.confidence >= 75 ? 'bg-amber-500' : 'bg-red-400'}`}
                              style={{ width: `${m.confidence}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold ${m.confidence >= 90 ? 'text-emerald-500' : m.confidence >= 75 ? 'text-amber-500' : 'text-red-400'}`}>
                            {m.confidence}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {/* A bar */}
                      <div className={`rounded-lg p-3 border ${aWins ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-muted/20'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold text-muted-foreground">{a.name}</span>
                          {aWins && <Trophy size={10} className="text-blue-500" />}
                        </div>
                        <p className="text-xl font-bold text-foreground mb-2">
                          {m.prefix ? '$' : ''}{m.aVal}{m.prefix ? '' : m.unit}
                        </p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(m.aVal / maxVal) * 100}%` }} />
                        </div>
                      </div>
                      {/* B bar */}
                      <div className={`rounded-lg p-3 border ${bWins ? 'border-violet-500/40 bg-violet-500/5' : 'border-border bg-muted/20'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold text-muted-foreground">{b.name}</span>
                          {bWins && <Trophy size={10} className="text-violet-500" />}
                        </div>
                        <p className="text-xl font-bold text-foreground mb-2">
                          {m.prefix ? '$' : ''}{m.bVal}{m.prefix ? '' : m.unit}
                        </p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(m.bVal / maxVal) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Radar chart */}
          {a && b && radarData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-xs font-semibold text-foreground mb-3">Performance Radar</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Radar name={a.name} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name={b.name} dataKey="B" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={15} className={iconColor} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground leading-none mb-1">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend === 'up' && <ArrowUp size={10} className="text-emerald-500" />}
          {trend === 'down' && <ArrowDown size={10} className="text-red-500" />}
          {trend === 'neutral' && <Minus size={10} className="text-muted-foreground" />}
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        </div>
      )}
    </div>
  );
}

function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-foreground w-9 text-right">{value}%</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignAnalyticsPage() {
  const { selectedPortfolio } = usePortfolio();
  const [viewMode, setViewMode] = useState<ViewMode>('sequence');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showComparison, setShowComparison] = useState(false);

  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<CampaignMetric[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      setSequences(generateSequences(selectedPortfolio?.abbr || 'CO'));
      setAgents(generateAgents());
      setPortfolioMetrics(generatePortfolioMetrics());
      setTimeSeries(generateTimeSeries(days));
      setLastRefresh(new Date());
      setLoading(false);
    }, 600);
  }, [selectedPortfolio, dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregate KPIs
  const totalEmailSent = sequences.reduce((s, r) => s + Math.floor(r.totalSent * 0.55), 0);
  const totalSmsSent = sequences.reduce((s, r) => s + Math.floor(r.totalSent * 0.45), 0);
  const totalReplies = sequences.reduce((s, r) => s + r.replies, 0);
  const totalBounces = sequences.reduce((s, r) => s + r.bounces, 0);
  const totalConversions = sequences.reduce((s, r) => s + r.conversions, 0);
  const totalSent = totalEmailSent + totalSmsSent;
  const avgReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
  const avgBounceRate = totalSent > 0 ? Math.round((totalBounces / totalSent) * 100) : 0;
  const avgConvRate = totalSent > 0 ? Math.round((totalConversions / totalSent) * 100) : 0;
  const totalLinkClicks = sequences.reduce((s, r) => s + r.linkClicks, 0);
  const totalLinks = sequences.reduce((s, r) => s + r.totalLinks, 0);
  const avgCtr = totalLinks > 0 ? Math.round((totalLinkClicks / totalLinks) * 100) : 0;

  const pieData = [
    { name: 'Email', value: totalEmailSent },
    { name: 'SMS', value: totalSmsSent },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">Campaign Analytics</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time SMS &amp; email performance · {selectedPortfolio?.label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Compare button */}
            <button
              onClick={() => setShowComparison(true)}
              disabled={sequences.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <GitCompare size={12} />
              Compare Sequences
            </button>
            {/* Date range */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['7d', '30d', '90d'] as DateRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    dateRange === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {/* View mode */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['sequence', 'agent', 'portfolio'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                    viewMode === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <KPICard label="Email Sent" value={totalEmailSent.toLocaleString()} icon={Mail} iconBg="bg-blue-500/10" iconColor="text-blue-500" trend="up" sub="vs last period" />
            <KPICard label="SMS Sent" value={totalSmsSent.toLocaleString()} icon={MessageSquare} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" trend="up" sub="vs last period" />
            <KPICard label="Total Sends" value={totalSent.toLocaleString()} icon={Activity} iconBg="bg-violet-500/10" iconColor="text-violet-500" />
            <KPICard label="Replies" value={totalReplies.toLocaleString()} icon={Reply} iconBg="bg-sky-500/10" iconColor="text-sky-500" trend="up" sub={`${avgReplyRate}% reply rate`} />
            <KPICard label="Bounces" value={totalBounces.toLocaleString()} icon={XCircle} iconBg="bg-red-500/10" iconColor="text-red-500" trend="down" sub={`${avgBounceRate}% bounce rate`} />
            <KPICard label="Conversions" value={totalConversions.toLocaleString()} icon={CheckCircle} iconBg="bg-amber-500/10" iconColor="text-amber-500" trend="up" sub={`${avgConvRate}% conv. rate`} />
            <KPICard label="Link CTR" value={`${avgCtr}%`} icon={MousePointerClick} iconBg="bg-pink-500/10" iconColor="text-pink-500" trend="up" sub={`${totalLinkClicks} clicks / ${totalLinks} links`} />
            <KPICard label="Active Sequences" value={sequences.reduce((s, r) => s + r.activeEnrollments, 0).toLocaleString()} icon={Zap} iconBg="bg-orange-500/10" iconColor="text-orange-500" />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Time series */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Send Volume &amp; Replies Over Time</h3>
                <span className="text-[10px] text-muted-foreground">Last refreshed {lastRefresh.toLocaleTimeString()}</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(timeSeries.length / 6)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="emailSent" stroke="#6366f1" strokeWidth={2} dot={false} name="Email Sent" />
                  <Line type="monotone" dataKey="smsSent" stroke="#10b981" strokeWidth={2} dot={false} name="SMS Sent" />
                  <Line type="monotone" dataKey="replies" stroke="#f59e0b" strokeWidth={2} dot={false} name="Replies" />
                  <Line type="monotone" dataKey="conversions" stroke="#ef4444" strokeWidth={2} dot={false} name="Conversions" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Channel split */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Channel Split</h3>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={['#6366f1', '#10b981'][idx]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: ['#6366f1', '#10b981'][i] }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bounce/Reply bar chart by portfolio */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Reply &amp; Bounce Rates by Portfolio</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={portfolioMetrics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="replyRate" fill="#10b981" name="Reply Rate %" radius={[3, 3, 0, 0]} />
                <Bar dataKey="bounceRate" fill="#ef4444" name="Bounce Rate %" radius={[3, 3, 0, 0]} />
                <Bar dataKey="conversionRate" fill="#f59e0b" name="Conv. Rate %" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          {viewMode === 'sequence' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Sequence Performance</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{sequences.length} sequences</span>
                  <button
                    onClick={() => setShowComparison(true)}
                    disabled={sequences.length < 2}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-md text-[11px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
                  >
                    <GitCompare size={11} />
                    Compare
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Sequence</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Type</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Sent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Active</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-28">Reply Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-28">Bounce Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-28">Conv. Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-28">Link CTR</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Cost/Contact</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Funnel Depth</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequences.map((seq, i) => (
                      <tr key={seq.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-3 font-medium text-foreground">{seq.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${TYPE_COLORS[seq.type]}`}>
                            {seq.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{seq.totalSent.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{seq.activeEnrollments}</td>
                        <td className="px-4 py-3"><RateBar value={seq.replyRate} color="bg-emerald-500" /></td>
                        <td className="px-4 py-3"><RateBar value={seq.bounceRate} color="bg-red-500" /></td>
                        <td className="px-4 py-3"><RateBar value={seq.conversionRate} color="bg-amber-500" /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <RateBar value={seq.ctr} color="bg-pink-500" />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{seq.linkClicks}/{seq.totalLinks}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">${seq.costPerContacted}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{seq.funnelDepth} steps</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{seq.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === 'agent' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Agent Performance</h3>
                <span className="text-xs text-muted-foreground">{agents.length} agents</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Agent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Email Sent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">SMS Sent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Replies</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Bounces</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-32">Reply Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-32">Bounce Rate</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((ag, i) => (
                      <tr key={ag.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {ag.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="font-medium text-foreground">{ag.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{ag.emailSent}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{ag.smsSent}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{ag.replies}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{ag.bounces}</td>
                        <td className="px-4 py-3"><RateBar value={ag.replyRate} color="bg-emerald-500" /></td>
                        <td className="px-4 py-3"><RateBar value={ag.bounceRate} color="bg-red-500" /></td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{ag.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === 'portfolio' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Portfolio Performance</h3>
                <span className="text-xs text-muted-foreground">{portfolioMetrics.length} portfolios</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Portfolio</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Email Sent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">SMS Sent</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Replies</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Bounces</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-32">Reply Rate</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-32">Bounce Rate</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioMetrics.map((pm, i) => (
                      <tr key={pm.label} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-4 py-3 font-semibold text-foreground">{pm.label}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{pm.emailSent.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{pm.smsSent.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(pm.emailReplies + pm.smsReplies).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(pm.emailBounces + pm.smsBounces).toLocaleString()}</td>
                        <td className="px-4 py-3"><RateBar value={pm.replyRate} color="bg-emerald-500" /></td>
                        <td className="px-4 py-3"><RateBar value={pm.bounceRate} color="bg-red-500" /></td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{pm.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Modal */}
      {showComparison && sequences.length >= 2 && (
        <ComparisonModal sequences={sequences} onClose={() => setShowComparison(false)} />
      )}
    </AppLayout>
  );
}
