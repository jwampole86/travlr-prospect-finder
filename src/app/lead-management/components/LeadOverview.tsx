'use client';

import React, { useEffect, useState } from 'react';
import { Flame, Phone, Send, Clock, MousePointerClick, UserCheck, Layers } from 'lucide-react';
import type { FilterState } from './LeadManagementClient';

interface Overview { total: number; hot: number; withPhone: number; readyToText: number; luxury: number; fullyVerified: number; unassigned: number; newThisWeek: number; stages: Record<string, number> }

type Patch = Partial<FilterState>;
interface View { id: string; label: string; hint: string; patch: Patch; count: (o: Overview) => number; tile?: { icon: React.ElementType; tone: string } }

const weekAgo = () => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

/** Keys the smart views control; applying one clears the others first so views never stack. */
export const VIEW_RESET: Patch = { campaignStage: '', scoreMin: '', phoneAvailableOnly: false, fullyVerified: false, luxury: false, assignmentStatus: '', dateFrom: '' };

const makeViews = (): View[] => [
  { id: 'all', label: 'All leads', hint: 'Every lead you can see', patch: {}, count: o => o.total, tile: { icon: Layers, tone: 'text-foreground' } },
  { id: 'hot', label: 'Hot (80+)', hint: 'Prospect score of 80 or more', patch: { scoreMin: '80' }, count: o => o.hot, tile: { icon: Flame, tone: 'text-orange-500' } },
  { id: 'ready', label: 'Ready to text', hint: 'Has a phone number and has not been texted yet', patch: { campaignStage: 'prospect', phoneAvailableOnly: true }, count: o => o.readyToText, tile: { icon: Phone, tone: 'text-emerald-500' } },
  { id: 'queued', label: 'Queued', hint: 'A text is scheduled and has not gone out', patch: { campaignStage: 'queued' }, count: o => o.stages.queued ?? 0, tile: { icon: Clock, tone: 'text-sky-500' } },
  { id: 'texted', label: 'Texted', hint: 'Text sent, no reaction yet', patch: { campaignStage: 'texted' }, count: o => o.stages.texted ?? 0, tile: { icon: Send, tone: 'text-blue-500' } },
  { id: 'engaged', label: 'Engaged', hint: 'Opened the link or viewed the estimate', patch: { campaignStage: 'engaged' }, count: o => o.stages.engaged ?? 0, tile: { icon: MousePointerClick, tone: 'text-amber-500' } },
  { id: 'human', label: 'With a person', hint: 'Replied YES or needs a human follow-up', patch: { campaignStage: 'human' }, count: o => (o.stages.human ?? 0) + (o.stages.hot ?? 0), tile: { icon: UserCheck, tone: 'text-violet-500' } },
  { id: 'unreachable', label: 'Unreachable', hint: 'The text could not be delivered', patch: { campaignStage: 'unreachable' }, count: o => o.stages.unreachable ?? 0 },
  { id: 'verified', label: 'Fully verified', hint: 'Owner, phone and address all verified', patch: { fullyVerified: true }, count: o => o.fullyVerified },
  { id: 'luxury', label: 'Luxury', hint: 'Luxury-tier properties', patch: { luxury: true }, count: o => o.luxury },
  { id: 'unassigned', label: 'Unassigned', hint: 'No agent assigned yet', patch: { assignmentStatus: 'unassigned' }, count: o => o.unassigned },
  { id: 'new', label: 'New this week', hint: 'Added in the last 7 days', patch: { dateFrom: weekAgo() }, count: o => o.newThisWeek },
];

const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '') || (a === false && !b) || (b === false && !a);
function isActive(v: View, f: FilterState): boolean {
  const keys = Object.keys(VIEW_RESET) as Array<keyof FilterState>;
  const patch = v.patch as Record<string, unknown>;
  return keys.every(k => (k in patch ? (k === 'dateFrom' ? !!f.dateFrom : same(f[k], patch[k])) : same(f[k], (VIEW_RESET as Record<string, unknown>)[k])));
}

export default function LeadOverview({ stateCode, filters, refreshKey, onApply }: { stateCode: string; filters: FilterState; refreshKey: number; onApply: (patch: Patch) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/leads/overview${stateCode && stateCode !== 'all' ? `?stateCode=${encodeURIComponent(stateCode)}` : ''}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (live && j) setO({ ...j, stages: j.stages ?? {} }); }).catch(() => {});
    return () => { live = false; };
  }, [stateCode, refreshKey]);

  const views = makeViews();
  const pick = (v: View) => onApply(isActive(v, filters) && v.id !== 'all' ? { ...VIEW_RESET } : { ...VIEW_RESET, ...v.patch });
  const tiles = views.filter(v => v.tile); const chips = views.filter(v => !v.tile);

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {tiles.map(v => { const Icon = v.tile!.icon; const on = isActive(v, filters); return (
          <button key={v.id} onClick={() => pick(v)} aria-pressed={on} title={v.hint}
            className={`group text-left bg-card border rounded-xl px-3.5 py-3 transition hover:shadow-md hover:-translate-y-px ${on ? 'border-primary ring-1 ring-primary/40 shadow-sm' : 'border-border'}`}>
            <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-muted-foreground">{v.label}</span><Icon size={14} className={v.tile!.tone} /></div>
            <p className="mt-1 text-2xl font-bold text-foreground leading-none tabular-nums">{o ? v.count(o).toLocaleString() : <span className="inline-block h-6 w-12 rounded bg-muted animate-pulse" />}</p>
          </button>); })}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-medium text-muted-foreground mr-1">Quick views</span>
        {chips.map(v => { const on = isActive(v, filters); return (
          <button key={v.id} onClick={() => pick(v)} aria-pressed={on} title={v.hint} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}>
            {v.label}{o && <span className={`font-bold tabular-nums ${on ? '' : 'text-foreground'}`}>{v.count(o).toLocaleString()}</span>}
          </button>); })}
      </div>
    </div>
  );
}
