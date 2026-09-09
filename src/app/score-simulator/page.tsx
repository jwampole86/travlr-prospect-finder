'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from 'recharts';
import {
  SlidersHorizontal, TrendingUp, TrendingDown, Minus, RotateCcw,
  ChevronUp, ChevronDown, Info, Target, Zap, BarChart3,
} from 'lucide-react';


interface ScoringWeights {
  price: number;
  daysOnMarket: number;
  regulationStatus: number;
  neighborhoodSaturation: number;
}

interface ScoringThresholds {
  domMotivated: number;
  domStale: number;
  priceCompetitivePct: number;
  saturationLow: number;
  saturationHigh: number;
}

interface SimLead {
  id: string;
  address: string;
  city: string;
  price: number;
  daysOnMarket: number;
  regulationStatus: string;
  prospectScore: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 30,
  daysOnMarket: 25,
  regulationStatus: 30,
  neighborhoodSaturation: 15,
};

const DEFAULT_THRESHOLDS: ScoringThresholds = {
  domMotivated: 30,
  domStale: 90,
  priceCompetitivePct: 10,
  saturationLow: 15,
  saturationHigh: 35,
};

function computeSimScore(
  lead: SimLead,
  weights: ScoringWeights,
  thresholds: ScoringThresholds,
  marketAvg: number
): number {
  const priceRatio = marketAvg > 0 ? lead.price / marketAvg : 1;
  const priceScore = Math.max(0, Math.min(100, Math.round((2 - priceRatio) * 100)));

  let domScore: number;
  if (lead.daysOnMarket >= thresholds.domStale) {
    domScore = 100;
  } else if (lead.daysOnMarket >= thresholds.domMotivated) {
    domScore = 65 + Math.round(((lead.daysOnMarket - thresholds.domMotivated) / (thresholds.domStale - thresholds.domMotivated)) * 35);
  } else {
    domScore = Math.round((lead.daysOnMarket / thresholds.domMotivated) * 65);
  }
  domScore = Math.max(0, Math.min(100, domScore));

  const regMap: Record<string, number> = { Allowed: 100, Restricted: 65, Unknown: 20, Prohibited: 0 };
  const regScore = regMap[lead.regulationStatus] ?? 20;
  const satScore = 60;

  const total = weights.price + weights.daysOnMarket + weights.regulationStatus + weights.neighborhoodSaturation;
  if (total === 0) return 0;

  return Math.round(
    (priceScore * weights.price +
      domScore * weights.daysOnMarket +
      regScore * weights.regulationStatus +
      satScore * weights.neighborhoodSaturation) /
      total
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-success/10 text-success border-success/30' :
    score >= 50 ? 'bg-warning/10 text-warning border-warning/30': 'bg-danger/10 text-danger border-danger/30';
  return (
    <span className={`inline-flex items-center justify-center w-10 h-7 rounded-md border text-xs font-bold font-mono-data ${color}`}>
      {score}
    </span>
  );
}

function WeightSlider({
  label, value, color, onChange,
}: {
  label: string; value: number; color: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className={`text-xs font-bold font-mono-data ${color}`}>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-primary"
      />
    </div>
  );
}

function ThresholdInput({
  label, value, unit, min, max, onChange, hint,
}: {
  label: string; value: number; unit: string; min: number; max: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={e => onChange(parseInt(e.target.value) || min)}
            className="w-16 px-2 py-1 text-xs bg-muted border border-border rounded-md text-right font-mono-data focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Factor Contribution Chart ────────────────────────────────────────────────

interface FactorContributionChartProps {
  weights: ScoringWeights;
  defaultWeights: ScoringWeights;
}

function FactorContributionChart({ weights, defaultWeights }: FactorContributionChartProps) {
  const factors = [
    { name: 'Regulation Status', current: weights.regulationStatus, default: defaultWeights.regulationStatus, color: '#34d399' },
    { name: 'Price vs. Market', current: weights.price, default: defaultWeights.price, color: '#60a5fa' },
    { name: 'Days on Market', current: weights.daysOnMarket, default: defaultWeights.daysOnMarket, color: '#fbbf24' },
    { name: 'Neighborhood Sat.', current: weights.neighborhoodSaturation, default: defaultWeights.neighborhoodSaturation, color: '#a78bfa' },
  ].sort((a, b) => b.current - a.current);

  const data = factors.map(f => ({
    name: f.name,
    Weight: f.current,
    Baseline: f.default,
    delta: f.current - f.default,
    color: f.color,
  }));

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Factor Contribution</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Highest impact on rankings</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={110} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(value: number, name: string) => [`${value}%`, name]}
          />
          <Bar dataKey="Baseline" fill="var(--muted)" radius={[0, 2, 2, 0]} barSize={6} />
          <Bar dataKey="Weight" radius={[0, 4, 4, 0]} barSize={10}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.map(f => (
          <div key={f.name} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
            <span className="text-muted-foreground">{f.name}</span>
            {f.delta !== 0 && (
              <span className={f.delta > 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                {f.delta > 0 ? `+${f.delta}%` : `${f.delta}%`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Before/After Score Tier Chart ────────────────────────────────────────────

interface TierChartProps {
  simLeads: Array<{ prospectScore: number; simScore: number }>;
}

function ScoreTierChart({ simLeads }: TierChartProps) {
  const tiers = [
    { label: 'Hot (75–100)', min: 75, max: 100, color: '#34d399' },
    { label: 'Warm (50–74)', min: 50, max: 74, color: '#fbbf24' },
    { label: 'Cold (0–49)', min: 0, max: 49, color: '#f87171' },
  ];

  const data = tiers.map(tier => ({
    tier: tier.label,
    Before: simLeads.filter(l => l.prospectScore >= tier.min && l.prospectScore <= tier.max).length,
    After: simLeads.filter(l => l.simScore >= tier.min && l.simScore <= tier.max).length,
    color: tier.color,
  }));

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Lead Count by Score Tier</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Before vs. After</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="tier" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>}
          />
          <Bar dataKey="Before" fill="var(--muted-foreground)" opacity={0.4} radius={[3, 3, 0, 0]} barSize={18} />
          <Bar dataKey="After" radius={[3, 3, 0, 0]} barSize={18}>
            {data.map((entry, index) => (
              <Cell key={`tier-cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScoreSimulatorPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<SimLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [thresholds, setThresholds] = useState<ScoringThresholds>(DEFAULT_THRESHOLDS);
  const [activePanel, setActivePanel] = useState<'weights' | 'thresholds'>('weights');
  const [sortBy, setSortBy] = useState<'new' | 'old'>('new');

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, price, days_on_market, regulation_status, prospect_score')
        .not('stage', 'eq', 'Not a Fit')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setLeads(data.map(row => ({
          id: row.id,
          address: row.address || '',
          city: row.city || '',
          price: row.price || 0,
          daysOnMarket: row.days_on_market || 0,
          regulationStatus: row.regulation_status || 'Unknown',
          prospectScore: row.prospect_score || 0,
        })));
      }
      setLoading(false);
    }
    fetchLeads();
  }, [supabase]);

  const marketAvg = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + l.price, 0) / leads.length)
    : 2500;

  const total = weights.price + weights.daysOnMarket + weights.regulationStatus + weights.neighborhoodSaturation;
  const isValid = total === 100;

  const simLeads = leads.map(lead => ({
    ...lead,
    simScore: computeSimScore(lead, weights, thresholds, marketAvg),
    delta: computeSimScore(lead, weights, thresholds, marketAvg) - lead.prospectScore,
  }));

  const sorted = [...simLeads].sort((a, b) =>
    sortBy === 'new' ? b.simScore - a.simScore : a.simScore - b.simScore
  );

  const avgOriginal = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + l.prospectScore, 0) / leads.length)
    : 0;
  const avgSim = simLeads.length > 0
    ? Math.round(simLeads.reduce((s, l) => s + l.simScore, 0) / simLeads.length)
    : 0;
  const avgDelta = avgSim - avgOriginal;

  const improvedCount = simLeads.filter(l => l.delta > 0).length;
  const decreasedCount = simLeads.filter(l => l.delta < 0).length;
  const unchangedCount = simLeads.filter(l => l.delta === 0).length;

  function handleReset() {
    setWeights(DEFAULT_WEIGHTS);
    setThresholds(DEFAULT_THRESHOLDS);
  }

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Score Simulator</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Adjust weights and thresholds to preview how changes affect lead rankings before applying.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all min-h-[44px] sm:min-h-0"
          >
            <RotateCcw size={13} />
            Reset to Defaults
          </button>
        </div>

        {/* Impact summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Avg Score Change',
              value: avgDelta === 0 ? '±0' : avgDelta > 0 ? `+${avgDelta}` : String(avgDelta),
              sub: `${avgOriginal} → ${avgSim}`,
              color: avgDelta > 0 ? 'text-success' : avgDelta < 0 ? 'text-danger' : 'text-muted-foreground',
              bg: avgDelta > 0 ? 'border-success/30 bg-success/5' : avgDelta < 0 ? 'border-danger/30 bg-danger/5' : 'border-border',
            },
            {
              label: 'Leads Improved',
              value: String(improvedCount),
              sub: 'score increased',
              color: 'text-success',
              bg: 'border-border',
            },
            {
              label: 'Leads Decreased',
              value: String(decreasedCount),
              sub: 'score dropped',
              color: 'text-danger',
              bg: 'border-border',
            },
            {
              label: 'Unchanged',
              value: String(unchangedCount),
              sub: 'no change',
              color: 'text-muted-foreground',
              bg: 'border-border',
            },
          ].map(item => (
            <div key={item.label} className={`bg-card rounded-xl border p-4 ${item.bg}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className={`text-2xl font-bold font-mono-data mt-1 ${item.color}`}>{item.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Factor Contribution + Tier Charts */}
        {!loading && leads.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FactorContributionChart weights={weights} defaultWeights={DEFAULT_WEIGHTS} />
            <ScoreTierChart simLeads={simLeads} />
          </div>
        )}

        {!isValid && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-warning/5 border-warning/30 text-warning text-sm">
            <Info size={14} />
            <span>
              Weights total <strong>{total}%</strong> — must equal 100% for accurate simulation.
              {total > 100 ? ` Reduce by ${total - 100}%.` : ` Add ${100 - total}%.`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          {/* Left: Controls */}
          <div className="xl:col-span-2 space-y-4">
            {/* Panel tabs */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 border border-border w-fit">
              <button
                onClick={() => setActivePanel('weights')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all min-h-[44px] sm:min-h-0 ${activePanel === 'weights' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <SlidersHorizontal size={12} />Factor Weights
              </button>
              <button
                onClick={() => setActivePanel('thresholds')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all min-h-[44px] sm:min-h-0 ${activePanel === 'thresholds' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Target size={12} />Thresholds
              </button>
            </div>

            {activePanel === 'weights' && (
              <div className="bg-card rounded-xl border border-border p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Factor Weights</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Drag sliders to redistribute scoring importance</p>
                </div>
                <div className="space-y-4">
                  <WeightSlider
                    label="Price vs. Market"
                    value={weights.price}
                    color="text-blue-400"
                    onChange={v => setWeights(w => ({ ...w, price: v }))}
                  />
                  <WeightSlider
                    label="Days on Market"
                    value={weights.daysOnMarket}
                    color="text-amber-400"
                    onChange={v => setWeights(w => ({ ...w, daysOnMarket: v }))}
                  />
                  <WeightSlider
                    label="Regulation Status"
                    value={weights.regulationStatus}
                    color="text-emerald-400"
                    onChange={v => setWeights(w => ({ ...w, regulationStatus: v }))}
                  />
                  <WeightSlider
                    label="Neighborhood Saturation"
                    value={weights.neighborhoodSaturation}
                    color="text-purple-400"
                    onChange={v => setWeights(w => ({ ...w, neighborhoodSaturation: v }))}
                  />
                </div>

                {/* Weight distribution bar */}
                <div>
                  <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-blue-500 transition-all duration-200" style={{ width: `${weights.price}%` }} />
                    <div className="bg-amber-500 transition-all duration-200" style={{ width: `${weights.daysOnMarket}%` }} />
                    <div className="bg-emerald-500 transition-all duration-200" style={{ width: `${weights.regulationStatus}%` }} />
                    <div className="bg-purple-500 transition-all duration-200" style={{ width: `${weights.neighborhoodSaturation}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-xs font-bold font-mono-data ${isValid ? 'text-success' : 'text-warning'}`}>
                      {total}% total {isValid ? '✓' : ''}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {[
                        { label: 'Price', color: 'bg-blue-500' },
                        { label: 'DOM', color: 'bg-amber-500' },
                        { label: 'Reg', color: 'bg-emerald-500' },
                        { label: 'Sat', color: 'bg-purple-500' },
                      ].map(item => (
                        <span key={item.label} className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${item.color}`} />
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'thresholds' && (
              <div className="bg-card rounded-xl border border-border p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Score Thresholds</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Breakpoints that trigger score tier changes</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Days on Market</p>
                    <div className="space-y-3 pl-2 border-l-2 border-amber-500/30">
                      <ThresholdInput
                        label="Motivated Seller"
                        value={thresholds.domMotivated}
                        unit="days"
                        min={1}
                        max={thresholds.domStale - 1}
                        onChange={v => setThresholds(t => ({ ...t, domMotivated: v }))}
                        hint="Listings sitting this long signal motivated sellers"
                      />
                      <ThresholdInput
                        label="Stale Listing"
                        value={thresholds.domStale}
                        unit="days"
                        min={thresholds.domMotivated + 1}
                        max={365}
                        onChange={v => setThresholds(t => ({ ...t, domStale: v }))}
                        hint="Max score for days on market"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Price Competitiveness</p>
                    <div className="pl-2 border-l-2 border-blue-500/30">
                      <ThresholdInput
                        label="Competitive Band"
                        value={thresholds.priceCompetitivePct}
                        unit="% below avg"
                        min={1}
                        max={50}
                        onChange={v => setThresholds(t => ({ ...t, priceCompetitivePct: v }))}
                        hint="% below market average to be considered competitive"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Neighborhood Saturation</p>
                    <div className="space-y-3 pl-2 border-l-2 border-purple-500/30">
                      <ThresholdInput
                        label="Low Saturation"
                        value={thresholds.saturationLow}
                        unit="% STR density"
                        min={1}
                        max={thresholds.saturationHigh - 1}
                        onChange={v => setThresholds(t => ({ ...t, saturationLow: v }))}
                        hint="Below this = underserved market (high score)"
                      />
                      <ThresholdInput
                        label="High Saturation"
                        value={thresholds.saturationHigh}
                        unit="% STR density"
                        min={thresholds.saturationLow + 1}
                        max={100}
                        onChange={v => setThresholds(t => ({ ...t, saturationHigh: v }))}
                        hint="Above this = oversaturated (low score)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How scoring works */}
            <div className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Info size={13} className="text-primary" />
                <h3 className="text-xs font-semibold text-foreground">How Simulation Works</h3>
              </div>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>Scores are recalculated live using your adjusted weights and thresholds</li>
                <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>Δ column shows the change vs. each lead&apos;s current stored score</li>
                <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>Rankings update in real-time as you move sliders</li>
                <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>Changes here are preview-only — go to Tools → Scoring Rules to apply permanently</li>
              </ul>
            </div>
          </div>

          {/* Right: Lead rankings */}
          <div className="xl:col-span-3">
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <BarChart3 size={15} className="text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Lead Rankings Preview</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                    {leads.length} leads
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSortBy('new')}
                    className={`flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium transition-all min-h-[44px] sm:min-h-0 ${sortBy === 'new' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ChevronDown size={11} />Highest
                  </button>
                  <button
                    onClick={() => setSortBy('old')}
                    className={`flex items-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium transition-all min-h-[44px] sm:min-h-0 ${sortBy === 'old' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ChevronUp size={11} />Lowest
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <Zap size={36} className="text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">No leads to simulate</p>
                  <p className="text-xs text-muted-foreground mt-1">Add leads in Lead Management to see score simulations here.</p>
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-border bg-muted/30">
                    <div className="col-span-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">#</div>
                    <div className="col-span-5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Lead</div>
                    <div className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Current</div>
                    <div className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Simulated</div>
                    <div className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Δ Change</div>
                  </div>

                  <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                    {sorted.map((lead, idx) => (
                      <div key={lead.id} className="grid grid-cols-12 gap-2 items-center px-5 py-3 hover:bg-muted/20 transition-colors">
                        <div className="col-span-1">
                          <span className="text-xs font-mono-data text-muted-foreground">{idx + 1}</span>
                        </div>
                        <div className="col-span-5 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{lead.address}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {lead.city} · {lead.regulationStatus} · {lead.daysOnMarket}d
                          </p>
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <ScoreBadge score={lead.prospectScore} />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          <ScoreBadge score={lead.simScore} />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {lead.delta > 0 ? (
                            <span className="flex items-center gap-0.5 text-xs text-success font-semibold">
                              <TrendingUp size={11} />+{lead.delta}
                            </span>
                          ) : lead.delta < 0 ? (
                            <span className="flex items-center gap-0.5 text-xs text-danger font-semibold">
                              <TrendingDown size={11} />{lead.delta}
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Minus size={11} />0
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
