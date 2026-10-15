import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SourceItem } from '@/lib/leadSourceTypes';
import { fmtNum, sourceColor } from '../utils';

const WEEK_LABELS = ['7w ago', '6w', '5w', '4w', '3w', '2w', 'Last wk', 'This wk'];

const tooltipStyle = { background: 'hsl(var(--card, 0 0% 100%))', border: '1px solid hsl(var(--border, 0 0% 90%))', borderRadius: 12, fontSize: 12 } as const;

export function LeadsBySourceChart({ sources, onOpen }: { sources: SourceItem[]; onOpen: (key: string) => void }) {
  const data = useMemo(() => sources.filter(s => s.stats.total > 0).slice(0, 8).map(s => ({
    key: s.key, name: s.name, withPhone: s.stats.phone, without: Math.max(0, s.stats.total - s.stats.phone),
  })), [sources]);
  if (!data.length) return <p className="text-sm text-muted-foreground py-10 text-center">No leads to chart yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barSize={16}>
        <CartesianGrid horizontal={false} strokeOpacity={0.15} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtNum(v)} stroke="currentColor" strokeOpacity={0.4} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12 }} stroke="currentColor" strokeOpacity={0.4} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [fmtNum(v), n === 'withPhone' ? 'With a phone' : 'No phone yet']} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
        <Legend formatter={v => (v === 'withPhone' ? 'With a phone' : 'No phone yet')} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="withPhone" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} onClick={(d: { key?: string }) => d?.key && onOpen(d.key)} cursor="pointer" />
        <Bar dataKey="without" stackId="a" fill="#94a3b8" fillOpacity={0.55} radius={[0, 6, 6, 0]} onClick={(d: { key?: string }) => d?.key && onOpen(d.key)} cursor="pointer" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GrowthChart({ sources }: { sources: SourceItem[] }) {
  const top = useMemo(() => [...sources].filter(s => s.stats.added30d > 0).sort((a, b) => b.stats.added30d - a.stats.added30d).slice(0, 5), [sources]);
  const data = useMemo(() => WEEK_LABELS.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const s of top) row[s.name] = s.stats.weekly[i] ?? 0;
    return row;
  }), [top]);
  if (!top.length) return <p className="text-sm text-muted-foreground py-10 text-center">No new leads in the last 8 weeks.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, 8 * 34 + 40)}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtNum(v)} width={44} stroke="currentColor" strokeOpacity={0.4} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtNum(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {top.map(s => <Line key={s.key} type="monotone" dataKey={s.name} stroke={sourceColor(s.key)} strokeWidth={2.25} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
