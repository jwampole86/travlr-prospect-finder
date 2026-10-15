'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, Download, Info, LayoutGrid, List, Loader2, Lightbulb, Pause, Play, Plus, Radio, RefreshCw, Search, X } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import type { LeadSourceOverview, SourceItem, SourceStatus } from '@/lib/leadSourceTypes';
import KpiStrip from './components/KpiStrip';
import SourceCard from './components/SourceCard';
import SourceTable, { type SortKey } from './components/SourceTable';
import SourceDrawer, { type ConfigPatch } from './components/SourceDrawer';
import AddMarketModal, { type NewMarket } from './components/AddMarketModal';
import { GrowthChart, LeadsBySourceChart } from './components/Charts';
import { fmtNum, patchConfigs, relTime, sourceKeyOf, STATUS_META, toCsv } from './utils';

type StatusFilter = 'all' | SourceStatus;
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'leads', label: 'Most leads' }, { id: 'added', label: 'Newest activity' }, { id: 'contact', label: 'Best contact coverage' },
  { id: 'attention', label: 'Needs attention first' }, { id: 'recent', label: 'Last synced' }, { id: 'name', label: 'Name A to Z' },
];
const STATUS_CHIPS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'healthy', label: 'Healthy' }, { id: 'attention', label: 'Needs attention' }, { id: 'pending', label: 'Waiting' }, { id: 'paused', label: 'Paused' }, { id: 'unmanaged', label: 'No config' },
];

function sorter(sort: SortKey) {
  return (a: SourceItem, b: SourceItem) => {
    switch (sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'added': return b.stats.added7d - a.stats.added7d || b.stats.total - a.stats.total;
      case 'contact': return (b.stats.quality ?? -1) - (a.stats.quality ?? -1);
      case 'attention': return b.attentionCount - a.attentionCount || b.stats.total - a.stats.total;
      case 'recent': return (b.lastSuccess ?? '').localeCompare(a.lastSuccess ?? '');
      default: return b.stats.total - a.stats.total || a.name.localeCompare(b.name);
    }
  };
}

interface Insight { key: string; tone: 'red' | 'blue' | 'amber'; text: string; action?: { label: string; run: () => void } }

