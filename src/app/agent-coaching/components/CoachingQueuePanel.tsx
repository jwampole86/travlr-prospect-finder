'use client';

import React from 'react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import { AlertTriangle, Headphones, MessageSquare } from 'lucide-react';
import { formatDuration, formatRelativeTime, type CoachingQueueItem } from '../data';

function tone(priority: CoachingQueueItem['priority']): 'warning' | 'danger' | 'primary' {
  if (priority === 'escalated') return 'danger';
  if (priority === 'coaching') return 'warning';
  return 'primary';
}

export default function CoachingQueuePanel({ items }: { items: CoachingQueueItem[] }) {
  return (
    <Panel title="Coaching queue" icon={AlertTriangle}>
      {items.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No coaching queue items" hint="Sessions flagged in call_sessions or low scored rows will appear here." />
      ) : (
        <div className="space-y-3">
          {items.slice(0, 8).map((item) => (
            <div key={item.sessionId} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{item.agentName}</p>
                    <StatusPill tone={tone(item.priority)}>{item.reason}</StatusPill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.startedAt).toLocaleString()} · {formatRelativeTime(item.startedAt)} · {formatDuration(item.durationSeconds)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {item.recordingUrl && <StatusPill tone="primary" icon={Headphones}>Recording</StatusPill>}
                  {item.coachingNotes && <StatusPill tone="success" icon={MessageSquare}>Has note</StatusPill>}
                </div>
              </div>
              {item.overallScore !== null && (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Overall', value: item.overallScore },
                    { label: 'Pace', value: item.paceScore },
                    { label: 'Objections', value: item.objectionScore },
                    { label: 'Rapport', value: item.rapportScore },
                  ].map((score) => (
                    <div key={score.label} className="rounded-xl border border-border bg-card p-3">
                      <div className="text-[11px] text-muted-foreground">{score.label}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{score.value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
