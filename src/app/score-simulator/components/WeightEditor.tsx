'use client';

import React from 'react';
import { RotateCcw, Scale, SlidersHorizontal } from 'lucide-react';
import { Panel, StatusPill, buttonSecondary } from '@/components/ops';
import type { WeightConfig } from './types';

const FACTORS: Array<{
  key: keyof WeightConfig;
  label: string;
  hint: string;
  accent: string;
}> = [
  {
    key: 'revenuePotential',
    label: 'Revenue potential',
    hint: 'Monthly STR opportunity, ADR, and luxury upside.',
    accent: 'bg-sky-500',
  },
  {
    key: 'propertyFit',
    label: 'Property fit',
    hint: 'Bedroom / bath profile and private-home suitability.',
    accent: 'bg-amber-500',
  },
  {
    key: 'regulatoryFeasibility',
    label: 'Regulatory feasibility',
    hint: 'Allowed beats restricted; prohibited markets are blocked.',
    accent: 'bg-emerald-500',
  },
  {
    key: 'leadQuality',
    label: 'Lead quality',
    hint: 'Owner, address, and phone verification readiness.',
    accent: 'bg-violet-500',
  },
  {
    key: 'engagement',
    label: 'Engagement & freshness',
    hint: 'Replies, clicks, answered calls, and recency.',
    accent: 'bg-rose-500',
  },
];

function percent(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export default function WeightEditor({
  weights,
  defaults,
  onChange,
  onReset,
}: {
  weights: WeightConfig;
  defaults: WeightConfig;
  onChange: (weights: WeightConfig) => void;
  onReset: () => void;
}) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return (
    <Panel
      title="Factor weights"
      icon={SlidersHorizontal}
      actions={
        <button type="button" onClick={onReset} className={buttonSecondary}>
          <RotateCcw size={14} /> Reset
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone={total > 0 ? 'success' : 'warning'} icon={Scale}>
            {total} total points
          </StatusPill>
          <span>
            The v4-live-signals model normalizes weights automatically, so this simulator previews <strong className="text-foreground">relative emphasis</strong>, not raw score inflation.
          </span>
        </div>

        <div className="space-y-4">
          {FACTORS.map((factor) => {
            const value = weights[factor.key];
            const defaultValue = defaults[factor.key];
            return (
              <div key={factor.key} className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${factor.accent}`} />
                      <h3 className="text-sm font-semibold text-foreground">{factor.label}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{factor.hint}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <StatusPill tone="default">Default {defaultValue}</StatusPill>
                    <StatusPill tone={value === defaultValue ? 'default' : value > defaultValue ? 'primary' : 'warning'}>
                      Share {percent(value, total)}
                    </StatusPill>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={value}
                    onChange={(event) => onChange({ ...weights, [factor.key]: Number(event.target.value) })}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  />
                  <label className="flex min-w-[112px] items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground">
                    <span className="text-xs text-muted-foreground">Weight</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={value}
                      onChange={(event) => onChange({ ...weights, [factor.key]: Math.max(0, Math.min(50, Number(event.target.value) || 0)) })}
                      className="w-12 border-0 bg-transparent text-right tabular-nums focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
