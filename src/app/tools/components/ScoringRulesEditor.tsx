'use client';

import React from 'react';
import { DollarSign, Home, Shield, Phone, Activity } from 'lucide-react';
import type { ScoringWeights } from '../page';
import Icon from '@/components/ui/AppIcon';


interface Props {
  weights: ScoringWeights;
  onChange: (key: keyof ScoringWeights, value: number) => void;
}

const FACTORS = [
  {
    key: 'revenuePotential' as keyof ScoringWeights,
    label: 'Revenue Potential',
    icon: DollarSign,
    color: 'text-blue-500',
    trackColor: 'bg-blue-500',
    description: 'Estimated net/gross monthly opportunity. Higher revenue and luxury opportunities score better.',
    lowLabel: 'Less weight on revenue',
    highLabel: 'Revenue-driven scoring',
    tips: [
      'High weight: prioritize biggest owner-income opportunities',
      'Low weight: balance revenue against readiness and compliance',
    ],
  },
  {
    key: 'propertyFit' as keyof ScoringWeights,
    label: 'Property Fit',
    icon: Home,
    color: 'text-amber-500',
    trackColor: 'bg-amber-500',
    description: 'Bedroom/bath count and property type fit for luxury STR demand. Larger private homes score best.',
    lowLabel: 'Less weight on fit',
    highLabel: 'Property-fit scoring',
    tips: [
      'High weight: emphasize homes that naturally work for STR guests',
      'Low weight: let engagement or verification drive priority',
    ],
  },
  {
    key: 'regulatoryFeasibility' as keyof ScoringWeights,
    label: 'Regulatory Feasibility',
    icon: Shield,
    color: 'text-emerald-500',
    trackColor: 'bg-emerald-500',
    description: 'STR feasibility based on local rules. Allowed and manageable restricted markets score above unknown/prohibited markets.',
    lowLabel: 'Regulation less critical',
    highLabel: 'Compliance-first scoring',
    tips: [
      'High weight: risk-averse operators',
      'Low weight: willing to navigate complex markets',
    ],
  },
  {
    key: 'leadQuality' as keyof ScoringWeights,
    label: 'Lead Quality',
    icon: Phone,
    color: 'text-purple-500',
    trackColor: 'bg-purple-500',
    description: 'Owner, address, and phone verification quality. Fully verified leads are safer and faster to work.',
    lowLabel: 'Quality less critical',
    highLabel: 'Verification-first scoring',
    tips: [
      'High weight: prioritize verified, callable prospects',
      'Low weight: accept more research before outreach',
    ],
  },
  {
    key: 'engagement' as keyof ScoringWeights,
    label: 'Engagement & Freshness',
    icon: Activity,
    color: 'text-rose-500',
    trackColor: 'bg-rose-500',
    description: 'SMS replies, callbacks, email clicks, answered calls, stage progress, and freshness. Active responses raise urgency.',
    lowLabel: 'Engagement less critical',
    highLabel: 'Response-driven scoring',
    tips: [
      'High weight: focus agents on warm/responding homeowners',
      'Low weight: keep top-of-funnel prospecting broader',
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
