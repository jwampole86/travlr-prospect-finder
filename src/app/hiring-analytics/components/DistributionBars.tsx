import React from 'react';
import { EmptyState, StatusPill } from '@/components/ops';
import { BarChart3 } from 'lucide-react';

export interface DistributionDatum {
  label: string;
  value: number;
  tone: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  hint?: string;
}

const TONE_BAR: Record<DistributionDatum['tone'], string> = {
  default: 'bg-muted-foreground/30',
  primary: 'bg-primary/80',
  success: 'bg-success/80',
  warning: 'bg-warning/80',
  danger: 'bg-danger/80',
};

export default function DistributionBars({
  rows,
  emptyTitle,
  emptyHint,
}: {
  rows: DistributionDatum[];
  emptyTitle: string;
  emptyHint: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);

  if (max === 0) {
    return <EmptyState icon={BarChart3} title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-foreground">{row.label}</div>
              {row.hint && <div className="text-xs text-muted-foreground">{row.hint}</div>}
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <StatusPill tone={row.tone}>{row.value}</StatusPill>
              <span className="text-xs text-muted-foreground">{Math.round((row.value / max) * 100)}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className={`h-2 rounded-full ${TONE_BAR[row.tone]}`} style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
