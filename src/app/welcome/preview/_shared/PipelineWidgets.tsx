'use client';

import { useMemo } from 'react';
import { LayoutGrid, Map as MapIcon, GripVertical } from 'lucide-react';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { SHOWCASE_LEADS } from './showcaseLeads';

// Sanitized mock of the live Pipeline Board: real campaign stages, drag-and-drop columns and a
// board/map toggle. Cards use the shared marketing fixtures so no real owner data is shown.
const STAGES: Array<{ key: string; label: string; dot: string; note: (i: number) => string; leadIdx: number[] }> = [
  { key: 'prospect', label: 'Prospects', dot: 'bg-slate-400', note: () => 'Scored, not texted', leadIdx: [0, 5, 9] },
  { key: 'queued', label: 'Queued', dot: 'bg-amber-400', note: () => 'Sends 9:00 AM local', leadIdx: [2, 11] },
  { key: 'texted', label: 'Texted', dot: 'bg-sky-400', note: () => 'Delivered, no reaction', leadIdx: [3, 7, 12] },
  { key: 'engaged', label: 'Engaged', dot: 'bg-indigo-400', note: () => 'Viewed the estimate', leadIdx: [1, 8] },
  { key: 'hot', label: 'Hot', dot: 'bg-rose-500', note: () => 'Replied YES', leadIdx: [4] },
  { key: 'human', label: 'Human Outreach', dot: 'bg-violet-500', note: () => 'Agent following up', leadIdx: [6] },
  { key: 'contract', label: 'Under Contract', dot: 'bg-emerald-500', note: () => 'Agreement in progress', leadIdx: [10] },
];

export default function PipelineWidgets() {
  const columns = useMemo(
    () =>
      STAGES.map((stage) => ({
        ...stage,
        leads: stage.leadIdx.map((i) => SHOWCASE_LEADS[i % SHOWCASE_LEADS.length]).filter(Boolean),
      })),
    [],
  );
  const total = columns.reduce((sum, c) => sum + c.leads.length, 0);
  const hot = columns.find((c) => c.key === 'hot')?.leads.length ?? 0;
  const engaged = columns.find((c) => c.key === 'engaged')?.leads.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 flex-1 min-w-0">
          {[
            { label: 'In pipeline', value: total },
            { label: 'Engaged', value: engaged },
            { label: 'Hot', value: hot },
            { label: 'Texted today', value: 18 },
          ].map((t) => (
            <div key={t.label} className="bg-card rounded-xl border border-border px-3 py-2">
              <p className="text-lg font-bold text-foreground leading-tight">{t.value}</p>
              <p className="text-[10px] text-muted-foreground">{t.label}</p>
            </div>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-3 py-1"><LayoutGrid size={12} /> Board</span>
          <span className="inline-flex items-center gap-1 rounded-full text-muted-foreground px-3 py-1"><MapIcon size={12} /> Map</span>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div key={col.key} className="w-48 shrink-0 bg-muted/30 rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  {col.label}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">{col.leads.length}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{col.note(0)}</p>
            </div>
            <div className="p-2 space-y-2 min-h-[96px]">
              {col.leads.map((lead) => (
                <div key={`${col.key}-${lead.id}`} className="bg-card rounded-lg border border-border p-2.5 space-y-1.5 shadow-sm">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold text-foreground truncate">{lead.address}</p>
                    <GripVertical size={12} className="text-muted-foreground/60 shrink-0 mt-0.5" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
                  <ProspectScoreBar score={lead.prospectScore} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
