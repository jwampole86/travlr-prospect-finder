'use client';

import React from 'react';
import { DollarSign, Clock, Shield, MapPin } from 'lucide-react';
import type { ScoringWeights } from '../page';
import Icon from '@/components/ui/AppIcon';


interface Props {
  weights: ScoringWeights;
  onChange: (key: keyof ScoringWeights, value: number) => void;
}

const FACTORS = [
  {
    key: 'price' as keyof ScoringWeights,
    label: 'Price Competitiveness',
    icon: DollarSign,
    color: 'text-blue-500',
    trackColor: 'bg-blue-500',
    description: 'How much the listing price relative to market average affects the score. Lower price = higher score.',
    lowLabel: 'Less weight on price',
    highLabel: 'Price-driven scoring',
    tips: [
      'High weight: ideal for budget-focused strategies',
      'Low weight: prioritize quality over price',
    ],
  },
  {
    key: 'daysOnMarket' as keyof ScoringWeights,
    label: 'Days on Market',
    icon: Clock,
    color: 'text-amber-500',
    trackColor: 'bg-amber-500',
    description: 'Listings sitting longer signal motivated sellers or undervalued properties — the longer on market, the better the lead. More days = higher score.',
    lowLabel: 'Ignore listing age',
    highLabel: 'Motivated-seller scoring',
    tips: [
      'High weight: target motivated sellers with long-stale listings',
      'Low weight: focus on fresh inventory and market timing',
    ],
  },
  {
    key: 'regulationStatus' as keyof ScoringWeights,
    label: 'Regulation Status',
    icon: Shield,
    color: 'text-emerald-500',
    trackColor: 'bg-emerald-500',
    description: 'STR-friendly regulation status (Allowed > Restricted > Pending > Banned). Directly impacts viability.',
    lowLabel: 'Regulation less critical',
    highLabel: 'Compliance-first scoring',
    tips: [
      'High weight: risk-averse operators',
      'Low weight: willing to navigate complex markets',
    ],
  },
  {
    key: 'neighborhoodSaturation' as keyof ScoringWeights,
    label: 'Neighborhood Saturation',
    icon: MapPin,
    color: 'text-purple-500',
    trackColor: 'bg-purple-500',
    description: 'Areas with fewer competing STRs offer better occupancy potential. Lower saturation = higher score.',
    lowLabel: 'Saturation less critical',
    highLabel: 'Market gap scoring',
    tips: [
      'High weight: find underserved neighborhoods',
      'Low weight: proven markets matter more',
    ],
  },
];

export default function ScoringRulesEditor({ weights, onChange }: Props) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Weight Configuration</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Drag each slider to set how much each factor contributes to the final prospect score.</p>
      </div>

      <div className="space-y-7">
        {FACTORS.map((factor) => {
          const Icon = factor.icon;
          const value = weights[factor.key];
          const pct = value;

          return (
            <div key={factor.key} className="space-y-2">
              {/* Label row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`p-1.5 rounded-md bg-muted ${factor.color}`}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{factor.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 max-w-xs">{factor.description}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-2xl font-bold text-foreground font-mono-data">{value}</span>
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              {/* Slider */}
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  onChange={(e) => onChange(factor.key, parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted"
                  style={{
                    background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${pct}%, var(--color-muted) ${pct}%, var(--color-muted) 100%)`,
                  }}
                />
              </div>

              {/* Range labels */}
              <div className="flex justify-between text-[10px] text-muted-foreground/70">
                <span>{factor.lowLabel}</span>
                <span>{factor.highLabel}</span>
              </div>

              {/* Tips */}
              <div className="flex gap-3 flex-wrap">
                {factor.tips.map((tip, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    {tip}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
