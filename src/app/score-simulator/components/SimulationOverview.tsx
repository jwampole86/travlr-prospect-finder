'use client';

import React from 'react';
import { BarChart3, Layers3, TrendingUp } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { SimulatedLeadRow } from './types';

const TONES: Record<string, 'success' | 'primary' | 'warning' | 'default' | 'danger'> = {
  hot: 'success',
  warm: 'primary',
  nurture: 'warning',
  cold: 'default',
  blocked: 'danger',
};

const BAND_ORDER = ['hot', 'warm', 'nurture', 'cold', 'blocked'] as const;

export default function SimulationOverview({ rows }: { rows: SimulatedLeadRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={BarChart3} title="No sample leads loaded" hint="Load a live lead sample to compare baseline and simulated scores." />;
  }

  const factorMap = new Map<string, { total: number; count: number }>();
  rows.forEach((row) => {
    row.simulated.factors.forEach((factor) => {
      const current = factorMap.get(factor.label) ?? { total: 0, count: 0 };
      factorMap.set(factor.label, { total: current.total + factor.weightedPoints, count: current.count + 1 });
    });
  });

  const factorRows = Array.from(factorMap.entries())
    .map(([label, meta]) => ({ label, value: meta.count ? meta.total / meta.count : 0 }))
    .sort((a, b) => b.value - a.value);

  const distribution = BAND_ORDER.map((band) => {
    const baseline = rows.filter((row) => row.baseline.band === band).length;
    const simulated = rows.filter((row) => row.simulated.band === band).length;
    const max = Math.max(rows.length, 1);
    return {
      band,
      baseline,
      simulated,
      baselineWidth: `${Math.max(6, Math.round((baseline / max) * 100))}%`,
      simulatedWidth: `${Math.max(6, Math.round((simulated / max) * 100))}%`,
    };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Average factor contribution" icon={Layers3}>
        <div className="space-y-3">
          {factorRows.map((factor, index) => (
            <div key={factor.label} className="rounded-2xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{factor.label}</p>
                  <p className="text-[11px] text-muted-foreground">Average weighted points in the simulated preview.</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-foreground">{factor.value.toFixed(1)}</p>
                  {index === 0 && <StatusPill tone="primary">Top driver</StatusPill>}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, factor.value)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Band mix" icon={TrendingUp}>
        <div className="space-y-4">
          {distribution.map((item) => (
            <div key={item.band} className="rounded-2xl border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusPill tone={TONES[item.band]}>{item.band}</StatusPill>
                  <span className="text-xs text-muted-foreground">Baseline {item.baseline} → Simulated {item.simulated}</span>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">Δ {item.simulated - item.baseline >= 0 ? '+' : ''}{item.simulated - item.baseline}</span>
              </div>
              <div className="mt-3 space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Baseline</span>
                    <span>{item.baseline}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: item.baselineWidth }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Simulated</span>
                    <span>{item.simulated}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: item.simulatedWidth }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
