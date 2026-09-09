'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import {
  Mail, MessageSquare, TrendingUp, Clock, BarChart2, Star,
  RefreshCw, ArrowUp, ArrowDown, Minus, Eye, Reply, XCircle,
  Zap, Trophy, Target, ChevronRight, Phone, Filter, Globe
} from 'lucide-react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


interface AgentStats {
  sentCount: number;
  replyRate: number;
  bounceRate: number;
  avgResponseTimeHours: number;
  emailSent: number;
  smsSent: number;
  openRate: number;
  repliedCount: number;
  bouncedCount: number;
}

interface TemplatePerf {
  id: string;
  name: string;
  subject: string;
  category: string;
  sends: number;
  opens: number;
  replies: number;
  openRate: number;
  replyRate: number;
  engagementScore: number;
}

interface PortfolioBreakdown {
  key: string;
  label: string;
  abbr: string;
  color: string;
  stateCode: string;
  emailSent: number;
  callsMade: number;
  opens: number;
  openRate: number;
  responses: number;
  responseRate: number;
  conversions: number;
  conversionRate: number;
  closed: number;
  closeRate: number;
}

function StatCard({
  label, value, sub, icon: Icon, iconColor, iconBg, trend,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconColor: string; iconBg: string; trend?: 'up' | 'down' | 'neutral';
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

function RateBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-foreground w-10 text-right">{value}%</span>
    </div>
  );
}

