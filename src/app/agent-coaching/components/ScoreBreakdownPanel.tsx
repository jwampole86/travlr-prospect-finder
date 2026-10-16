'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from 'recharts';
import { EmptyState, Panel } from '@/components/ops';
import type { ScoreDimensionAverage } from '../data';

export default function ScoreBreakdownPanel({ points, title }: { points: ScoreDimensionAverage[]; title: string }) {
  return (
    <Panel title={title} icon={BarChart3}>
      {points.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No scored calls yet"
          hint="The live DB currently has no call_quality_scores rows, so this panel stays empty until scoring data exists."
        />
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickMargin={8} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={34} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }} />
              <Bar dataKey="value" fill="var(--primary)" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
