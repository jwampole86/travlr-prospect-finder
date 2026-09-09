'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { stageOrder } from '@/data/mockLeads';
import type { StageCount } from '@/lib/hooks/useDashboardLeads';

interface StageFunnelChartProps {
  stageBreakdown: StageCount[];
}

const stageColors: Record<string, string> = {
  'New Lead': 'var(--stage-new)',
  'Contacted': 'var(--stage-contacted)',
  'Interested': 'var(--stage-interested)',
  'Proposal Sent': 'var(--stage-proposal)',
  'Under Contract': 'var(--stage-contract)',
  'Live': 'var(--stage-live)',
  'Not a Fit': 'var(--stage-notfit)',
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { stage: string } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-foreground">{d.payload.stage}</p>
      <p className="font-mono-data text-muted-foreground">{d.value} lead{d.value !== 1 ? 's' : ''}</p>
      <p className="text-[10px] text-primary mt-0.5">Click to filter</p>
    </div>
  );
}

export default function StageFunnelChart({ stageBreakdown }: StageFunnelChartProps) {
  const router = useRouter();

  // Build a lookup from the aggregate data
  const countByStage: Record<string, number> = {};
  stageBreakdown.forEach(({ stage, count }) => {
    countByStage[stage] = count;
  });

  // Use stageOrder for consistent ordering; include any extra stages not in stageOrder
  const orderedStages = [...stageOrder];
  stageBreakdown.forEach(({ stage }) => {
    if (!orderedStages.includes(stage)) orderedStages.push(stage);
  });

  const data = orderedStages
    .map((stage) => ({
      stage,
      count: countByStage[stage] ?? 0,
      shortLabel:
        stage === 'Proposal Sent' ? 'Proposal' :
        stage === 'Under Contract' ? 'Contract' :
        stage === 'Not a Fit' ? 'Not a Fit' :
        stage,
    }))
    .filter((d) => d.count > 0);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  function handleBarClick(entry: { stage: string }) {
    if (entry?.stage) {
      router.push(`/lead-management?stage=${encodeURIComponent(entry.stage)}`);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Lead distribution across funnel · click to filter</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
          {total} total
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barCategoryGap="30%" style={{ cursor: 'pointer' }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={(d) => handleBarClick(d as { stage: string })}>
            {data.map((entry) => (
              <Cell key={`cell-stage-${entry.stage}`} fill={stageColors[entry.stage] ?? 'var(--primary)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}