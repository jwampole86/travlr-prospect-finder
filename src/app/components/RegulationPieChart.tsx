'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import type { RegulationCount } from '@/lib/hooks/useDashboardLeads';

interface RegulationPieChartProps {
  regulationBreakdown: RegulationCount[];
  /** State code or 'all'. When provided the chart loads per-state quality metrics; otherwise it shows counts only. */
  insightsState?: string;
}

interface InsightRow {
  status: string;
  state: string;
  count: number;
  avg_score: number | null;
  action_needed: number | null;
  luxury: number | null;
  phone: number | null;
}

interface CategoryStat {
  name: string;
  count: number;
  avgScore: number | null;
  actionNeeded: number | null;
  luxury: number | null;
  phone: number | null;
  states: { state: string; count: number }[];
}

const REG_COLORS: Record<string, string> = {
  Allowed: 'var(--success)',
  Restricted: 'var(--warning)',
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

const CATEGORY_ORDER = Object.keys(STATUS_GROUPS);

type View = 'overview' | 'states' | 'quality';

const categoryOf = (raw: string) =>
  Object.entries(STATUS_GROUPS).find(([, values]) => values.includes(raw))?.[0] ?? 'Unknown';

const sumNullable = (values: Array<number | null>) =>
  values.some(v => v === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0);

function buildStats(rows: InsightRow[]): CategoryStat[] {
  const byCategory = new Map<string, InsightRow[]>();
  rows.forEach(r => {
    const name = categoryOf(r.status);
    byCategory.set(name, [...(byCategory.get(name) ?? []), r]);
  });
  return CATEGORY_ORDER.filter(name => byCategory.has(name)).map(name => {
    const list = byCategory.get(name)!;
    const count = list.reduce((s, r) => s + r.count, 0);
    const scored = list.every(r => r.avg_score !== null);
    const stateMap = new Map<string, number>();
    list.forEach(r => stateMap.set(r.state, (stateMap.get(r.state) ?? 0) + r.count));
    return {
      name,
      count,
      avgScore: scored && count > 0 ? Math.round(list.reduce((s, r) => s + (r.avg_score ?? 0) * r.count, 0) / count) : null,
      actionNeeded: sumNullable(list.map(r => r.action_needed)),
      luxury: sumNullable(list.map(r => r.luxury)),
      phone: sumNullable(list.map(r => r.phone)),
      states: [...stateMap.entries()].map(([state, c]) => ({ state, count: c })).sort((a, b) => b.count - a.count),
    };
  });
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString());

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono-data text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function RegulationPieChart({ regulationBreakdown, insightsState }: RegulationPieChartProps) {
  const router = useRouter();
  const [view, setView] = useState<View>('overview');
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | undefined>(undefined);
  const [insights, setInsights] = useState<InsightRow[] | null>(null);

  useEffect(() => {
    if (insightsState === undefined) return;
    let cancelled = false;
    createClient().rpc('get_regulation_insights', { p_state: insightsState || 'all' }).then(({ data, error }) => {
      if (!cancelled && !error && Array.isArray(data)) setInsights(data as InsightRow[]);
    });
    return () => { cancelled = true; };
  }, [insightsState]);

  // Counts-only fallback keeps the chart working where per-lead metrics are unavailable (previews, RPC errors).
  const rows: InsightRow[] = useMemo(
    () => insights ?? regulationBreakdown.map(r => ({ status: r.status, state: 'ALL', count: r.count, avg_score: null, action_needed: null, luxury: null, phone: null })),
    [insights, regulationBreakdown],
  );
  const hasMetrics = insights !== null;

  const stats = useMemo(() => buildStats(rows), [rows]);
  const known = stats.filter(s => s.name !== 'Unknown');
  const total = stats.reduce((s, c) => s + c.count, 0);
  const knownTotal = known.reduce((s, c) => s + c.count, 0);
  const unknownStat = stats.find(s => s.name === 'Unknown');
  const shown = includeUnknown || known.length === 0 ? stats : known;
  const shownTotal = shown.reduce((s, c) => s + c.count, 0);
  const selectedStat = selected ? stats.find(s => s.name === selected) ?? null : null;

  const stateBars = useMemo(() => {
    const byState = new Map<string, Record<string, number | string>>();
    rows.forEach(r => {
      const cat = categoryOf(r.status);
      if (cat === 'Unknown' && !includeUnknown && known.length > 0) return;
      const entry = byState.get(r.state) ?? { state: r.state, total: 0 };
      entry[cat] = ((entry[cat] as number) ?? 0) + r.count;
      entry.total = (entry.total as number) + r.count;
      byState.set(r.state, entry);
    });
    return [...byState.values()].sort((a, b) => (b.total as number) - (a.total as number)).slice(0, 10);
  }, [rows, includeUnknown, known.length]);

  function viewLeads(name: string) {
    router.push(`/lead-management?${(STATUS_GROUPS[name] || [name]).map(s => `regulation=${encodeURIComponent(s)}`).join('&')}`);
  }

  const toggleSelected = (name: string) => setSelected(prev => (prev === name ? null : name));

  // Per-state and quality views need live metrics; contexts without insightsState (previews) get the overview only.
  const tabs: { key: View; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    ...(insightsState !== undefined ? [{ key: 'states' as View, label: 'By state' }, { key: 'quality' as View, label: 'Lead quality' }] : []),
  ];

  const hoveredName = hoverIndex !== undefined ? shown[hoverIndex]?.name : undefined;
  const activeStat = stats.find(s => s.name === (hoveredName ?? (selected && shown.some(s2 => s2.name === selected) ? selected : undefined))) ?? null;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Regulation Status</h3>
          <p className="text-xs text-muted-foreground mt-0.5">STR compliance across {total.toLocaleString()} prospects · click a category for details</p>
        </div>
        {tabs.length > 1 && (
        <div className="flex rounded-lg border border-border p-0.5 shrink-0" role="tablist" aria-label="Regulation chart view">
          {tabs.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={view === t.key}
              onClick={() => setView(t.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${view === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Coverage: how much of the portfolio has a known regulation status */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{knownTotal.toLocaleString()}</span> of {total.toLocaleString()} classified ({pct(knownTotal, total)}%)
          </span>
          {unknownStat && (
            <Link href="/city-regulations" className="text-primary hover:underline">Research unknown markets →</Link>
          )}
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted" aria-hidden="true">
          {stats.map(s => (
            <div
              key={s.name}
              title={`${s.name}: ${s.count.toLocaleString()}`}
              style={{ width: `${(s.count / (total || 1)) * 100}%`, background: REG_COLORS[s.name] || 'var(--muted-foreground)', minWidth: s.count > 0 ? 2 : 0 }}
            />
          ))}
        </div>
      </div>

      {view !== 'quality' && unknownStat && known.length > 0 && (
        <label className="flex items-center gap-1.5 mb-2 text-[11px] text-muted-foreground cursor-pointer w-fit">
          <input type="checkbox" checked={includeUnknown} onChange={e => setIncludeUnknown(e.target.checked)} />
          Include Unknown ({unknownStat.count.toLocaleString()})
        </label>
      )}

      {view === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={shown.map(s => ({ name: s.name, value: s.count }))}
                cx="50%" cy="50%" innerRadius={56} outerRadius={80} paddingAngle={3} dataKey="value"
                activeIndex={hoverIndex}
                activeShape={(props: unknown) => {
                  const p = props as React.ComponentProps<typeof Sector>;
                  return <Sector {...p} outerRadius={(p.outerRadius as number) + 6} />;
                }}
                onMouseEnter={(_, i) => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(undefined)}
                onClick={(d) => toggleSelected((d as { name: string }).name)}
                style={{ cursor: 'pointer' }}
              >
                {shown.map(s => (
                  <Cell
                    key={s.name}
                    fill={REG_COLORS[s.name] || 'var(--muted-foreground)'}
                    opacity={selected && selected !== s.name ? 0.35 : 1}
                  />
                ))}
              </Pie>
              <text x="50%" y="46%" textAnchor="middle" className="fill-foreground" style={{ fontSize: 20, fontWeight: 700 }}>
                {(activeStat?.count ?? shownTotal).toLocaleString()}
              </text>
              <text x="50%" y="58%" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                {activeStat ? `${activeStat.name} · ${pct(activeStat.count, shownTotal)}%` : 'prospects shown'}
              </text>
            </PieChart>
          </ResponsiveContainer>

          <ul className="space-y-1">
            {shown.map((s, i) => (
              <li key={s.name}>
                <button
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(undefined)}
                  onClick={() => toggleSelected(s.name)}
                  aria-pressed={selected === s.name}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-colors ${selected === s.name ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: REG_COLORS[s.name] || 'var(--muted-foreground)' }} />
                  <span className="text-xs text-foreground flex-1 truncate">{s.name}</span>
                  <span className="font-mono-data text-xs text-foreground">{s.count.toLocaleString()}</span>
                  <span className="font-mono-data text-[10px] text-muted-foreground w-10 text-right">{pct(s.count, shownTotal)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'states' && !hasMetrics && (
        <p className="text-xs text-muted-foreground py-6 text-center">State breakdown is not available right now.</p>
      )}

      {view === 'states' && hasMetrics && (
        <ResponsiveContainer width="100%" height={Math.max(180, stateBars.length * 26 + 30)}>
          <BarChart data={stateBars} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
            <YAxis type="category" dataKey="state" width={34} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            />
            {shown.map(s => (
              <Bar
                key={s.name}
                dataKey={s.name}
                stackId="reg"
                fill={REG_COLORS[s.name] || 'var(--muted-foreground)'}
                opacity={selected && selected !== s.name ? 0.35 : 1}
                onClick={() => toggleSelected(s.name)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'quality' && (
        hasMetrics ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-1.5">Status</th>
                  <th className="text-right font-medium">Leads</th>
                  <th className="text-left font-medium pl-3 w-[28%]">Avg score</th>
                  <th className="text-right font-medium">Phone</th>
                  <th className="text-right font-medium">Luxury</th>
                  <th className="text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr
                    key={s.name}
                    onClick={() => toggleSelected(s.name)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/40 ${selected === s.name ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: REG_COLORS[s.name] || 'var(--muted-foreground)' }} />
                        {s.name}
                      </span>
                    </td>
                    <td className="text-right font-mono-data">{s.count.toLocaleString()}</td>
                    <td className="pl-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${s.avgScore ?? 0}%` }} />
                        </div>
                        <span className="font-mono-data w-6 text-right">{s.avgScore ?? '—'}</span>
                      </div>
                    </td>
                    <td className="text-right font-mono-data">{s.phone === null ? '—' : `${pct(s.phone, s.count)}%`}</td>
                    <td className="text-right font-mono-data">{fmt(s.luxury)}</td>
                    <td className="text-right font-mono-data">{fmt(s.actionNeeded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2">Phone = share of leads with a contact number. Action = score 70+ and still a New Lead.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-6 text-center">Lead quality metrics are not available for this view.</p>
        )
      )}

      {/* Detail for the selected category */}
      <div className="mt-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            {selectedStat && <span className="w-2 h-2 rounded-full" style={{ background: REG_COLORS[selectedStat.name] || 'var(--muted-foreground)' }} />}
            {selectedStat ? selectedStat.name : 'Select a category for details'}
          </p>
          {selectedStat && (
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
              <button onClick={() => viewLeads(selectedStat.name)} className="text-[11px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90">
                View {selectedStat.count.toLocaleString()} leads
              </button>
            </div>
          )}
        </div>
        {selectedStat ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Share" value={`${pct(selectedStat.count, total)}%`} hint="Of all prospects" />
              <Metric label="Avg score" value={fmt(selectedStat.avgScore)} />
              <Metric label="Action needed" value={fmt(selectedStat.actionNeeded)} hint="Score 70+ and New Lead" />
              <Metric label="With phone" value={selectedStat.phone === null ? '—' : `${selectedStat.phone.toLocaleString()} (${pct(selectedStat.phone, selectedStat.count)}%)`} />
            </div>
            {hasMetrics && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-muted-foreground">Top states</span>
                {selectedStat.states.slice(0, 6).map(s => (
                  <span key={s.state} className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono-data text-foreground">
                    {s.state} {s.count.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Click a slice, legend row, bar or table row to see its score, phone coverage, luxury and action-needed counts.
          </p>
        )}
      </div>
    </div>
  );
}
