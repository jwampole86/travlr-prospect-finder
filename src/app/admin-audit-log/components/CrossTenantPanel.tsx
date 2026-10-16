import React from 'react';
import { Globe } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AdminAuditEntry, AuditSourceStat } from '../types';

export default function CrossTenantPanel({ entries, sourceStats }: { entries: AdminAuditEntry[]; sourceStats: AuditSourceStat[] }) {
  return (
    <Panel title="Cross-tenant access" icon={Globe}>
      {entries.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No cross-tenant audit rows were found"
          hint="The current live audit tables do not contain rows mentioning cross-tenant or org-boundary access. This page now shows that gap honestly instead of fabricating boundary events."
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={`${entry.sourceTable}:${entry.id}`} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="warning">{entry.sourceTable}</StatusPill>
                <StatusPill tone="default">{entry.eventType}</StatusPill>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-foreground">{entry.title}</h3>
              {entry.summary && <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monitored sources</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceStats.map((source) => (
            <StatusPill key={source.sourceTable} tone={source.count > 0 ? 'default' : 'warning'}>
              {source.label}: {source.count}
            </StatusPill>
          ))}
        </div>
      </div>
    </Panel>
  );
}
