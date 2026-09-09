'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ScoringWeights } from '../page';
import { calculateProspectScore, DEFAULT_PROSPECT_SCORING_WEIGHTS } from '@/lib/scoring/prospectScoring';

interface Props {
  weights: ScoringWeights;
}

// Sample leads to preview scoring impact
const SAMPLE_LEADS = [
  {
    id: 'p1',
    address: '1420 Blake St, Denver CO',
    estimatedNetMonthly: 7600,
    beds: 4,
    baths: 3,
    daysOnMarket: 3,
    regulationStatus: 'Allowed',
    verifiedOwner: true,
    verifiedNumber: true,
    verifiedAddress: true,
    smsReplies: 1,
  },
  {
    id: 'p2',
    address: '3305 Colfax Ave, Denver CO',
    estimatedNetMonthly: 4200,
    beds: 3,
    baths: 2,
    daysOnMarket: 21,
    regulationStatus: 'Restricted',
    verifiedOwner: true,
    verifiedNumber: true,
    verifiedAddress: true,
    emailClicks: 1,
  },
  {
    id: 'p3',
    address: '890 Broadway, Denver CO',
    estimatedNetMonthly: 2400,
    beds: 1,
    baths: 1,
    daysOnMarket: 45,
    regulationStatus: 'Unknown',
    verifiedOwner: false,
    verifiedNumber: false,
    verifiedAddress: false,
  },
  {
    id: 'p4',
    address: '512 Larimer St, Denver CO',
    estimatedNetMonthly: 5800,
    beds: 2,
    baths: 2,
    daysOnMarket: 8,
    regulationStatus: 'Allowed',
    verifiedOwner: true,
    verifiedNumber: false,
    verifiedAddress: true,
  },
  {
    id: 'p5',
    address: '2200 Speer Blvd, Denver CO',
    estimatedNetMonthly: 9000,
    beds: 5,
    baths: 4,
    daysOnMarket: 60,
    regulationStatus: 'Prohibited',
    verifiedOwner: true,
    verifiedNumber: true,
    verifiedAddress: true,
  },
];

function computeScore(lead: typeof SAMPLE_LEADS[0], weights: ScoringWeights): number {
  return calculateProspectScore(lead, weights).score;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  ...DEFAULT_PROSPECT_SCORING_WEIGHTS,
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
                    {lead.regulationStatus} · {lead.beds}bd/{lead.baths}ba · ${lead.estimatedNetMonthly.toLocaleString()}/mo · {lead.daysOnMarket}d
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
          <div className="bg-blue-500 transition-all duration-300" style={{ width: `${weights.revenuePotential}%` }} title={`Revenue: ${weights.revenuePotential}%`} />
          <div className="bg-amber-500 transition-all duration-300" style={{ width: `${weights.propertyFit}%` }} title={`Property Fit: ${weights.propertyFit}%`} />
          <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${weights.regulatoryFeasibility}%` }} title={`Regulation: ${weights.regulatoryFeasibility}%`} />
          <div className="bg-purple-500 transition-all duration-300" style={{ width: `${weights.leadQuality}%` }} title={`Lead Quality: ${weights.leadQuality}%`} />
          <div className="bg-rose-500 transition-all duration-300" style={{ width: `${weights.engagement}%` }} title={`Engagement: ${weights.engagement}%`} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
          {[
            { label: 'Revenue', value: weights.revenuePotential, color: 'bg-blue-500' },
            { label: 'Property Fit', value: weights.propertyFit, color: 'bg-amber-500' },
            { label: 'Regulation', value: weights.regulatoryFeasibility, color: 'bg-emerald-500' },
            { label: 'Lead Quality', value: weights.leadQuality, color: 'bg-purple-500' },
            { label: 'Engagement', value: weights.engagement, color: 'bg-rose-500' },
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
