'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Download, ExternalLink, Filter, Loader2, X } from 'lucide-react';

export interface Drill { kind: string; id: string }
interface Section { title: string; note?: string; columns?: string[]; rows?: Array<{ cells: Array<string | number | null>; href?: string }>; bars?: Array<{ label: string; value: number; hint?: string }> }
interface Detail { title: string; subtitle?: string; stats: Array<{ label: string; value: string | number }>; sections: Section[]; links: Array<{ label: string; href: string }>; filterState?: string; truncated?: boolean }

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const leadIdOf = (href?: string) => (href && href.startsWith('/lead-profile?id=') ? decodeURIComponent(href.slice('/lead-profile?id='.length)) : null);

function toCsv(s: Section) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [(s.columns ?? []).map(esc).join(','), ...(s.rows ?? []).map(r => r.cells.map(esc).join(','))].join('\n');
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

/** Side panel with the detail behind one Executive Overview panel. Rows that point at a homeowner open that homeowner here. */
export default function DetailDrawer({ drill, days, state, onClose, onFilterState }: { drill: Drill; days: number; state: string; onClose: () => void; onFilterState: (s: string) => void }) {
  const [stack, setStack] = useState<Drill[]>([drill]);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = stack[stack.length - 1];

  useEffect(() => { setStack([drill]); }, [drill]);
  useEffect(() => {
    const ctl = new AbortController(); setLoading(true); setError(null);
    const q = new URLSearchParams({ kind: current.kind, id: current.id, days: String(days) }); if (state) q.set('state', state);
    fetch(`/api/executive/detail?${q}`, { cache: 'no-store', signal: ctl.signal })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); setData(j as Detail); })
      .catch(e => { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setData(null); } })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [current.kind, current.id, days, state]);
  useEffect(() => { closeRef.current?.focus(); const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);

  const open = (d: Drill) => setStack(s => [...s, d]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={data?.title ?? 'Details'}>
      <button aria-label="Close details" onClick={onClose} className="absolute inset-0 bg-black/40 cursor-default" tabIndex={-1} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-3xl bg-card border-l border-border shadow-xl flex flex-col">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-border">
          {stack.length > 1 && <button onClick={() => setStack(s => s.slice(0, -1))} aria-label="Back" className="mt-0.5 p-1 rounded hover:bg-muted"><ArrowLeft size={16} /></button>}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground truncate">{data?.title ?? (loading ? 'Loading...' : 'Details')}</h2>
            {data?.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{data.subtitle}</p>}
          </div>
          {data?.filterState && data.filterState !== state && <button onClick={() => { onFilterState(data.filterState!); onClose(); }} className="h-8 px-2.5 rounded-lg border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"><Filter size={12} />Filter the page to {data.filterState}</button>}
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading && !data && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={22} /></div>}
          {error && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
          {data && (
            <div className={cx('space-y-6', loading && 'opacity-60')}>
              {data.stats.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{data.stats.map(s => <div key={s.label} className="rounded-lg bg-muted/50 px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p><p className="text-base font-bold tabular-nums text-foreground break-words">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p></div>)}</div>}
              {data.sections.filter(s => (s.rows?.length ?? 0) > 0 || (s.bars?.length ?? 0) > 0 || s.columns).map(s => (
                <section key={s.title}>
                  <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                    {s.rows && s.rows.length > 0 && <button onClick={() => download(`${(data.title + '-' + s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, toCsv(s))} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Download size={11} />CSV</button>}</div>
                  {s.note && <p className="text-[11px] text-muted-foreground mb-2">{s.note}</p>}
                  {s.bars && s.bars.length > 0 && (() => { const max = Math.max(1, ...s.bars!.map(b => b.value)); return (
                    <ul className="space-y-1.5">{s.bars!.map(b => <li key={b.label} className="text-xs"><div className="flex justify-between gap-3"><span className="truncate" title={b.label}>{b.label}</span><span className="tabular-nums text-muted-foreground">{b.hint ?? b.value.toLocaleString()}</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5"><div className="h-full bg-primary/70" style={{ width: `${(b.value / max) * 100}%` }} /></div></li>)}</ul>); })()}
                  {s.rows && s.columns && (s.rows.length === 0 ? <p className="text-xs text-muted-foreground">Nothing to show.</p> : (
                    <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs">
                      <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">{s.columns.map(c => <th key={c} className="px-2.5 py-2 font-medium">{c}</th>)}<th className="w-6" /></tr></thead>
                      <tbody>{s.rows.map((r, i) => { const lid = leadIdOf(r.href); return (
                        <tr key={i} onClick={lid ? () => open({ kind: 'lead', id: lid }) : undefined} className={cx('border-t border-border/60', lid && 'cursor-pointer hover:bg-muted/40')}>
                          {r.cells.map((c, j) => <td key={j} className={cx('px-2.5 py-1.5 align-top', j === 0 && 'font-medium text-foreground', typeof c === 'number' && 'tabular-nums')}>{c ?? '-'}</td>)}
                          <td className="px-1">{r.href && (lid ? <ChevronRight size={12} className="text-muted-foreground" /> : <Link href={r.href}><ExternalLink size={11} className="text-muted-foreground" /></Link>)}</td>
                        </tr>); })}</tbody></table></div>))}
                </section>
              ))}
              {data.truncated && <p className="text-[11px] text-muted-foreground">Showing the first rows only. Export the CSV or open the page below for the full list.</p>}
              {data.links.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{data.links.map(l => <Link key={l.href + l.label} href={l.href} className="h-8 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-1 text-primary hover:bg-primary/5">{l.label}<ExternalLink size={11} /></Link>)}</div>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
