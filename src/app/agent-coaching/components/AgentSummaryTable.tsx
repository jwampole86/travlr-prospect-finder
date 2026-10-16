'use client';

import React from 'react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import { Award, Users } from 'lucide-react';
import { formatDuration, formatRelativeTime, type AgentCoachingSummary } from '../data';

export default function AgentSummaryTable({ rows }: { rows: AgentCoachingSummary[] }) {
  return (
    <Panel title="Agent coaching snapshot" icon={Users} padded={false}>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={Users} title="No agents with call activity" hint="Agent coaching metrics appear after call sessions are recorded in the selected range." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-right font-medium">Calls</th>
                <th className="px-4 py-3 text-right font-medium">Reviewed</th>
                <th className="px-4 py-3 text-right font-medium">Avg score</th>
                <th className="px-4 py-3 text-right font-medium">Avg duration</th>
                <th className="px-4 py-3 text-right font-medium">Last call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.agentId} className="border-t border-border/70">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{row.agentName}</div>
                      <div className="flex gap-2">
                        <StatusPill tone={row.flaggedCalls > 0 ? 'warning' : 'success'}>{row.flaggedCalls} flagged</StatusPill>
                        <StatusPill tone="primary">{row.positiveOutcomeRate}% positive</StatusPill>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.totalCalls}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.reviewedCalls}</td>
                  <td className="px-4 py-3 text-right">
                    {row.averageScore !== null ? (
                      <span className="font-semibold tabular-nums text-foreground">{row.averageScore}</span>
                    ) : (
                      <StatusPill tone="default" icon={Award}>Unscored</StatusPill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatDuration(row.avgDurationSeconds)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatRelativeTime(row.lastCallAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
