'use client';

import { AlertTriangle, Clock3, Database } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AnomalyEntry, SourceBreakdown } from './types';

function formatRelativeTime(iso: string | null) {
  if (!iso) return 'Never';
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  return rtf.format(Math.round(diffHours / 24), 'day');
}

export default function SourceBreakdownPanels({
  sourceBreakdown,
  anomalies,
}: {
  sourceBreakdown: SourceBreakdown[];
  anomalies: AnomalyEntry[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Source freshness and quality" icon={Database} className="rounded-2xl">
        {sourceBreakdown.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="No source activity"
            hint="The live database has not logged any enrichment validation events for the selected window."
          />
        ) : (
          <div className="space-y-3">
            {sourceBreakdown.map((source) => (
              <div key={source.source} className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{source.source}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last validated {formatRelativeTime(source.lastValidated)} ·{' '}
                      {source.total.toLocaleString()} logged validation
                      {source.total === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      tone={
                        source.passRate >= 80
                          ? 'success'
                          : source.passRate >= 60
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      Pass rate {source.passRate}%
                    </StatusPill>
                    <StatusPill tone="default">Cache hits {source.cacheHits}</StatusPill>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Metric label="Avg confidence" value={source.avgConfidence} />
                  <Metric label="Passed" value={source.passed} tone="success" />
                  <Metric label="Failed" value={source.failed} tone="danger" />
                  <Metric label="Cache hits" value={source.cacheHits} tone="primary" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Top anomalies" icon={AlertTriangle} className="rounded-2xl">
        {anomalies.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No anomalies were recorded"
            hint="This page only shows real anomaly strings captured in validation events."
          />
        ) : (
          <div className="space-y-3">
            {anomalies.map((anomaly) => {
              const maxCount = anomalies[0]?.count || 1;
              const width = Math.max(8, Math.round((anomaly.count / maxCount) * 100));
              return (
                <div
                  key={anomaly.anomaly}
                  className="rounded-2xl border border-border bg-muted/20 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">{anomaly.anomaly}</div>
                    <StatusPill tone="warning">{anomaly.count}</StatusPill>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-warning"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'primary' | 'success' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'primary'
          ? 'text-primary'
          : 'text-foreground';

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
