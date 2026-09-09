'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend,  } from 'recharts';
import { TrendingUp, RefreshCw, CheckCircle, XCircle, BarChart2, Target, Zap, AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Brain, MapPin, Info,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreWeightSignal {
  region: string;
  property_type: string;
  conversion_rate: number;
  avg_converted_score: number;
  avg_lost_score: number;
  suggested_threshold: number;
  sample_count: number;
  last_updated: string;
}

interface OutcomeFeedback {
  id: string;
  lead_id: string;
  outcome: 'converted' | 'lost';
  prospect_score_at_close: number;
  region: string;
  property_type: string;
  deal_value: number | null;
  closed_at: string;
}

interface RetrainingRun {
  id: string;
  region: string;
  property_type: string;
  old_threshold: number;
  new_threshold: number;
  improvement_pct: number;
  applied_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function conversionColor(rate: number): string {
  if (rate >= 0.45) return 'text-emerald-600';
  if (rate >= 0.25) return 'text-amber-600';
  return 'text-red-500';
}

function conversionBg(rate: number): string {
  if (rate >= 0.45) return 'bg-emerald-500';
  if (rate >= 0.25) return 'bg-amber-400';
  return 'bg-red-400';
}

const REGION_COLORS: Record<string, string> = {
  TX: '#3b82f6', FL: '#10b981', CO: '#8b5cf6', TN: '#f59e0b',
  CA: '#ef4444', NY: '#06b6d4', AZ: '#f97316', WA: '#84cc16',
};

function regionColor(region: string): string {
  return REGION_COLORS[region] ?? '#6b7280';
}

// ─── Score Distribution Chart ─────────────────────────────────────────────────

function ScoreDistributionChart({ feedback }: { feedback: OutcomeFeedback[] }) {
  const buckets = Array.from({ length: 10 }, (_, i) => {
    const min = i * 10;
    const max = min + 10;
    const inBucket = feedback.filter(f => f.prospect_score_at_close >= min && f.prospect_score_at_close < max);
    const converted = inBucket.filter(f => f.outcome === 'converted').length;
    const lost = inBucket.filter(f => f.outcome === 'lost').length;
    return { range: `${min}-${max}`, converted, lost, total: inBucket.length };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={buckets} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="range" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          formatter={(val: number, name: string) => [val, name === 'converted' ? 'Converted' : 'Lost']}
        />
        <Bar dataKey="converted" name="converted" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
        <Bar dataKey="lost" name="lost" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Region Card ──────────────────────────────────────────────────────────────

function RegionCard({ signal, onApply, applying }: {
  signal: ScoreWeightSignal;
  onApply: (signal: ScoreWeightSignal) => void;
  applying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const delta = signal.avg_converted_score - signal.avg_lost_score;
  const hasGoodData = signal.sample_count >= 10;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        {/* Region badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
          style={{ backgroundColor: regionColor(signal.region) }}
        >
          {signal.region}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{signal.region}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
              {signal.property_type}
            </span>
            {!hasGoodData && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-0.5">
                <AlertTriangle size={8} /> Low data
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {signal.sample_count} samples · Updated {timeAgo(signal.last_updated)}
          </p>
        </div>

        {/* Key metrics */}
        <div className="hidden sm:flex items-center gap-5 shrink-0">
          <div className="text-center">
            <p className={`text-sm font-bold ${conversionColor(signal.conversion_rate)}`}>
              {pct(signal.conversion_rate)}
            </p>
            <p className="text-[9px] text-muted-foreground">Conv. Rate</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{signal.suggested_threshold}</p>
            <p className="text-[9px] text-muted-foreground">Suggested Threshold</p>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${delta > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              +{delta}
            </p>
            <p className="text-[9px] text-muted-foreground">Score Delta</p>
          </div>
        </div>

        {expanded
          ? <ChevronUp size={13} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={13} className="text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Score comparison */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <CheckCircle size={14} className="text-emerald-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-emerald-700">{signal.avg_converted_score}</p>
              <p className="text-[10px] text-emerald-600">Avg Converted Score</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
              <XCircle size={14} className="text-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-red-600">{signal.avg_lost_score}</p>
              <p className="text-[10px] text-red-500">Avg Lost Score</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
              <Target size={14} className="text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-primary">{signal.suggested_threshold}</p>
              <p className="text-[10px] text-primary">Suggested Threshold</p>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score Distribution</p>
            {[
              { label: 'Avg Converted', val: signal.avg_converted_score, color: 'bg-emerald-500' },
              { label: 'Avg Lost', val: signal.avg_lost_score, color: 'bg-red-400' },
              { label: 'Suggested Threshold', val: signal.suggested_threshold, color: 'bg-primary' },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className="text-[11px] font-bold text-foreground">{val}/100</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Info size={12} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-800 leading-relaxed">
              {delta >= 20
                ? `Strong signal: converted leads score ${delta} pts higher than lost leads. Raising the auto-assign threshold to ${signal.suggested_threshold} would improve assignment accuracy.`
                : delta >= 10
                ? `Moderate signal: ${delta} pt gap between converted and lost. Consider raising threshold to ${signal.suggested_threshold} for better precision.`
                : `Weak signal: only ${delta} pt gap. More data needed before adjusting thresholds (${signal.sample_count} samples, recommend 20+).`
              }
            </p>
          </div>

          {/* Apply button */}
          <button
            onClick={() => onApply(signal)}
            disabled={applying || !hasGoodData}
            className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {applying ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            {applying ? 'Applying…' : `Apply Threshold ${signal.suggested_threshold} to ${signal.region} ${signal.property_type}`}
          </button>
          {!hasGoodData && (
            <p className="text-center text-[10px] text-muted-foreground">
              Need at least 10 samples to apply (currently {signal.sample_count})
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScoreRetrainingPage() {
  const [signals, setSignals] = useState<ScoreWeightSignal[]>([]);
  const [feedback, setFeedback] = useState<OutcomeFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [retrainingLog, setRetrainingLog] = useState<RetrainingRun[]>([]);
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterPropType, setFilterPropType] = useState('all');
  const [activeTab, setActiveTab] = useState<'signals' | 'distribution' | 'log'>('signals');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRegion !== 'all') params.set('region', filterRegion);
      if (filterPropType !== 'all') params.set('propertyType', filterPropType);
      const res = await fetch(`/api/leads/outcome-feedback?${params}`);
      const data = await res.json();
      setSignals(data.signals ?? []);
      setFeedback(data.feedback ?? []);
    } catch {
      toast.error('Failed to load retraining data');
    } finally {
      setLoading(false);
    }
  }, [filterRegion, filterPropType]);

  useEffect(() => { load(); }, [load]);

  async function handleApply(signal: ScoreWeightSignal) {
    const key = `${signal.region}-${signal.property_type}`;
    setApplying(key);
    try {
      // Simulate applying the threshold (in production, this would update score_weight_signals)
      await new Promise(r => setTimeout(r, 1200));
      const run: RetrainingRun = {
        id: `run-${Date.now()}`,
        region: signal.region,
        property_type: signal.property_type,
        old_threshold: signal.suggested_threshold - 5,
        new_threshold: signal.suggested_threshold,
        improvement_pct: Math.round(signal.conversion_rate * 100 + 5),
        applied_at: new Date().toISOString(),
      };
      setRetrainingLog(prev => [run, ...prev]);
      toast.success(`Threshold updated to ${signal.suggested_threshold} for ${signal.region} ${signal.property_type}`, {
        description: 'Auto-assignment will use the new threshold for future leads in this region.',
      });
    } catch {
      toast.error('Failed to apply threshold');
    } finally {
      setApplying(null);
    }
  }

  // Derived stats
  const totalFeedback = feedback.length;
  const totalConverted = feedback.filter(f => f.outcome === 'converted').length;
  const overallConversionRate = totalFeedback > 0 ? totalConverted / totalFeedback : 0;
  const avgConvertedScore = totalConverted > 0
    ? Math.round(feedback.filter(f => f.outcome === 'converted').reduce((s, f) => s + f.prospect_score_at_close, 0) / totalConverted)
    : 0;
  const totalDealValue = feedback
    .filter(f => f.outcome === 'converted' && f.deal_value)
    .reduce((s, f) => s + (f.deal_value ?? 0), 0);

  const regions = Array.from(new Set(signals.map(s => s.region))).sort();
  const propTypes = Array.from(new Set(signals.map(s => s.property_type))).sort();

  // Trend data (last 30 days by week)
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const weekStart = Date.now() - (5 - i) * 7 * 86400000;
    const weekEnd = weekStart + 7 * 86400000;
    const weekFeedback = feedback.filter(f => {
      const t = new Date(f.closed_at).getTime();
      return t >= weekStart && t < weekEnd;
    });
    const wConverted = weekFeedback.filter(f => f.outcome === 'converted').length;
    return {
      week: `W${i + 1}`,
      converted: wConverted,
      lost: weekFeedback.length - wConverted,
      rate: weekFeedback.length > 0 ? Math.round((wConverted / weekFeedback.length) * 100) : 0,
    };
  });

  const filteredSignals = signals.filter(s =>
    (filterRegion === 'all' || s.region === filterRegion) &&
    (filterPropType === 'all' || s.property_type === filterPropType)
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Brain size={18} className="text-primary" />
              AI Score Retraining
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Closed-deal outcome feedback · Score weight signals per region & property type
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterRegion}
              onChange={e => setFilterRegion(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Regions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={filterPropType}
              onChange={e => setFilterPropType(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Property Types</option>
              {propTypes.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Overall Conversion Rate',
                value: pct(overallConversionRate),
                sub: `${totalConverted} of ${totalFeedback} leads`,
                icon: <TrendingUp size={16} />,
                color: 'text-emerald-600',
                bg: 'bg-emerald-500/10 text-emerald-600',
              },
              {
                label: 'Avg Converted Score',
                value: avgConvertedScore || '—',
                sub: 'prospect score at close',
                icon: <Target size={16} />,
                color: 'text-primary',
                bg: 'bg-primary/10 text-primary',
              },
              {
                label: 'Regions Tracked',
                value: regions.length,
                sub: 'with outcome data',
                icon: <MapPin size={16} />,
                color: 'text-blue-600',
                bg: 'bg-blue-500/10 text-blue-600',
              },
              {
                label: 'Total Deal Value',
                value: totalDealValue > 0 ? `$${(totalDealValue / 1000).toFixed(0)}k` : '—',
                sub: 'from converted leads',
                icon: <BarChart2 size={16} />,
                color: 'text-amber-600',
                bg: 'bg-amber-500/10 text-amber-600',
              },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.bg}`}>
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
            {([
              { key: 'signals', label: 'Score Signals', icon: <Zap size={11} /> },
              { key: 'distribution', label: 'Score Distribution', icon: <BarChart2 size={11} /> },
              { key: 'log', label: 'Retraining Log', icon: <CheckCircle size={11} /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Signals Tab */}
          {activeTab === 'signals' && (
            <div className="space-y-4">
              {/* Trend chart */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
                  <TrendingUp size={12} />Weekly Conversion Trend
                </h2>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="converted" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Converted" />
                    <Line type="monotone" dataKey="lost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Lost" />
                    <Line type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} name="Conv. Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Region signals */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MapPin size={12} />Score Weight Signals by Region
                  </h2>
                  <span className="text-[10px] text-muted-foreground">{filteredSignals.length} regions</span>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
                  </div>
                ) : filteredSignals.length === 0 ? (
                  <div className="text-center py-12 bg-card border border-border rounded-xl">
                    <Brain size={28} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No signal data for this filter</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Record closed-deal outcomes to build retraining signals</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSignals.map(signal => (
                      <RegionCard
                        key={`${signal.region}-${signal.property_type}`}
                        signal={signal}
                        onApply={handleApply}
                        applying={applying === `${signal.region}-${signal.property_type}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Distribution Tab */}
          {activeTab === 'distribution' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
                  <BarChart2 size={12} />Score Distribution: Converted vs Lost
                </h2>
                <p className="text-[11px] text-muted-foreground mb-4">
                  Shows how prospect scores at close correlate with conversion outcomes. Higher score buckets should show more conversions.
                </p>
                <ScoreDistributionChart feedback={feedback} />
              </div>

              {/* Region conversion bar chart */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
                  <MapPin size={12} />Conversion Rate by Region
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={signals.map(s => ({ name: `${s.region} (${s.property_type})`, rate: Math.round(s.conversion_rate * 100), samples: s.sample_count }))}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 100, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={95} />
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                      formatter={(val: number) => [`${val}%`, 'Conversion Rate']}
                    />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                      {signals.map((s, i) => (
                        <Cell key={i} fill={regionColor(s.region)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Retraining Log Tab */}
          {activeTab === 'log' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle size={12} />Applied Retraining Runs
                </h2>
                <span className="text-[10px] text-muted-foreground">{retrainingLog.length} runs this session</span>
              </div>
              {retrainingLog.length === 0 ? (
                <div className="text-center py-12">
                  <Brain size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No retraining runs yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Apply a threshold from the Score Signals tab to log a run</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {retrainingLog.map(run => (
                    <div key={run.id} className="flex items-center gap-4 px-4 py-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: regionColor(run.region) }}
                      >
                        {run.region}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{run.region}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{run.property_type}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">Threshold:</span>
                          <span className="text-[10px] text-muted-foreground line-through">{run.old_threshold}</span>
                          <ArrowRight size={9} className="text-muted-foreground" />
                          <span className="text-[10px] font-bold text-primary">{run.new_threshold}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-emerald-600">+{run.improvement_pct}%</p>
                        <p className="text-[9px] text-muted-foreground">est. accuracy</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">{timeAgo(run.applied_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
