'use client';

import { AlertTriangle, Zap } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { RuleSeverity, ViolationSummary } from './types';

function severityTone(severity: string) {
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'primary' as const;
}

function formatRelativeTime(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  return rtf.format(Math.round(diffHours / 24), 'day');
}

export default function ViolationsSummaryPanel({ violations }: { violations: ViolationSummary[] }) {
  return (
    <Panel title="Recent violations" icon={Zap} className="rounded-2xl">
      {violations.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No rule violations recorded"
          hint="The live rules_engine_violations table is empty right now, so this page shows an honest empty state."
        />
      ) : (
        <div className="space-y-3">
          {violations.map((violation) => (
            <div
              key={violation.rule_name}
              className="rounded-2xl border border-border bg-muted/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{violation.rule_name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {violation.rule_type} · last triggered{' '}
                    {formatRelativeTime(violation.last_detected)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={severityTone(violation.severity)}>
                    {violation.severity as RuleSeverity}
                  </StatusPill>
                  <StatusPill tone="default">
                    {violation.count} violation{violation.count === 1 ? '' : 's'}
                  </StatusPill>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
