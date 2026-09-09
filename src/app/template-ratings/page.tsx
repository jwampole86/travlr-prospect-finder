'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Star, ThumbsUp, ThumbsDown, BarChart2, RefreshCw, TrendingUp, TrendingDown, Minus, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateRatingSummary {
  template_name: string;
  template_id: string | null;
  effective_count: number;
  needs_refinement_count: number;
  total_ratings: number;
  effective_pct: number;
  trend: 'up' | 'down' | 'neutral';
}

interface RatingEntry {
  id: string;
  call_session_id: string;
  template_name: string | null;
  rating: 'effective' | 'needs_refinement';
  rated_at: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SUMMARIES: TemplateRatingSummary[] = [
  { template_name: 'Revenue Estimate Offer', template_id: 'tpl-1', effective_count: 18, needs_refinement_count: 4, total_ratings: 22, effective_pct: 82, trend: 'up' },
  { template_name: 'Check-In — Luxury Markets', template_id: 'tpl-2', effective_count: 14, needs_refinement_count: 6, total_ratings: 20, effective_pct: 70, trend: 'neutral' },
  { template_name: 'Initial Outreach', template_id: 'tpl-3', effective_count: 9, needs_refinement_count: 11, total_ratings: 20, effective_pct: 45, trend: 'down' },
  { template_name: 'Follow-Up #1', template_id: 'tpl-4', effective_count: 12, needs_refinement_count: 5, total_ratings: 17, effective_pct: 71, trend: 'up' },
  { template_name: 'Proposal Email', template_id: 'tpl-5', effective_count: 7, needs_refinement_count: 8, total_ratings: 15, effective_pct: 47, trend: 'down' },
  { template_name: 'Re-engagement Sequence', template_id: 'tpl-6', effective_count: 5, needs_refinement_count: 3, total_ratings: 8, effective_pct: 63, trend: 'neutral' },
];

const MOCK_RECENT: RatingEntry[] = [
  { id: 'r1', call_session_id: 'cs1', template_name: 'Revenue Estimate Offer', rating: 'effective', rated_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'r2', call_session_id: 'cs2', template_name: 'Initial Outreach', rating: 'needs_refinement', rated_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'r3', call_session_id: 'cs3', template_name: 'Check-In — Luxury Markets', rating: 'effective', rated_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'r4', call_session_id: 'cs4', template_name: 'Follow-Up #1', rating: 'effective', rated_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'r5', call_session_id: 'cs5', template_name: 'Proposal Email', rating: 'needs_refinement', rated_at: new Date(Date.now() - 86400000 * 2).toISOString() },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplateRatingsPage() {
  const supabase = createClient();
  const [summaries, setSummaries] = useState<TemplateRatingSummary[]>(MOCK_SUMMARIES);
  const [recent, setRecent] = useState<RatingEntry[]>(MOCK_RECENT);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'effective_pct' | 'total_ratings' | 'needs_refinement_count'>('effective_pct');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ratings } = await supabase
        .from('template_ratings')
        .select('id, call_session_id, template_id, template_name, rating, rated_at')
        .order('rated_at', { ascending: false });

      if (ratings && ratings.length > 0) {
        // Aggregate by template_name
        const map: Record<string, TemplateRatingSummary> = {};
        ratings.forEach((r: any) => {
          const key = r.template_name || 'Unknown Template';
          if (!map[key]) {
            map[key] = { template_name: key, template_id: r.template_id, effective_count: 0, needs_refinement_count: 0, total_ratings: 0, effective_pct: 0, trend: 'neutral' };
          }
          if (r.rating === 'effective') map[key].effective_count++;
          else map[key].needs_refinement_count++;
          map[key].total_ratings++;
        });
        const agg = Object.values(map).map(s => ({
          ...s,
          effective_pct: s.total_ratings > 0 ? Math.round((s.effective_count / s.total_ratings) * 100) : 0,
          trend: s.effective_pct >= 70 ? 'up' as const : s.effective_pct >= 50 ? 'neutral' as const : 'down' as const,
        }));
        setSummaries(agg);
        setRecent(ratings.slice(0, 10).map((r: any) => ({
          id: r.id,
          call_session_id: r.call_session_id,
          template_name: r.template_name,
          rating: r.rating,
          rated_at: r.rated_at,
        })));
      } else {
        setSummaries(MOCK_SUMMARIES);
        setRecent(MOCK_RECENT);
      }
    } catch {
      setSummaries(MOCK_SUMMARIES);
      setRecent(MOCK_RECENT);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = summaries
    .filter(s => !search || s.template_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'effective_pct') return b.effective_pct - a.effective_pct;
      if (sortBy === 'total_ratings') return b.total_ratings - a.total_ratings;
      return b.needs_refinement_count - a.needs_refinement_count;
    });

  const totalRatings = summaries.reduce((a, b) => a + b.total_ratings, 0);
  const totalEffective = summaries.reduce((a, b) => a + b.effective_count, 0);
  const overallPct = totalRatings > 0 ? Math.round((totalEffective / totalRatings) * 100) : 0;
  const needsWork = summaries.filter(s => s.effective_pct < 50).length;

  const chartData = filtered.slice(0, 8).map(s => ({
    name: s.template_name.length > 20 ? s.template_name.slice(0, 18) + '…' : s.template_name,
    effective: s.effective_count,
    needs_refinement: s.needs_refinement_count,
    pct: s.effective_pct,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Template Ratings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aggregated agent feedback from call transcript view — guides future sequence edits
            </p>
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

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Ratings</p>
            <p className="text-2xl font-bold text-foreground">{totalRatings}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Across {summaries.length} templates</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Overall Effective Rate</p>
            <p className={`text-2xl font-bold ${overallPct >= 70 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{overallPct}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{totalEffective} effective ratings</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Needs Refinement</p>
            <p className="text-2xl font-bold text-amber-600">{needsWork}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Templates below 50% effective</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Top Template</p>
            <p className="text-sm font-bold text-foreground truncate">{summaries[0]?.template_name || '—'}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">{summaries[0]?.effective_pct ?? 0}% effective</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Effective vs Needs Refinement — by Template</h2>
          {loading ? (
            <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }} />
                <Bar dataKey="effective" fill="#10b981" name="Effective" radius={[3, 3, 0, 0]} />
                <Bar dataKey="needs_refinement" fill="#f59e0b" name="Needs Refinement" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search templates…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="effective_pct">Sort: Effective %</option>
                <option value="total_ratings">Sort: Most Rated</option>
                <option value="needs_refinement_count">Sort: Needs Work</option>
              </select>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />)}
              </div>
            ) : filtered.map(s => (
              <div key={s.template_name} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.effective_pct >= 70 ? 'bg-emerald-500/10' : s.effective_pct >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                    <Star size={14} className={s.effective_pct >= 70 ? 'text-emerald-600' : s.effective_pct >= 50 ? 'text-amber-600' : 'text-red-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground truncate">{s.template_name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.trend === 'up' && <TrendingUp size={12} className="text-emerald-500" />}
                        {s.trend === 'down' && <TrendingDown size={12} className="text-red-500" />}
                        {s.trend === 'neutral' && <Minus size={12} className="text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <ThumbsUp size={11} /> {s.effective_count} effective
                      </span>
                      <span className="flex items-center gap-1 text-amber-600">
                        <ThumbsDown size={11} /> {s.needs_refinement_count} needs refinement
                      </span>
                      <span>{s.total_ratings} total</span>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${s.effective_pct >= 70 ? 'bg-emerald-500' : s.effective_pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${s.effective_pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right ${s.effective_pct >= 70 ? 'text-emerald-600' : s.effective_pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {s.effective_pct}%
                      </span>
                    </div>
                  </div>
                </div>
                {s.effective_pct < 50 && (
                  <div className="mt-3 flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-200/50 rounded-lg">
                    <BarChart2 size={11} className="text-amber-600 shrink-0" />
                    <p className="text-[10px] text-amber-700">This template needs refinement — consider revising the script or sequence step</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recent Ratings Feed */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Ratings</h3>
            <div className="space-y-2">
              {recent.map(r => (
                <div key={r.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${r.rating === 'effective' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                      {r.rating === 'effective'
                        ? <ThumbsUp size={11} className="text-emerald-600" />
                        : <ThumbsDown size={11} className="text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.template_name || 'Unknown Template'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-semibold ${r.rating === 'effective' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {r.rating === 'effective' ? 'Effective' : 'Needs Refinement'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(r.rated_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
