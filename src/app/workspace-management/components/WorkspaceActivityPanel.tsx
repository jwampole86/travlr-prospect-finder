import { Activity, MoreHorizontal } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { WorkspaceActivityItem } from '../types';
import { formatDateTime, formatRelativeTime, getActivityTypeLabel } from '../utils';

export default function WorkspaceActivityPanel({
  activity,
  filter,
  onFilterChange,
}: {
  activity: WorkspaceActivityItem[];
  filter: string;
  onFilterChange: (value: string) => void;
}) {
  const types = [...new Set(activity.map((item) => item.type))].sort();
  const filtered = filter === 'all' ? activity : activity.filter((item) => item.type === filter);

  return (
    <Panel title="Recent workspace activity" icon={Activity}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onFilterChange('all')} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            All
          </button>
          {types.map((type) => (
            <button key={type} type="button" onClick={() => onFilterChange(type)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {type.replaceAll('_', ' ')}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={MoreHorizontal} title="No activity for this filter" hint="This feed only shows real events pulled from activity_events and invite records." />
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {filtered.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{getActivityTypeLabel(item)}</p>
                    <StatusPill>{item.source}</StatusPill>
                    {item.stateCode && <StatusPill tone="primary">{item.stateCode}</StatusPill>}
                  </div>
                  <p className="text-sm text-foreground">{item.title}</p>
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                  <p className="text-xs text-muted-foreground">{item.actorName}{item.actorEmail ? ` • ${item.actorEmail}` : ''}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{formatRelativeTime(item.timestamp)}</div>
                  <div>{formatDateTime(item.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
