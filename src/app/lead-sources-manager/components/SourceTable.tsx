import React from 'react';
import { ArrowDown, ArrowUp, CheckSquare, Square } from 'lucide-react';
import type { SourceItem } from '@/lib/leadSourceTypes';
import { fmtNum, relTime, sourceColor, STATUS_META } from '../utils';

export type SortKey = 'leads' | 'name' | 'added' | 'contact' | 'recent' | 'attention';

interface Props {
  sources: SourceItem[];
  selected: Set<string>;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  onSelect: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onOpen: (key: string) => void;
}

export default function SourceTable({ sources, selected, sort, onSort, onSelect, onSelectAll, onOpen }: Props) {
  const all = sources.length > 0 && sources.every(s => selected.has(s.key));
  const Th = ({ k, label, right }: { k?: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${right ? 'text-right' : 'text-left'}`}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${sort === k ? 'text-foreground' : ''}`}>
          {label} {sort === k && (k === 'name' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      ) : label}
    </th>
  );
  return (
    <div className="rounded-2xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-3 py-2.5 w-8"><button type="button" onClick={() => onSelectAll(!all)} aria-label="Select all" className="text-muted-foreground hover:text-foreground">{all ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}</button></th>
            <Th k="name" label="Source" /><Th label="Status" /><Th label="Markets" right />
            <Th k="leads" label="Leads" right /><Th k="added" label="+7 days" right /><Th label="Phone" right /><Th label="Owner verified" right />
            <Th k="contact" label="Coverage" right /><Th k="recent" label="Last sync" right />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sources.map(s => {
            const real = s.stats.real; const p = (n: number) => (real ? `${Math.round((n / real) * 100)}%` : '-');
            const meta = STATUS_META[s.status]; const active = s.configs.filter(c => c.active).length;
            return (
              <tr key={s.key} onClick={() => onOpen(s.key)} className="hover:bg-muted/40 cursor-pointer">
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}><button type="button" onClick={() => onSelect(s.key)} aria-label={`Select ${s.name}`} className="text-muted-foreground hover:text-foreground">{selected.has(s.key) ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}</button></td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-2.5"><span className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-white text-xs font-bold" style={{ background: sourceColor(s.key) }}>{s.name.charAt(0).toUpperCase()}</span><span className="font-semibold text-foreground">{s.name}</span></span></td>
                <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.configs.length ? `${active}/${s.configs.length}` : '-'}</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">{fmtNum(s.stats.total)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.stats.added7d ? `+${fmtNum(s.stats.added7d)}` : '-'}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{p(s.stats.phone)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{p(s.stats.verifiedOwner)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">{s.stats.quality === null ? '-' : `${s.stats.quality}%`}</td>
                <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{relTime(s.lastSuccess, 'Not recorded')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