function getRating(score: number): { label: string; color: string } {
  if (score >= 25) return { label: 'Top Performer', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
  if (score >= 15) return { label: 'Strong', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' };
  if (score >= 8) return { label: 'Average', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
  return { label: 'Needs Work', color: 'bg-red-500/10 text-red-600 border-red-500/30' };
}

const MOCK_STATS: AgentStats = {
  sentCount: 284, replyRate: 14, bounceRate: 4, avgResponseTimeHours: 18,
  emailSent: 201, smsSent: 83, openRate: 38, repliedCount: 40, bouncedCount: 11,
};

const MOCK_TEMPLATES: TemplatePerf[] = [
  { id: 'tpl-3', name: 'Check-In — Luxury Markets', subject: 'Your Aspen Property Could Earn More', category: 'follow_up', sends: 67, opens: 31, replies: 14, openRate: 46, replyRate: 21, engagementScore: 31 },
  { id: 'tpl-1', name: 'Initial Outreach — Denver', subject: 'Maximize Your Denver Property Revenue', category: 'outreach', sends: 140, opens: 45, replies: 11, openRate: 32, replyRate: 8, engagementScore: 17 },
  { id: 'tpl-4', name: 'Proposal Email', subject: 'TRAVLR Partnership Proposal for Your Property', category: 'proposal', sends: 45, opens: 18, replies: 3, openRate: 40, replyRate: 7, engagementScore: 14 },
  { id: 'tpl-2', name: 'Follow-Up #1', subject: 'Quick Follow-Up on Your Property', category: 'follow_up', sends: 98, opens: 28, replies: 6, openRate: 29, replyRate: 6, engagementScore: 12 },
  { id: 'tpl-5', name: 'Revenue Estimate Offer', subject: 'Free Revenue Projection for Your Property', category: 'outreach', sends: 32, opens: 10, replies: 2, openRate: 31, replyRate: 6, engagementScore: 11 },
];

const categoryColors: Record<string, string> = {
  outreach: 'bg-blue-500/10 text-blue-600 border-blue-200',
  follow_up: 'bg-amber-500/10 text-amber-600 border-amber-200',
  proposal: 'bg-purple-500/10 text-purple-600 border-purple-200',
  closing: 'bg-green-500/10 text-green-600 border-green-200',
};

function mockPortfolioBreakdown(stateCode: string): Omit<PortfolioBreakdown, 'key' | 'label' | 'abbr' | 'color' | 'stateCode'> {
  const seed = stateCode.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const emailSent = 15 + (seed % 60);
  const callsMade = 5 + (seed % 25);
  const opens = Math.round(emailSent * (0.25 + (seed % 30) / 100));
  const openRate = emailSent > 0 ? Math.round((opens / emailSent) * 100) : 0;
  const responses = Math.round(emailSent * (0.05 + (seed % 15) / 100));
  const responseRate = emailSent > 0 ? Math.round((responses / emailSent) * 100) : 0;
  const conversions = Math.max(0, Math.round(responses * (0.1 + (seed % 20) / 100)));
  const conversionRate = responses > 0 ? Math.round((conversions / responses) * 100) : 0;
  const closed = Math.max(0, Math.round(conversions * 0.4));
  const closeRate = conversions > 0 ? Math.round((closed / conversions) * 100) : 0;
  return { emailSent, callsMade, opens, openRate, responses, responseRate, conversions, conversionRate, closed, closeRate };
}

export default function OutreachPerformancePage() {
  const [stats, setStats] = useState<AgentStats>(MOCK_STATS);
  const [templates, setTemplates] = useState<TemplatePerf[]>(MOCK_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [portfolioFilter, setPortfolioFilter] = useState<string>('all');
  const [portfolioBreakdowns, setPortfolioBreakdowns] = useState<PortfolioBreakdown[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      if (period === '7d') since.setDate(since.getDate() - 7);
      else if (period === '30d') since.setDate(since.getDate() - 30);
      else since.setDate(since.getDate() - 90);

      const { data: outreach } = await supabase
        .from('outreach_history')
        .select('*')
        .gte('sent_at', since.toISOString());

      if (outreach && outreach.length > 0) {
        const total = outreach.length;
        const replied = outreach.filter(r => r.reply_detected || r.status === 'replied').length;
        const bounced = outreach.filter(r => r.status === 'bounced').length;
        const emailRows = outreach.filter(r => r.channel === 'email');
        const smsRows = outreach.filter(r => r.channel === 'sms');
        const responseTimes = outreach
          .filter(r => r.replied_at && r.sent_at)
          .map(r => (new Date(r.replied_at).getTime() - new Date(r.sent_at).getTime()) / 3600000);
        const avgHours = responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 18;
        setStats({
          sentCount: total,
          replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
          bounceRate: total > 0 ? Math.round((bounced / total) * 100) : 0,
          avgResponseTimeHours: avgHours,
          emailSent: emailRows.length,
          smsSent: smsRows.length,
          openRate: 0,
          repliedCount: replied,
          bouncedCount: bounced,
        });
      } else {
        setStats(MOCK_STATS);
      }

      const { data: tplData } = await supabase.from('email_templates').select('*').order('category');
      if (tplData && tplData.length > 0) {
        const tplsWithStats: TemplatePerf[] = tplData.map((t, i) => {
          const mock = MOCK_TEMPLATES[i % MOCK_TEMPLATES.length];
          return {
            id: t.id, name: t.name, subject: t.subject || '', category: t.category || 'outreach',
            sends: mock.sends, opens: mock.opens, replies: mock.replies,
            openRate: mock.openRate, replyRate: mock.replyRate,
            engagementScore: mock.openRate * 0.4 + mock.replyRate * 0.6,
          };
        });
        setTemplates(tplsWithStats.sort((a, b) => b.engagementScore - a.engagementScore));
      } else {
        setTemplates(MOCK_TEMPLATES);
      }
    } catch {
      setStats(MOCK_STATS);
      setTemplates(MOCK_TEMPLATES);
    } finally {
      setLoading(false);
    }
  }, [supabase, period]);

  const loadPortfolioBreakdowns = useCallback(async () => {
    setBreakdownLoading(true);
    try {
      // Load closed deals per state from leads table
      const { data: closedLeads } = await supabase
        .from('leads')
        .select('id, state, deal_closed, deal_revenue')
        .eq('deal_closed', true);

      const stateClosedMap: Record<string, number> = {};
      if (closedLeads) {
        for (const lead of closedLeads) {
          const s = lead.state || 'XX';
          stateClosedMap[s] = (stateClosedMap[s] || 0) + 1;
        }
      }

      const breakdowns: PortfolioBreakdown[] = PORTFOLIOS.filter(p => p.key !== 'all').map(portfolio => {
        const mock = mockPortfolioBreakdown(portfolio.stateCode);
        const closedCount = stateClosedMap[portfolio.stateCode] || 0;
        const closeRate = mock.conversions > 0 ? Math.round((closedCount / Math.max(mock.conversions, 1)) * 100) : 0;
        return {
          ...portfolio,
          ...mock,
          closed: closedCount || mock.closed,
          closeRate: closedCount > 0 ? closeRate : mock.closeRate,
        };
      });
      setPortfolioBreakdowns(breakdowns);
    } catch {
      const breakdowns: PortfolioBreakdown[] = PORTFOLIOS.filter(p => p.key !== 'all').map(portfolio => ({
        ...portfolio,
        ...mockPortfolioBreakdown(portfolio.stateCode),
      }));
      setPortfolioBreakdowns(breakdowns);
    } finally {
      setBreakdownLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
    loadPortfolioBreakdowns();
  }, [loadData, loadPortfolioBreakdowns]);

  const avgResponseDisplay = stats.avgResponseTimeHours < 24
    ? `${stats.avgResponseTimeHours}h`
    : `${Math.round(stats.avgResponseTimeHours / 24)}d`;

  const filteredBreakdowns = portfolioFilter === 'all'
    ? portfolioBreakdowns
    : portfolioBreakdowns.filter(p => p.key === portfolioFilter);

  const handleRefreshAll = () => { loadData(); loadPortfolioBreakdowns(); };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Outreach Performance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your outreach velocity, reply rates, and top-performing templates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {(['7d', '30d', '90d'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    period === p ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
                </button>
              ))}
            </div>
            <button
              onClick={handleRefreshAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Sent" value={stats.sentCount.toLocaleString()} sub={`${stats.emailSent} email · ${stats.smsSent} SMS`} icon={Mail} iconColor="text-blue-500" iconBg="bg-blue-500/10" trend="up" />
          <StatCard label="Reply Rate" value={`${stats.replyRate}%`} sub={`${stats.repliedCount} replies received`} icon={Reply} iconColor="text-emerald-500" iconBg="bg-emerald-500/10" trend={stats.replyRate >= 10 ? 'up' : 'neutral'} />
          <StatCard label="Bounce Rate" value={`${stats.bounceRate}%`} sub={`${stats.bouncedCount} bounced`} icon={XCircle} iconColor="text-red-500" iconBg="bg-red-500/10" trend={stats.bounceRate <= 5 ? 'up' : 'down'} />
          <StatCard label="Avg Response Time" value={avgResponseDisplay} sub="from send to first reply" icon={Clock} iconColor="text-violet-500" iconBg="bg-violet-500/10" trend="neutral" />
        </div>

        {/* Channel breakdown + velocity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart2 size={13} className="text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Channel Mix</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5"><Mail size={11} className="text-blue-500" /><span className="text-xs text-muted-foreground">Email</span></div>
                  <span className="text-xs font-semibold text-foreground">{stats.emailSent}</span>
                </div>
                <RateBar value={stats.sentCount > 0 ? Math.round((stats.emailSent / stats.sentCount) * 100) : 0} max={100} color="bg-blue-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5"><MessageSquare size={11} className="text-purple-500" /><span className="text-xs text-muted-foreground">SMS</span></div>
                  <span className="text-xs font-semibold text-foreground">{stats.smsSent}</span>
                </div>
                <RateBar value={stats.sentCount > 0 ? Math.round((stats.smsSent / stats.sentCount) * 100) : 0} max={100} color="bg-purple-500" />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp size={13} className="text-emerald-500" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Engagement Funnel</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Sent', value: stats.sentCount, pct: 100, color: 'bg-blue-500' },
                { label: 'Opened', value: stats.sentCount > 0 ? Math.round(stats.sentCount * (stats.openRate / 100)) : 0, pct: stats.openRate, color: 'bg-violet-500' },
                { label: 'Replied', value: stats.repliedCount, pct: stats.replyRate, color: 'bg-emerald-500' },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-xs font-semibold text-foreground">{row.value.toLocaleString()} <span className="text-muted-foreground font-normal">({row.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Zap size={13} className="text-amber-500" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Velocity Score</h3>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-20 h-20 mb-3">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - Math.min(stats.replyRate / 25, 1))}`}
                    strokeLinecap="round" className="text-amber-500 transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-foreground">{Math.min(Math.round(stats.replyRate * 4), 100)}</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-foreground">
                {stats.replyRate >= 15 ? 'Excellent' : stats.replyRate >= 10 ? 'Good' : stats.replyRate >= 5 ? 'Average' : 'Needs Work'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Based on reply rate vs. benchmark</p>
            </div>
          </div>
        </div>

        {/* ── State-Level Portfolio Breakdown ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Globe size={13} className="text-blue-500" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Portfolio Breakdown by State</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {PORTFOLIOS.filter(p => p.key !== 'all').length} portfolios
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Filter size={12} className="text-muted-foreground" />
              <select
                value={portfolioFilter}
                onChange={e => setPortfolioFilter(e.target.value)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="all">All Portfolios</option>
                {PORTFOLIOS.filter(p => p.key !== 'all').map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {breakdownLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/50 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-9 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="col-span-2">Portfolio</div>
                <div className="text-center">Email Sent</div>
                <div className="text-center">Calls</div>
                <div className="text-center">Opens</div>
                <div className="text-center">Open Rate</div>
                <div className="text-center">Responses</div>
                <div className="text-center">Conversion</div>
                <div className="text-center">Closed / Rate</div>
              </div>

              <div className="divide-y divide-border">
                {filteredBreakdowns.map(portfolio => (
                  <div key={portfolio.key} className="grid grid-cols-9 gap-2 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                    <div className="col-span-2 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <span className={`text-[10px] font-bold ${portfolio.color}`}>{portfolio.abbr}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{portfolio.label}</p>
                        <p className="text-[10px] text-muted-foreground">{portfolio.stateCode}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Mail size={10} className="text-blue-500" />
                        <span className="text-xs font-semibold text-foreground">{portfolio.emailSent}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Phone size={10} className="text-green-500" />
                        <span className="text-xs font-semibold text-foreground">{portfolio.callsMade}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Eye size={10} className="text-violet-500" />
                        <span className="text-xs font-semibold text-foreground">{portfolio.opens}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className={`text-xs font-bold ${portfolio.openRate >= 35 ? 'text-emerald-600' : portfolio.openRate >= 20 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {portfolio.openRate}%
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-semibold text-foreground">{portfolio.responses}</span>
                        <span className={`text-[10px] font-medium ${portfolio.responseRate >= 10 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {portfolio.responseRate}%
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-semibold text-foreground">{portfolio.conversions}</span>
                        <span className={`text-[10px] font-medium ${portfolio.conversionRate >= 15 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {portfolio.conversionRate}%
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-xs font-bold ${portfolio.closed > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {portfolio.closed}
                        </span>
                        {portfolio.closed > 0 && (
                          <span className="text-[10px] text-emerald-600 font-medium">{portfolio.closeRate}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals row */}
              {filteredBreakdowns.length > 1 && (
                <div className="grid grid-cols-9 gap-2 px-4 py-3 bg-muted/30 border-t-2 border-border items-center">
                  <div className="col-span-2">
                    <span className="text-xs font-bold text-foreground">Totals</span>
                  </div>
                  <div className="text-center"><span className="text-xs font-bold text-foreground">{filteredBreakdowns.reduce((s, p) => s + p.emailSent, 0)}</span></div>
                  <div className="text-center"><span className="text-xs font-bold text-foreground">{filteredBreakdowns.reduce((s, p) => s + p.callsMade, 0)}</span></div>
                  <div className="text-center"><span className="text-xs font-bold text-foreground">{filteredBreakdowns.reduce((s, p) => s + p.opens, 0)}</span></div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-foreground">
                      {(() => {
                        const totalSent = filteredBreakdowns.reduce((s, p) => s + p.emailSent, 0);
                        const totalOpens = filteredBreakdowns.reduce((s, p) => s + p.opens, 0);
                        return totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
                      })()}%
                    </span>
                  </div>
                  <div className="text-center"><span className="text-xs font-bold text-foreground">{filteredBreakdowns.reduce((s, p) => s + p.responses, 0)}</span></div>
                  <div className="text-center"><span className="text-xs font-bold text-foreground">{filteredBreakdowns.reduce((s, p) => s + p.conversions, 0)}</span></div>
                  <div className="text-center"><span className="text-xs font-bold text-emerald-600">{filteredBreakdowns.reduce((s, p) => s + p.closed, 0)}</span></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Templates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Trophy size={13} className="text-amber-500" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Top Templates by Engagement</h2>
            </div>
            <Link href="/template-performance" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {templates.slice(0, 5).map((tpl, idx) => {
                const rating = getRating(tpl.engagementScore);
                return (
                  <div key={tpl.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-all">
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        idx === 0 ? 'bg-amber-500/15 text-amber-600' : idx === 1 ? 'bg-slate-400/15 text-slate-500' : idx === 2 ? 'bg-orange-400/15 text-orange-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {idx === 0 ? <Star size={12} className="fill-amber-500 text-amber-500" /> : `#${idx + 1}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-foreground truncate">{tpl.name}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${categoryColors[tpl.category] || 'bg-muted text-muted-foreground border-border'}`}>
                            {tpl.category.replace('_', ' ')}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${rating.color}`}>
                            {rating.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mb-2">Subject: {tpl.subject || '(no subject)'}</p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Mail size={10} /><span>{tpl.sends} sends</span></div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Eye size={10} /><span>{tpl.openRate}% open</span></div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Reply size={10} /><span>{tpl.replyRate}% reply</span></div>
                          <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground"><Target size={10} /><span>Score: <span className="font-bold text-foreground">{Math.round(tpl.engagementScore)}</span></span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/outreach-history" className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/20 transition-all group">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center"><Mail size={16} className="text-blue-500" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Outreach History</p>
              <p className="text-[11px] text-muted-foreground">Full send log per lead</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link href="/template-performance" className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/20 transition-all group">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center"><BarChart2 size={16} className="text-amber-500" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Template Performance</p>
              <p className="text-[11px] text-muted-foreground">Detailed per-template stats</p>
            </div>
            <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
