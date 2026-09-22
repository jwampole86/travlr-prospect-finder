'use client';

import React, { useMemo, useState } from 'react';
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
  'Permit Required': '#f59e0b',
  'Primary Residence Required': '#a855f7',
  'Review Required': '#3b82f6',
  Prohibited: 'var(--danger)',
  Unknown: 'var(--neutral)',
};

const STATUS_GROUPS: Record<string, string[]> = {
  Allowed: ['Allowed', 'ALLOWED'],
  Restricted: ['Restricted', 'RESTRICTED', 'ALLOWED_WITH_REQUIREMENTS'],
  'Permit Required': ['PERMIT_REQUIRED', 'Permit Required'],
  'Primary Residence Required': ['PRIMARY_RESIDENCE_REQUIRED', 'Primary Residence Required'],
  'Review Required': ['REVIEW_REQUIRED', 'Review Required'],
  Prohibited: ['Prohibited', 'PROHIBITED'],
  Unknown: ['Unknown', 'UNKNOWN', '', 'null'],
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
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const groupedData = useMemo(() => {
    const counts = new Map<string, number>();
    regulationBreakdown.forEach(({ status, count }) => {
      const category = Object.entries(STATUS_GROUPS).find(([, values]) => values.includes(status))?.[0] || 'Unknown';
      counts.set(category, (counts.get(category) || 0) + count);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [regulationBreakdown]);
  const knownData = groupedData.filter(entry => entry.name !== 'Unknown');
  const data = (includeUnknown || knownData.length === 0 ? groupedData : knownData)
    .filter(entry => selectedCategory === 'all' || entry.name === selectedCategory);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  function handleSliceClick(entry: { name: string }) {
    if (entry?.name) {
      const rawStatuses = STATUS_GROUPS[entry.name] || [entry.name];
      router.push(`/lead-management?${rawStatuses.map(status => `regulation=${encodeURIComponent(status)}`).join('&')}`);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Regulation Status</h3>
          <p className="text-xs text-muted-foreground mt-0.5">STR compliance breakdown · select a category to filter</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{total} shown</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button onClick={() => setSelectedCategory('all')} className={`px-2 py-1 rounded border text-[10px] ${selectedCategory === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>All known</button>
        {knownData.map(entry => (
          <button key={entry.name} onClick={() => setSelectedCategory(entry.name)} className={`px-2 py-1 rounded border text-[10px] ${selectedCategory === entry.name ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
            {entry.name} ({entry.value.toLocaleString()})
          </button>
        ))}
        {groupedData.some(entry => entry.name === 'Unknown') && (
          <label className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeUnknown} onChange={event => setIncludeUnknown(event.target.checked)} />
            Include Unknown
          </label>
        )}
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