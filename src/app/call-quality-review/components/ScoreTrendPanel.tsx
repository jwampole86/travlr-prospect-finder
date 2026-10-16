'use client';

import React from 'react';
import { LineChart as LineChartIcon } from 'lucide-react';
import { CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart } from 'recharts';
import { EmptyState, Panel } from '@/components/ops';
import type { ReviewTrendPoint } from '../data';

export default function ScoreTrendPanel({ points }: { points: ReviewTrendPoint[] }) {
  return (
    <Panel title="Weekly review trend" icon={LineChartIcon}>
      {points.length === 0 || points.every((point) => point.averageScore === 0 && point.reviewedCalls === 0) ? (
        <EmptyState
          icon={LineChartIcon}
          title="No trend data yet"
          hint="Trend lines appear once call_quality_scores rows or saved reviews exist in the selected range."
        />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickMargin={8} />
              <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={34} />
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={34} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16 }} />
              <Line yAxisId="left" dataKey="averageScore" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="Average score" />
              <Line yAxisId="right" dataKey="reviewedCalls" stroke="#22c55e" strokeWidth={2} dot={false} name="Reviewed calls" />
              <Line yAxisId="right" dataKey="scoredCalls" stroke="#f59e0b" strokeWidth={2} dot={false} name="Scored calls" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
