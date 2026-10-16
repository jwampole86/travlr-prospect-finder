'use client';

import React from 'react';
import { PieChart } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { OutcomeStat } from '../data';

const OUTCOME_TONES: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  interested: 'success',
  callback: 'primary',
  questionnaire_sent: 'primary',
  follow_up_scheduled: 'primary',
  proposal_conversation: 'success',
  voicemail: 'warning',
  no_answer: 'warning',
  busy: 'warning',
  failed: 'danger',
  not_interested: 'danger',
  undispositioned: 'default',
};

export default function OutcomePanel({ outcomes, totalCalls }: { outcomes: OutcomeStat[]; totalCalls: number }) {
  return (
    <Panel title="Outcome mix" icon={PieChart}>
      {outcomes.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="No outcomes yet"
          hint="Disposition labels appear here after calls are completed and categorized."
        />
      ) : (
        <div className="space-y-3">
          {outcomes.map((outcome) => {
            const width = totalCalls > 0 ? Math.max((outcome.count / totalCalls) * 100, 2) : 0;
            return (
              <div key={outcome.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={OUTCOME_TONES[outcome.key] ?? 'default'}>{outcome.label}</StatusPill>
                    <span className="text-xs text-muted-foreground">{outcome.share}%</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{outcome.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
