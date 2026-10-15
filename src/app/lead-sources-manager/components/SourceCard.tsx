import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckSquare, ChevronRight, ExternalLink, MapPin, Pause, Play, Plus, Square, Timer } from 'lucide-react';
import type { SourceItem } from '@/lib/leadSourceTypes';
import { fmtNum, intervalLabel, relTime, sourceColor, STATUS_META } from '../utils';
import Sparkline from './Sparkline';

interface Props {
  source: SourceItem;
  selected: boolean;
  canManage: boolean;
  onSelect: (key: string) => void;
  onOpen: (key: string) => void;
  onToggleAll: (key: string, active: boolean) => void;
  onAddMarket: (name: string) => void;
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground tabular-nums">{total > 0 ? `${pct}%` : '-'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function SourceCard({ source, selected, canManage, onSelect, onOpen, onToggleAll, onAddMarket }: Props) {
  const color = sourceColor(source.key);
  const meta = STATUS_META[source.status];
  const s = source.stats;
  const activeCount = source.configs.filter(c => c.active).length;
  const allPaused = source.configs.length > 0 && activeCount === 0;
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  // Show the states this source is set up for; fall back to where its leads are only when it has no markets configured.
  const configured = [...new Set(source.configs.map(c => (c.state ?? '').toUpperCase()).filter(Boolean))].sort();
  const chips = configured.length ? configured : source.states;

  const firstError = source.configs.find(c => c.error)?.error ?? source.schedule?.lastError ?? null;
  const nextSync = source.schedule?.nextSyncAt ? Date.parse(source.schedule.nextSyncAt) : null;

  return (
    <div className={`group rounded-2xl border bg-card transition-all hover:shadow-md ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => onSelect(source.key)} aria-label={selected ? `Deselect ${source.name}` : `Select ${source.name}`} className="mt-1 text-muted-foreground hover:text-foreground">
            {selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
          </button>
          <button type="button" onClick={() => onOpen(source.key)} className="flex-1 min-w-0 flex items-start gap-3 text-left">
            <span className="w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center text-white font-bold text-base shadow-sm" style={{ background: color }}>{source.name.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">{source.name}</span>
                <span title={meta.hint} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${source.status === 'attention' ? 'animate-pulse' : ''}`} />
                  {meta.label}
                </span>
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={11} />
                {source.configs.length ? `${activeCount} of ${source.configs.length} markets active` : 'No markets configured'}
              </span>
            </span>
          </button>
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold text-foreground tabular-nums leading-none">{fmtNum(s.total)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">leads</p>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1" title={configured.length ? 'States this source is configured for' : 'States its leads are in'}>
            {chips.slice(0, 8).map(st => <span key={st} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{st}</span>)}
            {chips.length > 8 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">+{chips.length - 8}</span>}
          </div>
        )}

        {s.total > 0 ? (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-end">
            <div className="space-y-2.5">
              <Bar label="Phone on file" value={s.phone} total={s.real} color={color} />
              <Bar label="Owner verified" value={s.verifiedOwner} total={s.real} color={color} />
              <Bar label="Address verified" value={s.verifiedAddress} total={s.real} color={color} />
            </div>
            <div className="text-right" title="New leads per week, last 8 weeks">
              <Sparkline values={s.weekly} color={color} />
              <p className="text-[11px] text-muted-foreground mt-1"><span className="font-semibold text-foreground">+{fmtNum(s.added7d)}</span> this week</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground rounded-lg bg-muted/60 px-3 py-2">No leads from this source yet. {source.configs.length ? 'It starts filling once its first sync runs.' : 'Add a market to start tracking it.'}</p>
        )}

        {firstError && (
          <p className="mt-3 text-xs text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5 line-clamp-2">{firstError}</p>
        )}

        <div className="mt-4 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Timer size={11} />{intervalLabel(source.schedule?.intervalMs)}</span>
          <span>Last sync {relTime(source.lastSuccess, 'never recorded')}</span>
          {nextSync && nextSync > Date.now() && <span>Next {relTime(source.schedule!.nextSyncAt)}</span>}
        </div>
      </div>

      <div className="border-t border-border px-3 py-2 flex items-center gap-1.5">
        <button type="button" onClick={() => onOpen(source.key)} className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1">
          Details <ChevronRight size={13} />
        </button>
        {canManage && (
          <>
            <button type="button" onClick={() => onAddMarket(source.name)} className="h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1"><Plus size={13} /> Market</button>
            {source.configs.length > 0 && (confirming ? (
              <span className="inline-flex items-center gap-1 ml-auto">
                <span className="text-[11px] text-muted-foreground">{allPaused ? 'Resume' : 'Pause'} {source.configs.length}?</span>
                <button type="button" onClick={() => { setConfirming(false); onToggleAll(source.key, allPaused); }} className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-foreground text-background">Yes</button>
                <button type="button" onClick={() => setConfirming(false)} className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:bg-muted">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="ml-auto h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1">
                {allPaused ? <><Play size={13} /> Resume all</> : <><Pause size={13} /> Pause all</>}
              </button>
            ))}
          </>
        )}
        {!canManage && <Link href="/data-sync" className="ml-auto h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted inline-flex items-center gap-1">Data Sync <ExternalLink size={12} /></Link>}
      </div>
    </div>
  );
}