export default function LeadSourcesManagerPage() {
  const [data, setData] = useState<LeadSourceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [stateFilter, setStateFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('leads');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(true);
  const [, tick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (fresh = false, quiet = false) => {
    if (!quiet) { fresh ? setRefreshing(true) : setLoading(true); }
    try {
      const res = await authFetch(`/api/lead-sources/overview${fresh ? '?fresh=1' : ''}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not load lead sources.');
      setData(j as LeadSourceOverview);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load lead sources.';
      if (quiet) toast.error(msg); else setError(msg);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { if (addFor !== null) setAddFor(null); else if (openKey) setOpenKey(null); else if (selected.size) setSelected(new Set()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addFor, openKey, selected.size]);

  const canManage = data?.canManage ?? false;

  const visible = useMemo(() => {
    if (!data) return [];
    const t = query.trim().toLowerCase();
    return data.sources
      .filter(s => (status === 'all' || s.status === status)
        && (!stateFilter || s.states.includes(stateFilter))
        && (!t || s.name.toLowerCase().includes(t) || s.states.some(x => x.toLowerCase() === t) || s.configs.some(c => `${c.market} ${c.city ?? ''}`.toLowerCase().includes(t))))
      .sort(sorter(sort));
  }, [data, query, status, stateFilter, sort]);

  const openSource = useMemo(() => data?.sources.find(s => s.key === openKey) ?? null, [data, openKey]);

  const postConfigs = useCallback(async (body: Record<string, unknown>) => {
    const res = await authFetch('/api/lead-sources/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, error: (j.error as string | undefined) ?? 'Something went wrong. Nothing was changed.' };
  }, []);

  const toggleConfigs = useCallback(async (ids: string[], active: boolean, label?: string) => {
    if (!data || !ids.length) return;
    const prev = data;
    setData(patchConfigs(data, new Set(ids), c => ({ ...c, active, health: !active ? 'paused' : c.error ? 'attention' : c.lastSuccess ? 'healthy' : 'pending' })));
    const r = await postConfigs({ action: 'toggle', ids, active });
    if (!r.ok) { setData(prev); toast.error(r.error); return; }
    toast.success(`${active ? 'Resumed' : 'Paused'} ${ids.length === 1 ? (label ?? '1 market') : `${ids.length} markets`}`, { action: { label: 'Undo', onClick: () => toggleConfigs(ids, !active, label) } });
    load(true, true);
  }, [data, postConfigs, load]);

  const toggleSource = useCallback((key: string, active: boolean) => {
    const s = data?.sources.find(x => x.key === key);
    if (s) toggleConfigs(s.configs.map(c => c.id), active, `${s.name}`);
  }, [data, toggleConfigs]);

  const updateConfig = useCallback(async (id: string, patch: ConfigPatch): Promise<string | null> => {
    const r = await postConfigs({ action: 'update', id, ...patch });
    if (!r.ok) return r.error;
    toast.success('Market saved');
    await load(true, true);
    return null;
  }, [postConfigs, load]);

  const createMarket = useCallback(async (m: NewMarket): Promise<string | null> => {
    const r = await postConfigs({ action: 'create', ...m });
    if (!r.ok) return r.error;
    toast.success(`${m.market} added to ${m.sourceName}`);
    setAddFor(null);
    await load(true, true);
    setOpenKey(sourceKeyOf(m.sourceName));
    return null;
  }, [postConfigs, load]);

  const toggleSelect = (key: string) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = (checked: boolean) => setSelected(checked ? new Set(visible.map(s => s.key)) : new Set());
  const selectedSources = useMemo(() => (data?.sources ?? []).filter(s => selected.has(s.key)), [data, selected]);
  const selectedConfigIds = selectedSources.flatMap(s => s.configs.map(c => c.id));
  const bulkAllPaused = selectedConfigIds.length > 0 && selectedSources.every(s => s.configs.every(c => !c.active));

  const exportCsv = (list: SourceItem[]) => {
    const url = URL.createObjectURL(new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `lead-sources-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const insights = useMemo<Insight[]>(() => {
    if (!data) return [];
    const out: Insight[] = [];
    const bad = data.sources.filter(s => s.status === 'attention');
    if (bad.length) out.push({ key: 'attention', tone: 'red', text: `${bad.map(s => s.name).join(', ')} ${bad.length > 1 ? 'have' : 'has'} an error to look at.`, action: { label: 'Show', run: () => setStatus('attention') } });
    const waiting = data.sources.filter(s => s.status === 'pending');
    if (waiting.length) out.push({ key: 'pending', tone: 'blue', text: `${waiting.map(s => s.name).join(', ')} ${waiting.length > 1 ? 'are' : 'is'} configured but no successful sync has been recorded yet.`, action: { label: 'Show', run: () => setStatus('pending') } });
    const lowPhone = data.sources.filter(s => s.stats.real >= 200 && s.stats.phone / s.stats.real < 0.1).sort((a, b) => b.stats.total - a.stats.total)[0];
    if (lowPhone) {
      const phonePct = Math.round((lowPhone.stats.phone / lowPhone.stats.real) * 100);
      out.push({ key: 'phone', tone: 'amber', text: `${lowPhone.name} has ${fmtNum(lowPhone.stats.total)} leads but ${phonePct === 0 ? 'none' : `only ${phonePct}%`} have a phone on file, so they can't be texted or called until they are enriched.`, action: { label: 'Open', run: () => setOpenKey(lowPhone.key) } });
    }
    const loose = data.sources.filter(s => s.status === 'unmanaged' && s.stats.total > 0);
    if (loose.length) out.push({ key: 'unmanaged', tone: 'amber', text: `${loose.map(s => s.name).join(', ')} send${loose.length === 1 ? 's' : ''} leads (${fmtNum(loose.reduce((n, s) => n + s.stats.total, 0))}) but ${loose.length === 1 ? 'has' : 'have'} no market config here.`, action: { label: 'Show', run: () => setStatus('unmanaged') } });
    return out.slice(0, 4);
  }, [data]);

  const filtersOn = status !== 'all' || !!stateFilter || !!query.trim();
  const resetFilters = () => { setStatus('all'); setStateFilter(''); setQuery(''); };
  const toneClass = { red: 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300', blue: 'bg-blue-500/10 border-blue-500/20 text-blue-800 dark:text-blue-300', amber: 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-300' };

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl bg-primary/10 text-primary inline-flex items-center justify-center"><Radio size={22} /></span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Lead Sources Manager</h1>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">Every place your leads come from, with the markets it runs in, how healthy each sync is, and how much usable contact data it actually delivers.</p>
              {data && <p className="text-[11px] text-muted-foreground mt-1.5">Updated {relTime(data.generatedAt, 'just now')} · press <kbd className="px-1 rounded border border-border bg-muted text-[10px]">/</kbd> to search</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => data && exportCsv(visible)} disabled={!data} className="h-9 px-3 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"><Download size={14} /> Export</button>
            <button type="button" onClick={() => load(true)} disabled={refreshing || loading} className="h-9 px-3 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-60"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
            {canManage && <button type="button" onClick={() => setAddFor('')} className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"><Plus size={15} /> Add market</button>}
          </div>
        </header>

        {loading && (
          <div className="space-y-5" aria-busy="true" aria-label="Loading lead sources">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[104px] rounded-2xl bg-muted animate-pulse" />)}</div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 rounded-2xl bg-muted animate-pulse" />)}</div>
          </div>
        )}

        {!loading && error && !data && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <AlertTriangle className="mx-auto text-red-500 mb-2" size={26} />
            <p className="font-semibold text-foreground">{error}</p>
            <button type="button" onClick={() => load()} className="mt-4 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Try again</button>
          </div>
        )}

        {data && (
          <>
            {!canManage && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><Info size={14} /> You can view sources and their health. Only admins can pause, resume or edit markets.</div>
            )}

            <KpiStrip totals={data.totals} status={status} onStatus={setStatus} />

            {insights.length > 0 && (
              <section aria-label="What needs attention" className="space-y-2">
                {insights.map(i => (
                  <div key={i.key} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${toneClass[i.tone]}`}>
                    <Lightbulb size={15} className="shrink-0" />
                    <p className="flex-1 min-w-0">{i.text}</p>
                    {i.action && <button type="button" onClick={i.action.run} className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline">{i.action.label}</button>}
                  </div>
                ))}
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card">
              <button type="button" onClick={() => setShowCharts(v => !v)} aria-expanded={showCharts} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-sm font-semibold text-foreground">Insights</span>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${showCharts ? 'rotate-180' : ''}`} />
              </button>
              {showCharts && (
                <div className="grid lg:grid-cols-2 gap-6 px-4 pb-4">
                  <div><p className="text-xs font-medium text-muted-foreground mb-2">Leads by source, and how many can be contacted by phone</p><LeadsBySourceChart sources={data.sources} onOpen={setOpenKey} /></div>
                  <div><p className="text-xs font-medium text-muted-foreground mb-2">New leads per week, top sources</p><GrowthChart sources={data.sources} /></div>
                </div>
              )}
            </section>

            <section aria-label="Sources" className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sources, markets or states" className="w-full h-10 pl-9 pr-8 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground"><X size={13} /></button>}
                </div>
                <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} aria-label="Filter by state" className="h-10 px-3 rounded-xl border border-border bg-card text-sm">
                  <option value="">All states</option>{data.states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort sources" className="h-10 px-3 rounded-xl border border-border bg-card text-sm">
                  {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <div className="inline-flex rounded-xl border border-border bg-card p-0.5 ml-auto" role="group" aria-label="View">
                  <button type="button" onClick={() => setView('cards')} aria-pressed={view === 'cards'} aria-label="Card view" className={`w-9 h-9 rounded-lg inline-flex items-center justify-center ${view === 'cards' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid size={16} /></button>
                  <button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'} aria-label="Table view" className={`w-9 h-9 rounded-lg inline-flex items-center justify-center ${view === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}><List size={16} /></button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {STATUS_CHIPS.map(c => {
                  const n = c.id === 'all' ? data.sources.length : data.sources.filter(s => s.status === c.id).length;
                  if (c.id !== 'all' && n === 0 && status !== c.id) return null;
                  return (
                    <button key={c.id} type="button" onClick={() => setStatus(c.id)} aria-pressed={status === c.id}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${status === c.id ? 'bg-foreground text-background border-foreground' : 'bg-card text-muted-foreground border-border hover:text-foreground'}`}>
                      {c.id !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[c.id as SourceStatus].dot}`} />}{c.label}<span className="opacity-70 tabular-nums">{n}</span>
                    </button>
                  );
                })}
                {filtersOn && <button type="button" onClick={resetFilters} className="h-8 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear filters</button>}
                <span className="ml-auto text-xs text-muted-foreground">{visible.length} of {data.sources.length} sources</span>
              </div>

              {selected.size > 0 && (
                <div className="sticky top-2 z-20 flex items-center gap-2 flex-wrap rounded-2xl border border-primary/30 bg-card shadow-lg px-3 py-2">
                  <span className="text-sm font-semibold text-foreground">{selected.size} selected</span>
                  <span className="text-xs text-muted-foreground">{selectedConfigIds.length} markets</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {canManage && selectedConfigIds.length > 0 && (
                      <button type="button" onClick={() => toggleConfigs(selectedConfigIds, bulkAllPaused)} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5">
                        {bulkAllPaused ? <><Play size={13} /> Resume markets</> : <><Pause size={13} /> Pause markets</>}
                      </button>
                    )}
                    <button type="button" onClick={() => exportCsv(selectedSources)} className="h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5"><Download size={13} /> Export</button>
                    <button type="button" onClick={() => setSelected(new Set())} className="h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-muted">Clear</button>
                  </div>
                </div>
              )}

              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                  <Search size={26} className="mx-auto text-muted-foreground/60 mb-2" />
                  <p className="font-semibold text-foreground">No sources match</p>
                  <p className="text-sm text-muted-foreground mt-1">Try a different search or clear the filters.</p>
                  <button type="button" onClick={resetFilters} className="mt-4 h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted">Clear filters</button>
                </div>
              ) : view === 'cards' ? (
                <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
                  {visible.map(s => <SourceCard key={s.key} source={s} selected={selected.has(s.key)} canManage={canManage} onSelect={toggleSelect} onOpen={setOpenKey} onToggleAll={toggleSource} onAddMarket={setAddFor} />)}
                </div>
              ) : (
                <SourceTable sources={visible} selected={selected} sort={sort} onSort={setSort} onSelect={toggleSelect} onSelectAll={selectAll} onOpen={setOpenKey} />
              )}
            </section>

            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Syncs themselves run from <Link href="/data-sync" className="underline underline-offset-2">Data Sync</Link>. This page shows and controls which markets each source covers.
            </p>
          </>
        )}
      </div>

      {openSource && <SourceDrawer source={openSource} canManage={canManage} onClose={() => setOpenKey(null)} onToggle={(ids, active) => toggleConfigs(ids, active)} onUpdate={updateConfig} onAddMarket={setAddFor} />}
      <AddMarketModal open={addFor !== null} initialSource={addFor ?? ''} sourceNames={data?.sources.map(s => s.name) ?? []} onClose={() => setAddFor(null)} onCreate={createMarket} />
      {refreshing && <div className="fixed bottom-4 right-4 z-40 h-9 px-3 rounded-full bg-foreground text-background text-xs font-medium inline-flex items-center gap-2 shadow-lg"><Loader2 size={13} className="animate-spin" /> Refreshing</div>}
    </AppLayout>
  );
}
