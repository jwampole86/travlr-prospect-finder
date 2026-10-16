'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, User } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AdminAuditEntry } from '../types';
import { categoryTone, formatDateHeading, formatRelativeTime, prettyLabel, sourceTone } from '../utils';

function DetailBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{value}</p>
    </div>
  );
}

export default function AuditTimeline({
  entries,
  emptyTitle,
  emptyHint,
}: {
  entries: AdminAuditEntry[];
  emptyTitle: string;
  emptyHint: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return entries.reduce<Record<string, AdminAuditEntry[]>>((acc, entry) => {
      const key = formatDateHeading(entry.timestamp);
      acc[key] = [...(acc[key] || []), entry];
      return acc;
    }, {});
  }, [entries]);

  return (
    <Panel title="Audit timeline" padded={false}>
      {entries.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={Clock} title={emptyTitle} hint={emptyHint} />
        </div>
      ) : (
        <div className="space-y-6 p-4">
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
                {dayEntries.map((entry) => {
                  const expanded = expandedId === `${entry.sourceTable}:${entry.id}`;
                  return (
                    <div key={`${entry.sourceTable}:${entry.id}`} className="rounded-2xl border border-border bg-card">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-3 p-4 text-left hover:bg-muted/20 lg:flex-row lg:items-start lg:justify-between"
                        onClick={() => setExpandedId(expanded ? null : `${entry.sourceTable}:${entry.id}`)}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={sourceTone(entry.sourceTable)}>{entry.sourceTable}</StatusPill>
                            <StatusPill tone={categoryTone(entry.category)}>{prettyLabel(entry.category)}</StatusPill>
                            <StatusPill tone="default">{prettyLabel(entry.eventType)}</StatusPill>
                            {entry.leadState && <StatusPill tone="default">{entry.leadState}</StatusPill>}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
                            {entry.summary && <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {(entry.leadAddress || entry.leadId) && <span>{entry.leadAddress || entry.leadId}</span>}
                            {entry.targetLabel && <span>Target: {entry.targetLabel}</span>}
                            {entry.actorName && <span className="inline-flex items-center gap-1"><User size={12} />{entry.actorName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground lg:flex-col lg:items-end">
                          <span>{formatRelativeTime(entry.timestamp)}</span>
                          <span>{new Date(entry.timestamp).toLocaleString()}</span>
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-border bg-muted/10 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <DetailBlock label="Before" value={entry.beforeValue} />
                            <DetailBlock label="After" value={entry.afterValue} />
                            <DetailBlock label="Reason" value={entry.reason} />
                            <DetailBlock label="Actor email" value={entry.actorEmail} />
                          </div>
                          {Object.keys(entry.metadata).length > 0 && (
                            <div className="mt-3 rounded-xl border border-border bg-card p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Metadata</p>
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">{JSON.stringify(entry.metadata, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
