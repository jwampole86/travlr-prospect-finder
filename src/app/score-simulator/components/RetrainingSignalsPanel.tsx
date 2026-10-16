'use client';

import React from 'react';
import { BrainCircuit, Database } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { RegionalSignalRow } from './types';

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function timeAgo(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Unknown';
  const diffHours = Math.round((Date.now() - parsed) / 3_600_000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export default function RetrainingSignalsPanel({ rows }: { rows: RegionalSignalRow[] }) {
  return (
    <Panel title="Retraining signals" icon={BrainCircuit}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Live <code className="rounded bg-muted px-1 py-0.5 text-[11px]">score_weight_signals</code> rows inform retraining research only. They do <strong className="text-foreground">not</strong> override the v4-live-signals weights used in production today.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No conversion feedback yet"
            hint="The live database currently has zero score_weight_signals rows, so this simulator uses the shared production defaults from the scoring library."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={`${row.region}-${row.property_type}`} className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{row.region} · {row.property_type}</h3>
                      <StatusPill tone="primary">{row.sample_count} samples</StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {timeAgo(row.last_updated)}</p>
                  </div>
                  <StatusPill tone="success">Suggested threshold {row.suggested_threshold}</StatusPill>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Conversion rate</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{pct(row.conversion_rate)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Avg converted</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-success">{row.avg_converted_score}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Avg lost</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-danger">{row.avg_lost_score}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
