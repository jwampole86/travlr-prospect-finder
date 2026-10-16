import React from 'react';
import { EmptyState } from '@/components/ops';
import { BarChart3 } from 'lucide-react';
import type { BreakdownRow } from '../reporting';

export default function BreakdownList({ rows, emptyHint }: { rows: BreakdownRow[]; emptyHint: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={BarChart3} title="No data available" hint={emptyHint} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{row.value.toLocaleString()} · {row.percentage}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(row.percentage, row.percentage === 0 ? 0 : 6)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
