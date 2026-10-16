'use client';

import React, { useMemo, useState } from 'react';
import { Search, Sparkles, TableProperties } from 'lucide-react';
import { EmptyState, Panel, StatusPill, inputClass } from '@/components/ops';
import type { SimulatedLeadRow, SortKey } from './types';

const BAND_TONES: Record<string, 'success' | 'primary' | 'warning' | 'default' | 'danger'> = {
  hot: 'success',
  warm: 'primary',
  nurture: 'warning',
  cold: 'default',
  blocked: 'danger',
};

function timeAgo(value: string | null) {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Unknown';
  const diffHours = Math.round((Date.now() - parsed) / 3_600_000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export default function LeadPreviewTable({ rows }: { rows: SimulatedLeadRow[] }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('delta-desc');

  const stages = useMemo(
    () => ['all', ...Array.from(new Set(rows.map((row) => row.stage || 'Unknown'))).sort()],
    [rows],
  );

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const next = rows.filter((row) => {
      const haystack = [row.address, row.city, row.state, row.stage].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !normalized || haystack.includes(normalized);
      const matchesStage = stageFilter === 'all' || (row.stage || 'Unknown') === stageFilter;
      return matchesSearch && matchesStage;
    });

    next.sort((a, b) => {
      if (sortKey === 'simulated') return b.simulated.score - a.simulated.score;
      if (sortKey === 'baseline') return b.baseline.score - a.baseline.score;
      if (sortKey === 'delta-asc') return a.delta - b.delta;
      if (sortKey === 'newest') return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
      return b.delta - a.delta;
    });
    return next;
  }, [rows, search, stageFilter, sortKey]);

  return (
    <Panel title="Lead preview" icon={TableProperties}>
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClass} pl-9`}
              placeholder="Search address, city, state, or stage"
            />
          </label>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className={inputClass}>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage === 'all' ? 'All stages' : stage}
              </option>
            ))}
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className={inputClass}>
            <option value="delta-desc">Biggest increase</option>
            <option value="delta-asc">Biggest decrease</option>
            <option value="simulated">Highest simulated score</option>
            <option value="baseline">Highest baseline score</option>
            <option value="newest">Newest lead</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Sparkles} title="No leads match this view" hint="Try a broader search or switch back to all stages." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3 text-right">Stored</th>
                    <th className="px-4 py-3 text-right">Baseline</th>
                    <th className="px-4 py-3 text-right">Simulated</th>
                    <th className="px-4 py-3 text-right">Δ vs baseline</th>
                    <th className="px-4 py-3">Driver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filtered.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{row.address || 'Untitled lead'}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.city, row.state].filter(Boolean).join(', ') || 'Location missing'} · {row.stage || 'Unknown stage'} · Added {timeAgo(row.createdAt)}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <StatusPill tone={BAND_TONES[row.baseline.band]}>{row.baseline.band}</StatusPill>
                            <StatusPill tone={BAND_TONES[row.simulated.band]}>→ {row.simulated.band}</StatusPill>
                            {row.scoreModelVersion !== 'v4-live-signals' && <StatusPill tone="warning">Stored model differs</StatusPill>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-muted-foreground">{row.storedScore}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        <div>{row.baseline.score}</div>
                        {row.storedDelta !== 0 && (
                          <div className="text-[11px] font-normal text-muted-foreground">{row.storedDelta > 0 ? '+' : ''}{row.storedDelta} vs stored</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{row.simulated.score}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.delta > 0 ? 'text-success' : row.delta < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                        {row.delta > 0 ? '+' : ''}{row.delta}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{row.primaryFactor}</p>
                        <p className="text-xs text-muted-foreground">Top weighted factor after normalization.</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
