'use client';

import React from 'react';
import { History, Radio, Waves } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import { formatDuration, formatOutcomeLabel, formatRelativeTime } from '../data';
import type { AnalyticsSession } from '../data';

function outcomeTone(outcome: string | null): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (!outcome) return 'default';
  if (['interested', 'proposal_conversation'].includes(outcome)) return 'success';
  if (['callback', 'questionnaire_sent', 'follow_up_scheduled'].includes(outcome)) return 'primary';
  if (['voicemail', 'no_answer', 'busy'].includes(outcome)) return 'warning';
  if (['failed', 'not_interested'].includes(outcome)) return 'danger';
  return 'default';
}

export default function RecentCallsTable({ calls }: { calls: AnalyticsSession[] }) {
  return (
    <Panel title="Recent call sessions" icon={History} padded={false}>
      {calls.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={History}
            title="No sessions found"
            hint="Recent sessions will appear here once call records exist in the selected range."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Started</th>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-left font-medium">Outcome</th>
                <th className="px-4 py-3 text-right font-medium">Duration</th>
                <th className="px-4 py-3 text-right font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-t border-border/70 align-top">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-foreground">{new Date(call.startedAt).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(call.startedAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{call.agentName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={outcomeTone(call.outcome)}>{formatOutcomeLabel(call.outcome)}</StatusPill>
                      {call.isInProgress && <StatusPill tone="primary" icon={Radio}>In progress</StatusPill>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatDuration(call.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {call.recordingUrl && <StatusPill tone="primary" icon={Waves}>Recording</StatusPill>}
                      {call.hasTranscript && <StatusPill tone="success">Transcript</StatusPill>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
