import React from 'react';
import { Database, Info } from 'lucide-react';
import { Panel, StatusPill } from '@/components/ops';
import type { AuditSourceStat } from '../types';
import { formatRelativeTime, sourceTone } from '../utils';

export default function AuditSourcesPanel({ sourceStats }: { sourceStats: AuditSourceStat[] }) {
  return (
    <Panel title="Audit source health" icon={Database}>
      <div className="space-y-3">
        {sourceStats.map((source) => (
          <div key={source.sourceTable} className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{source.label}</p>
                  <StatusPill tone={sourceTone(source.sourceTable)}>{source.count > 0 ? 'populated' : 'empty'}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{source.description}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums text-foreground">{source.count}</p>
                <p className="text-xs text-muted-foreground">rows</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Info size={12} />
              {source.lastSeenAt ? `Last row ${formatRelativeTime(source.lastSeenAt)} (${new Date(source.lastSeenAt).toLocaleString()})` : 'No rows recorded yet'}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
