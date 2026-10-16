'use client';

import React from 'react';
import { Users } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import { formatDuration, formatRelativeTime } from '../data';
import type { AgentRow } from '../data';

export default function AgentPerformanceTable({ rows }: { rows: AgentRow[] }) {
  return (
    <Panel title="Agent performance" icon={Users} padded={false}>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Users}
            title="No agent activity yet"
            hint="Agent-level metrics will appear after call sessions are created in this date range."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-right font-medium">Calls</th>
                <th className="px-4 py-3 text-right font-medium">Completed</th>
                <th className="px-4 py-3 text-right font-medium">Positive</th>
                <th className="px-4 py-3 text-right font-medium">Avg duration</th>
                <th className="px-4 py-3 text-right font-medium">Last call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rate = row.totalCalls > 0 ? Math.round((row.positiveCalls / row.totalCalls) * 100) : 0;
                return (
                  <tr key={row.agentName} className="border-t border-border/70">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{row.agentName}</span>
                        <div className="flex gap-2">
                          <StatusPill tone="success">{row.interestedCalls} interested</StatusPill>
                          <StatusPill tone="primary">{row.callbackCalls} callback</StatusPill>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.totalCalls}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.completedCalls}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{rate}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatDuration(row.averageDurationSeconds)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatRelativeTime(row.lastCallAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
