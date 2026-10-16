import { EmptyState, StatusPill } from '@/components/ops';
import { Activity, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type { CohortInsight } from '../lib';

export default function CohortCards({ items }: { items: CohortInsight[] }) {
  if (items.length === 0) {
    return <EmptyState icon={Users} title="No cohorts available" hint="The page will surface cohorts once there is reliable live cadence evidence to segment." />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cohort</div>
              <h3 className="mt-1 text-base font-semibold text-foreground">{item.label}</h3>
            </div>
            <StatusPill tone={item.trend === 'up' ? 'success' : item.trend === 'down' ? 'warning' : 'default'} icon={item.trend === 'up' ? TrendingUp : item.trend === 'down' ? TrendingDown : Activity}>
              {item.trend}
            </StatusPill>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-bold tabular-nums text-foreground">{item.size.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Live records in this cohort</div>
            </div>
            <StatusPill tone="primary">{item.engagementLabel}</StatusPill>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{item.insight}</p>
        </article>
      ))}
    </div>
  );
}
