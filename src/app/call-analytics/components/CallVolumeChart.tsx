'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, Panel } from '@/components/ops';
import type { TrendPoint } from '../data';

export default function CallVolumeChart({ points }: { points: TrendPoint[] }) {
  return (
    <Panel title="Call volume trend" icon={BarChart3}>
      {points.every((point) => point.calls === 0) ? (
        <EmptyState
          icon={BarChart3}
          title="No calls in this range"
          hint="Call volume will appear here once sessions are recorded in the selected window."
        />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickMargin={8} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Bar dataKey="calls" name="Sessions" fill="var(--primary)" radius={[8, 8, 0, 0]} barSize={18} />
              <Line dataKey="completed" name="Completed" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line dataKey="positive" name="Positive outcome" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
