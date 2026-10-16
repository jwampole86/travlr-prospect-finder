import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ops';
import type { TrendPoint } from '../lib';

export default function TrendPanel({ points }: { points: TrendPoint[] }) {
  const max = Math.max(0, ...points.flatMap((point) => [point.enrollments, point.sends, point.completions, point.escalations]));

  if (max === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No cadence activity yet"
        hint="cadence_enrollments and cadence_send_log are currently empty, so there is no weekly performance trend to chart yet."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendChip label="Enrollments" className="bg-primary/15 text-primary" />
        <LegendChip label="Sends" className="bg-success/15 text-success" />
        <LegendChip label="Completions" className="bg-warning/15 text-warning" />
        <LegendChip label="Escalations" className="bg-danger/15 text-danger" />
      </div>

      <div className="space-y-3">
        {points.map((point) => (
          <div key={point.weekLabel} className="grid grid-cols-[72px_1fr] items-center gap-3">
            <div className="text-xs font-medium text-muted-foreground">{point.weekLabel}</div>
            <div className="space-y-1.5">
              <MetricBar label="Enrollments" tone="bg-primary" value={point.enrollments} max={max} />
              <MetricBar label="Sends" tone="bg-success" value={point.sends} max={max} />
              <MetricBar label="Completions" tone="bg-warning" value={point.completions} max={max} />
              <MetricBar label="Escalations" tone="bg-danger" value={point.escalations} max={max} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricBar({ label, tone, value, max }: { label: string; tone: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 6 : 0, Math.round((value / max) * 100)) : 0;

  return (
    <div className="grid grid-cols-[84px_1fr_40px] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-right font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function LegendChip({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${className}`}>{label}</span>;
}
