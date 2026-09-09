'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ScoringWeights } from '../page';

interface Props {
  weights: ScoringWeights;
}

// Sample leads to preview scoring impact
const SAMPLE_LEADS = [
  {
    id: 'p1',
    address: '1420 Blake St, Denver CO',
    price: 1800,
    marketAvg: 2400,
    daysOnMarket: 3,
    regulation: 'Allowed',
    saturation: 'Low',
  },
  {
    id: 'p2',
    address: '3305 Colfax Ave, Denver CO',
    price: 2200,
    marketAvg: 2300,
    daysOnMarket: 21,
    regulation: 'Restricted',
    saturation: 'Medium',
  },
  {
    id: 'p3',
    address: '890 Broadway, Denver CO',
    price: 3100,
    marketAvg: 2800,
    daysOnMarket: 45,
    regulation: 'Pending',
    saturation: 'High',
  },
  {
    id: 'p4',
    address: '512 Larimer St, Denver CO',
    price: 1600,
    marketAvg: 2100,
    daysOnMarket: 8,
    regulation: 'Allowed',
    saturation: 'Low',
  },
  {
    id: 'p5',
    address: '2200 Speer Blvd, Denver CO',
    price: 2800,
    marketAvg: 2600,
    daysOnMarket: 60,
    regulation: 'Banned',
    saturation: 'High',
  },
];

function computeScore(lead: typeof SAMPLE_LEADS[0], weights: ScoringWeights): number {
  // Price score: below market = higher score (competitive pricing)
  const priceRatio = lead.marketAvg > 0 ? lead.price / lead.marketAvg : 1;
  const priceScore = Math.max(0, Math.min(100, Math.round((2 - priceRatio) * 100)));

  // DOM score: LONGER on market = HIGHER score
  // Listings sitting 60+ days signal motivated sellers / undervalued properties
  // Scale: 0 days → 0 pts, 30 days → ~50 pts, 60 days → ~83 pts, 90+ days → 100 pts
  const domScore = Math.max(0, Math.min(100, Math.round((lead.daysOnMarket / 90) * 100)));

  // Regulation score: STR-friendly status directly impacts viability
  const regMap: Record<string, number> = { Allowed: 100, Restricted: 65, Pending: 35, Banned: 0, Unknown: 20 };
  const regScore = regMap[lead.regulation] ?? 20;

  // Saturation score: fewer competing STRs = better occupancy potential
  const satMap: Record<string, number> = { Low: 100, Medium: 60, High: 20 };
  const satScore = satMap[lead.saturation] ?? 50;

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

const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 30,
  daysOnMarket: 25,
  regulationStatus: 30,
  neighborhoodSaturation: 15,
};

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

export default function ScoringPreview({ weights }: Props) {
  const leads = SAMPLE_LEADS.map((l) => ({
    ...l,
    currentScore: computeScore(l, weights),
    defaultScore: computeScore(l, DEFAULT_WEIGHTS),
  }));

  // Sort by current score desc
  const sorted = [...leads].sort((a, b) => b.currentScore - a.currentScore);

  return (
    <div className="space-y-4">
      {/* Live preview card */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Score Preview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">How sample leads rank with your current weights</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
            Live
          </span>
        </div>

        <div className="space-y-2.5">
          {sorted.map((lead) => {
            const delta = lead.currentScore - lead.defaultScore;
            return (
              <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                <ScoreBadge score={lead.currentScore} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{lead.address}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {lead.regulation} · {lead.saturation} sat · {lead.daysOnMarket}d on market
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {delta > 0 ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-success font-medium">
                      <TrendingUp size={10} />+{delta}
                    </span>
                  ) : delta < 0 ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-danger font-medium">
                      <TrendingDown size={10} />{delta}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Minus size={10} />0
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground mt-3 text-center">
          Δ = change vs. default weights
        </p>
      </div>

      {/* Weight breakdown donut-style bar */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Weight Distribution</h2>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          <div className="bg-blue-500 transition-all duration-300" style={{ width: `${weights.price}%` }} title={`Price: ${weights.price}%`} />
          <div className="bg-amber-500 transition-all duration-300" style={{ width: `${weights.daysOnMarket}%` }} title={`DOM: ${weights.daysOnMarket}%`} />
          <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${weights.regulationStatus}%` }} title={`Regulation: ${weights.regulationStatus}%`} />
          <div className="bg-purple-500 transition-all duration-300" style={{ width: `${weights.neighborhoodSaturation}%` }} title={`Saturation: ${weights.neighborhoodSaturation}%`} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
          {[
            { label: 'Price', value: weights.price, color: 'bg-blue-500' },
            { label: 'Days on Market', value: weights.daysOnMarket, color: 'bg-amber-500' },
            { label: 'Regulation', value: weights.regulationStatus, color: 'bg-emerald-500' },
            { label: 'Saturation', value: weights.neighborhoodSaturation, color: 'bg-purple-500' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
              <span className="text-[11px] text-muted-foreground flex-1 truncate">{item.label}</span>
              <span className="text-[11px] font-semibold text-foreground font-mono-data">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
