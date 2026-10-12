'use client';

import React, { useMemo, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { NICHES, NICHE_CATEGORIES, PRIORITY_CLUSTERS, clusterMembers, nicheName } from '@/lib/niches';

export type NicheCounts = Record<number, { listings: number; elite: number }>;

/**
 * Multi-select filter over the 120-niche directory. Niches are grouped into 12 categories, and the eight national lead-scoring priority
 * clusters can be selected in one click. Counts show how many listings carry each niche in the current geography.
 * A listing matches when it carries any selected niche.
 */
export default function NicheFilter({ value, onChange, counts }: { value: number[]; onChange: (ids: number[]) => void; counts: NicheCounts }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<number>(1);
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (id: number) => onChange(selected.has(id) ? value.filter(v => v !== id) : [...value, id]);
  const toggleMany = (ids: number[]) => { const all = ids.every(i => selected.has(i)); onChange(all ? value.filter(v => !ids.includes(v)) : [...new Set([...value, ...ids])]); };
  const total = (ids: number[]) => ids.reduce((s, i) => s + (counts[i]?.listings ?? 0), 0);
  const catNiches = NICHES.filter(n => n.category === category);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-sm font-semibold ${value.length ? 'bg-violet-600 border-violet-600 text-white' : 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'}`}>
          <Layers size={14} /> Niches{value.length ? ` (${value.length})` : ''}
        </button>
        {value.slice(0, 6).map(id => (
          <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-medium">
            {nicheName(id)}<button onClick={() => toggle(id)} aria-label={`Remove ${nicheName(id)}`} className="p-0.5 rounded-full hover:bg-violet-200"><X size={11} /></button>
          </span>
        ))}
        {value.length > 6 && <span className="text-xs text-muted-foreground">+{value.length - 6} more</span>}
        {value.length > 0 && <button onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-foreground underline">Clear niches</button>}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-border bg-card p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">National priority clusters</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_CLUSTERS.map(c => {
                const ids = clusterMembers(c.rank); const on = ids.every(i => selected.has(i));
                return (
                  <button key={c.rank} onClick={() => toggleMany(ids)} aria-pressed={on} title={c.opportunity} className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${on ? 'bg-violet-600 border-violet-600 text-white' : 'border-border bg-background hover:bg-muted'}`}>
                    <span className="mr-1 font-bold">{c.rank}.</span>{c.name} <span className="font-bold tabular-nums">{total(ids).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {NICHE_CATEGORIES.map(c => {
                const ids = NICHES.filter(n => n.category === c.id).map(n => n.id);
                return <button key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id} className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${category === c.id ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'}`}>{c.name} <span className="font-bold tabular-nums">{total(ids).toLocaleString()}</span></button>;
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{NICHE_CATEGORIES.find(c => c.id === category)?.name}</p>
              <button onClick={() => toggleMany(catNiches.map(n => n.id))} className="text-xs text-primary hover:underline">{catNiches.every(n => selected.has(n.id)) ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catNiches.map(n => {
                const c = counts[n.id]?.listings ?? 0; const on = selected.has(n.id);
                return (
                  <button key={n.id} onClick={() => toggle(n.id)} aria-pressed={on} title={c === 0 ? 'No listings in this area are tagged with this niche yet' : undefined} className={`px-2.5 py-1 rounded-full border text-xs ${on ? 'bg-violet-600 border-violet-600 text-white font-semibold' : c === 0 ? 'border-border bg-background text-muted-foreground' : 'border-border bg-background hover:bg-muted'}`}>
                    {n.name} <span className="font-bold tabular-nums">{c.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">Tags are inferred from each listing&apos;s title, market, size and nightly rate, so treat them as targeting hypotheses. They do not show whether short-term rental is allowed at that address; check the local rules before pitching.</p>
        </div>
      )}
    </div>
  );
}
