'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { RegulationCount } from '@/lib/hooks/useDashboardLeads';

interface RegulationPieChartProps {
  regulationBreakdown: RegulationCount[];
}

const REG_COLORS: Record<string, string> = {
  Restricted: 'var(--warning)',
  Allowed: 'var(--success)',
  Prohibited: 'var(--danger)',
  Unknown: 'var(--neutral)',
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-foreground">{d.name}</p>
      <p className="font-mono-data text-muted-foreground">{d.value} properties</p>
      <p className="text-[10px] text-primary mt-0.5">Click to filter</p>
    </div>
  );
}

export default function RegulationPieChart({ regulationBreakdown }: RegulationPieChartProps) {
  const router = useRouter();

  const data = regulationBreakdown.map(({ status, count }) => ({ name: status, value: count }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  function handleSliceClick(entry: { name: string }) {
    if (entry?.name) {
      router.push(`/lead-management?regulation=${encodeURIComponent(entry.name)}`);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Regulation Status</h3>
          <p className="text-xs text-muted-foreground mt-0.5">STR compliance breakdown · click to filter</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
          {total} total
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            onClick={(d) => handleSliceClick(d as { name: string })}
            style={{ cursor: 'pointer' }}
          >
            {data.map((entry) => (
              <Cell key={`cell-reg-${entry.name}`} fill={REG_COLORS[entry.name] || 'var(--muted-foreground)'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-sans)' }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}